import type {
	ContextEvidence,
	ContextEvidenceSource,
} from "./context-evidence-contract";
import {
	nullableStringValue,
	objectValue,
	stringValue,
} from "./context-evidence-values";
import {
	addCandidate,
	agentLineageState,
	qualifiedIdentity,
} from "./context-transcript-index";
import type { TranscriptIndexes } from "./context-transcript-index";
import type { JsonObject } from "./json-value";

const SINGLE_LINEAGE_CANDIDATE_COUNT = 1;

const EMPTY_LOOKUP_SIZE = 0;

interface ParentCandidates {
	readonly streamParents: Map<string, Set<string>>;
	readonly traceParents: Map<string, Set<string>>;
}
interface StreamLineage {
	readonly indexes: TranscriptIndexes;
	readonly parents: Map<string, Set<string>>;
}
function streamParentTools(
	row: Readonly<JsonObject>,
	indexes: TranscriptIndexes,
):
	| {
			readonly transcripts: readonly {
				readonly path: string;
				readonly row: Readonly<JsonObject>;
			}[];
			readonly parents: ReadonlySet<string>;
	  }
	| undefined {
	const sessionId = stringValue(row, "session_id") ?? null;
	const uuid = stringValue(row, "uuid");
	const parentTool = nullableStringValue(row, "parent_tool_use_id");
	if (uuid === undefined || parentTool === undefined || parentTool === null) {
		return undefined;
	}
	const transcripts = indexes.byUuid.get(qualifiedIdentity(sessionId, uuid));
	const parents = indexes.agentToolOwner.get(
		qualifiedIdentity(sessionId, parentTool),
	);
	return transcripts === undefined || parents === undefined
		? undefined
		: { parents, transcripts };
}
function indexStreamParents(
	row: Readonly<JsonObject>,
	{ indexes, parents }: StreamLineage,
): void {
	const lineage = streamParentTools(row, indexes);
	if (lineage === undefined) {
		return;
	}
	for (const transcript of lineage.transcripts) {
		for (const child of indexes.agentByPath.get(transcript.path) ??
			new Set<string>()) {
			for (const parent of lineage.parents) {
				addCandidate(parents, child, parent);
			}
		}
	}
}
function indexTraceParents(
	span: Readonly<JsonObject>,
	parents: Map<string, Set<string>>,
	agentIds: Set<string>,
): void {
	const attributes = objectValue(span, "attributes");
	if (attributes === undefined) {
		return;
	}
	const agentId = stringValue(attributes, "agent_id");
	const parentId = stringValue(attributes, "parent_agent_id");
	if (agentId !== undefined) {
		agentIds.add(agentId);
	}
	if (agentId !== undefined && parentId !== undefined) {
		addCandidate(parents, agentId, parentId);
	}
}
function lineageSources(
	streamCandidates: ReadonlySet<string>,
	traceCandidates: ReadonlySet<string>,
): ("stream" | "trace")[] {
	const sources: ("stream" | "trace")[] = [];
	if (streamCandidates.size > EMPTY_LOOKUP_SIZE) {
		sources.push("stream");
	}
	if (traceCandidates.size > EMPTY_LOOKUP_SIZE) {
		sources.push("trace");
	}
	return sources;
}
function normalizedAgent(
	agentId: string,
	{ streamParents, traceParents }: ParentCandidates,
): ContextEvidence["projection"]["agents"][number] {
	const streamCandidates = streamParents.get(agentId) ?? new Set<string>();
	const traceCandidates = traceParents.get(agentId) ?? new Set<string>();
	const parentCandidates = new Set([...streamCandidates, ...traceCandidates]);
	const conflict = parentCandidates.size > SINGLE_LINEAGE_CANDIDATE_COUNT;
	const sources = lineageSources(streamCandidates, traceCandidates);
	const parentAgentId = conflict
		? null
		: (parentCandidates.values().next().value ?? null);
	const lineageState = agentLineageState(conflict, sources.length);
	return { agentId, lineageState, parentAgentId, sources };
}
function hookAgentIds(
	hooks: ContextEvidenceSource["files"]["hooks"],
): Set<string> {
	const agentIds = new Set<string>();
	for (const hook of hooks) {
		const agentId = stringValue(hook, "agent_id");
		if (agentId !== undefined) {
			agentIds.add(agentId);
		}
	}
	return agentIds;
}
function normalizedAgents(
	files: ContextEvidenceSource["files"],
	indexes: TranscriptIndexes,
): ContextEvidence["projection"]["agents"] {
	const streamParents = new Map<string, Set<string>>();
	for (const row of files.stream) {
		indexStreamParents(row, { indexes, parents: streamParents });
	}
	const traceParents = new Map<string, Set<string>>();
	const agentIds = hookAgentIds(files.hooks);
	for (const span of files.otelSpans) {
		indexTraceParents(span, traceParents, agentIds);
	}
	return [...agentIds]
		.toSorted()
		.map((agentId) =>
			normalizedAgent(agentId, { streamParents, traceParents }),
		);
}
export { normalizedAgents as default };
