import {
	numberValue,
	objectValue,
	stringValue,
} from "./context-evidence-values";
import { recordNormalizationIssue } from "./context-normalization-issues";
import type { NormalizationIssues } from "./context-normalization-issues";
import {
	addCandidate,
	addRow,
	qualifiedIdentity,
} from "./context-transcript-index";
import type { JsonObject } from "./json-value";

const SINGLE_IDENTITY_CANDIDATE_COUNT = 1;

interface OtelRequestCollection {
	readonly byRequest: ReadonlyMap<string, readonly Readonly<JsonObject>[]>;
	readonly keyless: readonly {
		readonly record: Readonly<JsonObject>;
		readonly index: number;
	}[];
	readonly clientRequestIds: ReadonlyMap<string, ReadonlySet<string>>;
	readonly identityConflicts: ReadonlySet<string>;
}

interface RequestLog {
	readonly log: Readonly<JsonObject>;
	readonly attributes: Readonly<JsonObject>;
	readonly index: number;
}
interface LogIdentity {
	readonly sessionId: string | null;
	readonly serverId: string | undefined;
	readonly clientId: string | undefined;
}
class OtelRequests {
	private readonly byRequest = new Map<string, Readonly<JsonObject>[]>();
	private readonly keyless: {
		readonly record: Readonly<JsonObject>;
		readonly index: number;
	}[] = [];
	private readonly clientRequestIds = new Map<string, Set<string>>();
	private readonly identityConflicts = new Set<string>();
	public constructor(
		private readonly aliases: ReadonlyMap<string, ReadonlySet<string>>,
		private readonly issues: Readonly<NormalizationIssues>,
	) {}
	private recordIdentity(
		log: Readonly<JsonObject>,
		{ sessionId, serverId, clientId }: LogIdentity,
	): void {
		const aliasCandidates =
			clientId === undefined
				? new Set<string>()
				: (this.aliases.get(qualifiedIdentity(sessionId, clientId)) ??
					new Set<string>());
		const [aliasedServerId] = aliasCandidates;
		const requestId = serverId ?? aliasedServerId ?? clientId;
		if (requestId === undefined) {
			return;
		}
		const key = qualifiedIdentity(sessionId, requestId);
		addRow(this.byRequest, key, log);
		this.recordClientIdentity(key, clientId, aliasCandidates);
	}
	private recordClientIdentity(
		key: string,
		clientId: string | undefined,
		aliasCandidates: ReadonlySet<string>,
	): void {
		if (clientId !== undefined) {
			addCandidate(this.clientRequestIds, key, clientId);
		}
		if (aliasCandidates.size > SINGLE_IDENTITY_CANDIDATE_COUNT) {
			this.identityConflicts.add(key);
		}
	}
	private collectRequest({ log, attributes, index }: RequestLog): void {
		const sessionId = stringValue(attributes, "session.id") ?? null;
		const serverId = stringValue(attributes, "request_id");
		const clientId = stringValue(attributes, "client_request_id");
		if (numberValue(log, "capture_ordinal") === undefined) {
			recordNormalizationIssue(this.issues, {
				detail: "api_request record has no valid capture ordinal",
				record: log,
				stream: "otelLogs",
			});
		}
		if (serverId === undefined && clientId === undefined) {
			this.keyless.push({ index, record: log });
			return;
		}
		this.recordIdentity(log, { clientId, serverId, sessionId });
	}
	private collectLog(index: number, log: Readonly<JsonObject>): void {
		const attributes = objectValue(log, "attributes");
		if (attributes === undefined) {
			this.recordMissingAttributes(log);
			return;
		}
		if (stringValue(attributes, "event.name") !== "api_request") {
			return;
		}
		this.collectRequest({ attributes, index, log });
	}
	private recordMissingAttributes(log: Readonly<JsonObject>): void {
		if (stringValue(log, "body") === "claude_code.api_request") {
			recordNormalizationIssue(this.issues, {
				detail: "api_request record has no attributes",
				record: log,
				stream: "otelLogs",
			});
		}
	}
	public collectAll(
		logs: readonly Readonly<JsonObject>[],
	): OtelRequestCollection {
		for (const [index, log] of logs.entries()) {
			this.collectLog(index, log);
		}
		return {
			byRequest: this.byRequest,
			clientRequestIds: this.clientRequestIds,
			identityConflicts: this.identityConflicts,
			keyless: this.keyless,
		};
	}
}
function collectOtelRequests(
	logs: readonly Readonly<JsonObject>[],
	aliases: ReadonlyMap<string, ReadonlySet<string>>,
	issues: Readonly<NormalizationIssues>,
): OtelRequestCollection {
	return new OtelRequests(aliases, issues).collectAll(logs);
}
export { collectOtelRequests as default };

export type { OtelRequestCollection };
