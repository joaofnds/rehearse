import { describe, expect, it } from "bun:test";

import { normalizeContextEvidence } from "#benchmark/context-evidence";

import { expectedProjection } from "./context-evidence-expected-test-fixture";
import {
	objectAt,
	required,
	sourceFixture,
	sourceWithRequestAliases,
} from "./context-evidence-test-support";

async function projectsProviderRequestsAndLineage(): Promise<void> {
	const source = await sourceFixture();

	const evidence = normalizeContextEvidence(source);

	expect(evidence.projection).toEqual(expectedProjection);
}

const SECOND_REQUEST_INDEX = 1;

const MAIN_AGENT_LOG_ROW_INDEX = 0;

async function partitionsRepeatedRequestIdentitiesBySession(): Promise<void> {
	const source = await sourceFixture();
	const mainLog = required(
		source.files.otelLogs[MAIN_AGENT_LOG_ROW_INDEX],
		"fixture has no main log",
	);
	const attributes = objectAt(mainLog, "attributes");
	source.files.otelLogs.push({
		...mainLog,
		attributes: { ...attributes, "session.id": "session-2" },
		capture_ordinal: 90,
	});

	const evidence = normalizeContextEvidence(source);
	const repeated = evidence.projection.requests.filter(
		(request) => request.requestId === "req-main-1",
	);

	expect(repeated.map(({ sessionId }) => sessionId)).toEqual([
		"session-1",
		"session-2",
	]);
	expect(repeated[SECOND_REQUEST_INDEX]).toMatchObject({
		agentId: null,
		attributionState: "missing",
		identityState: "single-source",
	});
}

const EXPECTED_CHILD_REQUEST_COUNT = 1;

const FIRST_CHILD_REQUEST_INDEX = 0;

async function joinsServerAndClientRequestAliasesWithoutLosingTheClientIdentity(): Promise<void> {
	const source = await sourceWithRequestAliases();

	const evidence = normalizeContextEvidence(source);
	const childRequests = evidence.projection.requests.filter(
		(request) => request.requestId === "req-child-1",
	);

	expect(childRequests).toHaveLength(EXPECTED_CHILD_REQUEST_COUNT);
	expect(childRequests[FIRST_CHILD_REQUEST_INDEX]).toMatchObject({
		clientRequestIds: ["client-child-1"],
		identityState: "complete",
		otelOccurrences: 2,
		uniqueOtelOccurrences: 1,
		usageState: "complete",
	});
}

const FIRST_TRANSCRIPT_RECORD_INDEX = 0;

async function keepsAnUnmappedTranscriptPathExplicitlyUnattributed(): Promise<void> {
	const source = await sourceFixture();
	const mainLog = required(
		source.files.otelLogs[MAIN_AGENT_LOG_ROW_INDEX],
		"fixture has no main log",
	);
	const mainRow = required(
		source.files.transcripts["transcripts/main.jsonl"]?.[
			FIRST_TRANSCRIPT_RECORD_INDEX
		],
		"fixture has no main transcript row",
	);
	const logAttributes = objectAt(mainLog, "attributes");
	source.files.otelLogs.push({
		...mainLog,
		attributes: { ...logAttributes, request_id: "req-orphan-1" },
		capture_ordinal: 91,
	});
	source.files.transcripts["transcripts/unmapped.jsonl"] = [
		{ ...mainRow, requestId: "req-orphan-1", uuid: "orphan-row" },
	];

	const evidence = normalizeContextEvidence(source);

	expect(
		evidence.projection.requests.find(
			(request) => request.requestId === "req-orphan-1",
		),
	).toMatchObject({
		agentId: null,
		attributionState: "missing",
		identityState: "complete",
	});
	expect(evidence.projection.accountingIssues).toContain("request-attribution");
}

const CHILD_AGENT_STREAM_ROW_INDEX = 1;

async function marksConflictingStreamParentIdentitiesInsteadOfKeepingTheLastOne(): Promise<void> {
	const source = await sourceFixture();
	const childMessage = required(
		source.files.stream[CHILD_AGENT_STREAM_ROW_INDEX],
		"fixture has no child message",
	);
	source.files.stream.push({
		...childMessage,
		capture_ordinal: 99,
		parent_tool_use_id: "tool-agent-2",
	});

	const evidence = normalizeContextEvidence(source);

	expect(
		evidence.projection.agents.find(
			(agent) => agent.agentId === "agent-review-1",
		),
	).toEqual({
		agentId: "agent-review-1",
		lineageState: "conflict",
		parentAgentId: null,
		sources: ["stream"],
	});
}

const CHILD_STOP_HOOK_INDEX = 7;

async function preservesConflictingTranscriptPathAttribution(): Promise<void> {
	const source = await sourceFixture();
	const childStop = required(
		source.files.hooks[CHILD_STOP_HOOK_INDEX],
		"fixture has no child stop",
	);
	source.files.hooks.push({
		...childStop,
		agent_id: "agent-conflicting-1",
		capture_ordinal: 92,
	});

	const evidence = normalizeContextEvidence(source);

	expect(
		evidence.projection.requests.find(
			(request) => request.requestId === "req-child-1",
		),
	).toMatchObject({ agentId: null, attributionState: "conflict" });
}

describe(normalizeContextEvidence.name, () => {
	it(
		"derives joined requests, nested lineage and explicit loss states from provider-shaped sources",
		projectsProviderRequestsAndLineage,
	);

	it(
		"partitions repeated request identities by session",
		partitionsRepeatedRequestIdentitiesBySession,
	);

	it(
		"joins server and client request aliases without losing the client identity",
		joinsServerAndClientRequestAliasesWithoutLosingTheClientIdentity,
	);

	it(
		"keeps an unmapped transcript path explicitly unattributed",
		keepsAnUnmappedTranscriptPathExplicitlyUnattributed,
	);

	it(
		"marks conflicting stream parent identities instead of keeping the last one",
		marksConflictingStreamParentIdentitiesInsteadOfKeepingTheLastOne,
	);

	it(
		"preserves conflicting transcript-path attribution",
		preservesConflictingTranscriptPathAttribution,
	);
});
