import type {
	ContextEvidence,
	ContextEvidenceSource,
} from "./context-evidence-contract";
import {
	arrayValue,
	asObject,
	objectValue,
	stringValue,
	subagentStopSchema,
} from "./context-evidence-values";
import { recordNormalizationIssue } from "./context-normalization-issues";
import type { NormalizationIssues } from "./context-normalization-issues";
import type { JsonObject, JsonValue } from "./json-value";

const SINGLE_SOURCE_COUNT = 1;

interface TranscriptIndexes {
	readonly agentByPath: ReadonlyMap<string, ReadonlySet<string>>;
	readonly byUuid: ReadonlyMap<
		string,
		readonly { readonly path: string; readonly row: Readonly<JsonObject> }[]
	>;
	readonly byRequest: ReadonlyMap<string, readonly Readonly<JsonObject>[]>;
	readonly agentCandidatesByRequest: ReadonlyMap<string, ReadonlySet<string>>;
	readonly agentToolOwner: ReadonlyMap<string, ReadonlySet<string>>;
}

function qualifiedIdentity(sessionId: string | null, identity: string): string {
	return `${sessionId ?? "<session-missing>"}\u0000${identity}`;
}

function addCandidate(
	index: Map<string, Set<string>>,
	key: string,
	value: string,
): void {
	const candidates = index.get(key) ?? new Set<string>();
	candidates.add(value);
	index.set(key, candidates);
}

function addRow(
	index: Map<string, Readonly<JsonObject>[]>,
	key: string,
	row: Readonly<JsonObject>,
): void {
	index.set(key, [...(index.get(key) ?? []), row]);
}

type AgentLineageState =
	ContextEvidence["projection"]["agents"][number]["lineageState"];

function agentLineageState(
	conflict: boolean,
	sourceCount: number,
): AgentLineageState {
	if (conflict) {
		return "conflict";
	}
	if (sourceCount > SINGLE_SOURCE_COUNT) {
		return "complete";
	}
	if (sourceCount === SINGLE_SOURCE_COUNT) {
		return "single-source";
	}

	return "missing";
}

interface AgentToolRow {
	readonly row: Readonly<JsonObject>;
	readonly sessionId: string | null;
}

function agentToolId(content: JsonValue): string | undefined {
	const block = asObject(content);
	return block !== undefined &&
		stringValue(block, "type") === "tool_use" &&
		stringValue(block, "name") === "Agent"
		? stringValue(block, "id")
		: undefined;
}
function indexAgentToolUses(
	{ row, sessionId }: AgentToolRow,
	pathCandidates: ReadonlySet<string>,
	agentToolOwner: Map<string, Set<string>>,
): void {
	const message = objectValue(row, "message");
	if (message === undefined) {
		return;
	}
	for (const content of arrayValue(message, "content")) {
		const toolUseId = agentToolId(content);
		if (toolUseId !== undefined) {
			for (const agentId of pathCandidates) {
				addCandidate(
					agentToolOwner,
					qualifiedIdentity(sessionId, toolUseId),
					agentId,
				);
			}
		}
	}
}
class TranscriptIndexBuilder {
	private readonly agentByPath = new Map<string, Set<string>>([
		["transcripts/main.jsonl", new Set(["main"])],
	]);
	private readonly byUuid = new Map<
		string,
		{ path: string; row: Readonly<JsonObject> }[]
	>();
	private readonly byRequest = new Map<string, Readonly<JsonObject>[]>();
	private readonly agentCandidatesByRequest = new Map<string, Set<string>>();
	private readonly agentToolOwner = new Map<string, Set<string>>();
	public constructor(private readonly issues: Readonly<NormalizationIssues>) {}
	private indexSubagentStop(hook: Readonly<JsonObject>): void {
		if (stringValue(hook, "hook_event_name") !== "SubagentStop") {
			return;
		}
		const parsed = subagentStopSchema.safeParse(hook);
		if (!parsed.success) {
			recordNormalizationIssue(this.issues, {
				detail: "invalid SubagentStop record",
				record: hook,
				stream: "hooks",
			});
			return;
		}
		addCandidate(
			this.agentByPath,
			parsed.data.agent_transcript_path,
			parsed.data.agent_id,
		);
	}
	private indexRequest(
		{ row, sessionId }: AgentToolRow,
		pathCandidates: ReadonlySet<string>,
	): void {
		const requestId = stringValue(row, "requestId");
		if (requestId === undefined) {
			return;
		}
		const key = qualifiedIdentity(sessionId, requestId);
		addRow(this.byRequest, key, row);
		for (const agentId of pathCandidates) {
			addCandidate(this.agentCandidatesByRequest, key, agentId);
		}
	}
	private indexTranscriptRow(path: string, row: Readonly<JsonObject>): void {
		const pathCandidates = this.agentByPath.get(path) ?? new Set<string>();
		const sessionId = stringValue(row, "sessionId") ?? null;
		const uuid = stringValue(row, "uuid");
		if (uuid !== undefined) {
			const key = qualifiedIdentity(sessionId, uuid);
			this.byUuid.set(key, [...(this.byUuid.get(key) ?? []), { path, row }]);
		}
		this.indexRequest({ row, sessionId }, pathCandidates);
		indexAgentToolUses({ row, sessionId }, pathCandidates, this.agentToolOwner);
	}
	public build(files: ContextEvidenceSource["files"]): TranscriptIndexes {
		for (const hook of files.hooks) {
			this.indexSubagentStop(hook);
		}
		for (const [path, rows] of Object.entries(files.transcripts)) {
			for (const row of rows) {
				this.indexTranscriptRow(path, row);
			}
		}
		return {
			agentByPath: this.agentByPath,
			agentCandidatesByRequest: this.agentCandidatesByRequest,
			agentToolOwner: this.agentToolOwner,
			byRequest: this.byRequest,
			byUuid: this.byUuid,
		};
	}
}
function transcriptIndexes(
	files: ContextEvidenceSource["files"],
	issues: Readonly<NormalizationIssues>,
): TranscriptIndexes {
	return new TranscriptIndexBuilder(issues).build(files);
}

export {
	transcriptIndexes,
	qualifiedIdentity,
	addCandidate,
	agentLineageState,
	addRow,
};
export type { TranscriptIndexes };
