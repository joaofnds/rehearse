import {
	contextEvidenceSourceSchema,
	normalizeContextEvidence,
} from "#benchmark/context-evidence";
import type {
	ContextEvidence,
	ContextEvidenceSource,
} from "#benchmark/context-evidence-contract";
import { jsonObjectSchema } from "#benchmark/json-value";
import type { JsonObject } from "#benchmark/json-value";

import { rates } from "./context-evidence-rate-test-fixture";

const REVISED_REQUEST_ROW_COUNT = 1;
const NEXT_REQUEST_OFFSET = 1;

const CHILD_SERVER_LOG_ROW_INDEX = 1;
const CHILD_CLIENT_LOG_ROW_INDEX = 2;
const FIRST_PARSED_EVIDENCE_ROW_INDEX = 0;
const PREFIX_START_INDEX = 0;

function transcriptSourceWithMessage(
	message: Readonly<JsonObject>,
): ReturnType<typeof contextEvidenceSourceSchema.parse> {
	return contextEvidenceSourceSchema.parse({
		capture: {
			capturedAt: "2026-09-14T00:00:00.000Z",
			cliVersion: "0.0.0",
			flags: [],
			provider: "synthetic",
			telemetry: {},
		},
		files: {
			coverage: [{ state: "unavailable", stream: "otelLogs" }],
			hooks: [],
			otelLogs: [],
			otelSpans: [],
			rawApiBodies: [],
			stream: [],
			transcripts: {
				"transcripts/main.jsonl": [
					{
						message,
						requestId: "req-transcript-1",
						sessionId: "session-1",
						type: "assistant",
						uuid: "message-1",
					},
				],
			},
		},
		kind: "context-evidence-source",
		schemaVersion: 1,
	});
}

async function sourceFixture(): Promise<
	ReturnType<typeof contextEvidenceSourceSchema.parse>
> {
	return contextEvidenceSourceSchema.parse(
		await Bun.file(
			new URL("__fixtures__/context-evidence-source.json", import.meta.url),
		).json(),
	);
}

function objectAt(record: Readonly<JsonObject>, key: string): JsonObject {
	return jsonObjectSchema.parse(record[key]);
}

function pricedCosts(evidence: ContextEvidence): readonly number[] {
	return evidence.projection.requests.flatMap((request) =>
		request.pricing.state === "complete"
			? [request.pricing.calculatedCostUsd]
			: [],
	);
}

function required<T>(value: T | undefined, message: string): T {
	if (value === undefined) {
		throw new Error(message);
	}

	return value;
}

function transcriptOnlySource(
	usage?: Readonly<JsonObject>,
): ReturnType<typeof contextEvidenceSourceSchema.parse> {
	return transcriptSourceWithMessage(
		usage === undefined
			? { model: "claude-sonnet-5" }
			: { model: "claude-sonnet-5", usage },
	);
}

const fullUsage = {
	cache_creation: {
		ephemeral_1h_input_tokens: 40,
		ephemeral_5m_input_tokens: 400,
	},
	cache_creation_input_tokens: 440,
	cache_read_input_tokens: 3300,
	input_tokens: 11,
	output_tokens: 22,
};

function alsoObservedByOtel(
	tokenAttributes: Readonly<JsonObject>,
): ReturnType<typeof contextEvidenceSourceSchema.parse> {
	const source = transcriptOnlySource(fullUsage);
	source.files.otelLogs.push({
		attributes: {
			cost_usd: 0.04,
			"event.name": "api_request",
			"event.sequence": 1,
			model: "claude-sonnet-5",
			"prompt.id": "prompt-1",
			request_id: "req-transcript-1",
			"session.id": "session-1",
			...tokenAttributes,
		},
		body: "claude_code.api_request",
		capture_ordinal: 1,
	});

	return source;
}

