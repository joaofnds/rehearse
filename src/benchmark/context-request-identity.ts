import { objectValue, stringValue } from "./context-evidence-values";
import type { RequestEvidence } from "./context-request-usage";
import { addCandidate, qualifiedIdentity } from "./context-transcript-index";
import type { JsonObject } from "./json-value";

const PREFIX_START_INDEX = 0;
const REQUEST_IDENTITY_SEPARATOR_CODE_UNITS = 1;
const SINGLE_DISTINCT_VALUE_COUNT = 1;

type RequestRoute = "otel" | "span" | "transcript";

interface RequestIdentityMetadata {
	readonly sessionId: string | null;
	readonly requestId: string;
	readonly clientRequestIds: Set<string>;
	readonly routes: Set<RequestRoute>;
	identityConflict: boolean;
}

interface RequestIdentity {
	readonly sessionId: string | null;
	readonly requestId: string;
}

function identityParts(key: string): RequestIdentity {
	const separator = key.indexOf("\u0000");
	const session = key.slice(PREFIX_START_INDEX, separator);

	return {
		requestId: key.slice(separator + REQUEST_IDENTITY_SEPARATOR_CODE_UNITS),
		sessionId: session === "<session-missing>" ? null : session,
	};
}

function requestIdentityState(
	metadata: Readonly<RequestIdentityMetadata>,
): RequestEvidence["identityState"] {
	if (metadata.identityConflict) {
		return "conflict";
	}
	if (metadata.sessionId === null) {
		return "missing";
	}

	return metadata.routes.size > SINGLE_DISTINCT_VALUE_COUNT
		? "complete"
		: "single-source";
}

function serverAliases(
	logs: readonly Readonly<JsonObject>[],
): ReadonlyMap<string, ReadonlySet<string>> {
	const serverIdsByClient = new Map<string, Set<string>>();
	for (const log of logs) {
		const attributes = objectValue(log, "attributes");
		if (
			attributes !== undefined &&
			stringValue(attributes, "event.name") === "api_request"
		) {
			const sessionId = stringValue(attributes, "session.id") ?? null;
			const serverId = stringValue(attributes, "request_id");
			const clientId = stringValue(attributes, "client_request_id");
			if (serverId !== undefined && clientId !== undefined) {
				addCandidate(
					serverIdsByClient,
					qualifiedIdentity(sessionId, clientId),
					serverId,
				);
			}
		}
	}

	return serverIdsByClient;
}

export { serverAliases, identityParts, requestIdentityState };
export type { RequestRoute, RequestIdentityMetadata };