async function sourceWithRequestAliases(): Promise<ContextEvidenceSource> {
	const source = await sourceFixture();

	const serverLog = required(
		source.files.otelLogs[CHILD_SERVER_LOG_ROW_INDEX],
		"fixture has no child log",
	);

	const clientLog = required(
		source.files.otelLogs[CHILD_CLIENT_LOG_ROW_INDEX],
		"fixture has no duplicate child log",
	);

	const serverAttributes = objectAt(serverLog, "attributes");

	const clientAttributes = objectAt(clientLog, "attributes");

	const { request_id: _requestId, ...clientOnlyAttributes } = clientAttributes;

	source.files.otelLogs[CHILD_SERVER_LOG_ROW_INDEX] = {
		...serverLog,
		attributes: {
			...serverAttributes,
			client_request_id: "client-child-1",
		},
	};

	source.files.otelLogs[CHILD_CLIENT_LOG_ROW_INDEX] = {
		...clientLog,
		attributes: {
			...clientOnlyAttributes,
			client_request_id: "client-child-1",
		},
	};
	return source;
}

async function sourceWithCacheSplit(
	cache: Readonly<JsonObject> | undefined,
): Promise<ContextEvidenceSource> {
	const source = await sourceFixture();

	const transcriptPath = "transcripts/subagents/agent-agent-review-1.jsonl";

	const rows = source.files.transcripts[transcriptPath] ?? [];

	const child = required(
		rows[FIRST_PARSED_EVIDENCE_ROW_INDEX],
		"fixture has no child transcript",
	);

	const message = objectAt(child, "message");

	const usage = objectAt(message, "usage");

	const { cache_creation: _cacheCreation, ...usageWithoutCache } = usage;

	const revisedUsage =
		cache === undefined
			? usageWithoutCache
			: { ...usageWithoutCache, cache_creation: cache };

	return contextEvidenceSourceSchema.parse({
		...source,
		files: {
			...source.files,
			transcripts: {
				...source.files.transcripts,
				[transcriptPath]: [
					{ ...child, message: { ...message, usage: revisedUsage } },
					...rows.slice(REVISED_REQUEST_ROW_COUNT),
				],
			},
		},
	});
}

interface PricedEvidenceFixture {
	readonly evidence: ContextEvidence;
	readonly pricedRequest: ContextEvidence["projection"]["requests"][number];
	readonly pricing: Extract<
		ContextEvidence["projection"]["requests"][number]["pricing"],
		{ state: "complete" }
	>;
	readonly beforePriced: ContextEvidence["projection"]["requests"];
	readonly afterPriced: ContextEvidence["projection"]["requests"];
	readonly requestWithoutUsage: Omit<
		ContextEvidence["projection"]["requests"][number],
		"usage"
	>;
}

async function pricedEvidenceFixture(): Promise<PricedEvidenceFixture> {
	const evidence = normalizeContextEvidence(await sourceFixture(), rates);

	const pricedRequest = required(
		evidence.projection.requests.find(
			(request) => request.pricing.state === "complete",
		),
		"fixture has no priced request",
	);

	const pricing = required(
		pricedRequest.pricing.state === "complete"
			? pricedRequest.pricing
			: undefined,
		"fixture pricing is incomplete",
	);

	const pricedIndex = evidence.projection.requests.indexOf(pricedRequest);

	const beforePriced = evidence.projection.requests.slice(
		PREFIX_START_INDEX,
		pricedIndex,
	);

	const afterPriced = evidence.projection.requests.slice(
		pricedIndex + NEXT_REQUEST_OFFSET,
	);

	const { usage: _usage, ...requestWithoutUsage } = pricedRequest;
	return {
		afterPriced,
		beforePriced,
		evidence,
		pricedRequest,
		pricing,
		requestWithoutUsage,
	};
}
export {
	transcriptSourceWithMessage,
	sourceFixture,
	objectAt,
	pricedCosts,
	required,
	transcriptOnlySource,
	fullUsage,
	alsoObservedByOtel,
	sourceWithRequestAliases,
	sourceWithCacheSplit,
	pricedEvidenceFixture,
};
