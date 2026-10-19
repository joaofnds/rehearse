import type {
	ContextEvidence,
	ContextEvidenceSource,
	ContextRateCatalog,
} from "./context-evidence-contract";
import { numberValue, objectValue } from "./context-evidence-values";
import type { NormalizationIssues } from "./context-normalization-issues";
import type { OtelRequestCollection } from "./context-otel-requests";
import collectOtelRequests from "./context-otel-requests";
import {
	identityParts,
	requestIdentityState,
	serverAliases,
} from "./context-request-identity";
import type {
	RequestIdentityMetadata,
	RequestRoute,
} from "./context-request-identity";
import type { ModelEvidence } from "./context-request-pricing";
import {
	requestModel,
	requestPricing,
	ttlSplit,
} from "./context-request-pricing";
import {
	resolveRequestUsage,
	uniqueRequestLogs,
	usageFrom,
	usageWithSplit,
} from "./context-request-usage";
import type { RequestEvidence } from "./context-request-usage";
import type { SpanRequestCollection } from "./context-span-requests";
import collectRequestSpans from "./context-span-requests";
import type { TranscriptIndexes } from "./context-transcript-index";
import type { JsonObject } from "./json-value";

const SINGLE_ATTRIBUTION_CANDIDATE_COUNT = 1;
const NO_ATTRIBUTION_CANDIDATES = 0;

const SINGLE_ITEM_COUNT = 1;
const NO_KEYLESS_OCCURRENCES = 0;
const ORDINAL_BASE = 1;

interface NormalizedRequestInput {
	readonly sessionId: string | null;
	readonly requestId: string;
	readonly clientRequestIds: readonly string[];
	readonly identityState: RequestEvidence["identityState"];
	readonly logs: readonly Readonly<JsonObject>[];
	readonly transcriptRows: readonly Readonly<JsonObject>[];
	readonly spans: readonly Readonly<JsonObject>[];
	readonly candidateSet: ReadonlySet<string>;
	readonly rates: ContextRateCatalog | undefined;
}

interface RequestMetering {
	readonly distinctCount: number;
	readonly usage: RequestEvidence["usage"];
	readonly usageRoute: RequestEvidence["usageRoute"];
	readonly usageState: RequestEvidence["usageState"];
	readonly modelEvidence: ModelEvidence;
	readonly pricing: RequestEvidence["pricing"];
	readonly providerCostUsd: number | undefined;
}
function requestLogAttributes(
	distinct: readonly Readonly<JsonObject>[],
): Readonly<JsonObject> | undefined {
	const [firstDistinct] = distinct;
	return distinct.length === SINGLE_ITEM_COUNT && firstDistinct !== undefined
		? objectValue(firstDistinct, "attributes")
		: undefined;
}
function requestMetering(
	input: Readonly<NormalizedRequestInput>,
): RequestMetering {
	const distinct = uniqueRequestLogs(input.logs);
	const attributes = requestLogAttributes(distinct);
	const split = ttlSplit(input.transcriptRows);
	const resolved = resolveRequestUsage(
		{ distinctCount: distinct.length, logCount: input.logs.length },
		attributes === undefined ? undefined : usageFrom(attributes),
		input.transcriptRows,
	);
	const usage = usageWithSplit(resolved.usage, split);
	const modelEvidence = requestModel(
		distinct,
		input.transcriptRows,
		input.spans,
	);
	return {
		distinctCount: distinct.length,
		modelEvidence,
		pricing: requestPricing(
			{ usage, usageState: resolved.state },
			{ model: modelEvidence.model, modelState: modelEvidence.state },
			{ rates: input.rates, split },
		),
		providerCostUsd:
			attributes === undefined
				? undefined
				: numberValue(attributes, "cost_usd"),
		usage,
		usageRoute: resolved.route,
		usageState: resolved.state,
	};
}
function requestAgent(candidateSet: ReadonlySet<string>): string | null {
	const [onlyCandidate] = candidateSet;
	return candidateSet.size === SINGLE_ATTRIBUTION_CANDIDATE_COUNT
		? (onlyCandidate ?? null)
		: null;
}
function assignRequestAttribution(
	request: RequestEvidence,
	candidateSet: ReadonlySet<string>,
): void {
	if (candidateSet.size === NO_ATTRIBUTION_CANDIDATES) {
		Object.assign(request, { attributionState: "missing" as const });
	} else if (candidateSet.size > SINGLE_ATTRIBUTION_CANDIDATE_COUNT) {
		Object.assign(request, { attributionState: "conflict" as const });
	}
}
function normalizedRequest(
	input: Readonly<NormalizedRequestInput>,
): RequestEvidence {
	const metering = requestMetering(input);
	const request = {
		agentId: requestAgent(input.candidateSet),
		clientRequestIds: [...input.clientRequestIds].toSorted(),
		identityState: input.identityState,
		model: metering.modelEvidence.model,
		modelState: metering.modelEvidence.state,
		otelOccurrences: input.logs.length,
		pricing: metering.pricing,
		requestId: input.requestId,
		sessionId: input.sessionId,
		transcriptOccurrences: input.transcriptRows.length,
		uniqueOtelOccurrences: metering.distinctCount,
		usageState: metering.usageState,
	};
	assignRequestAttribution(request, input.candidateSet);
	if (metering.usage !== undefined) {
		Object.assign(request, {
			usage: metering.usage,
			usageRoute: metering.usageRoute,
		});
	}
	if (metering.providerCostUsd !== undefined) {
		Object.assign(request, { providerCostUsd: metering.providerCostUsd });
	}
	return request;
}

interface NormalizedRequests {
	readonly requests: ContextEvidence["projection"]["requests"];
	readonly keylessRequests: ContextEvidence["projection"]["keylessRequests"];
	readonly accountingIssues: ContextEvidence["projection"]["accountingIssues"];
}

function requestAccountingIssues(
	requests: ContextEvidence["projection"]["requests"],
	keylessCount: number,
): ContextEvidence["projection"]["accountingIssues"] {
	const issues = new Set<
		ContextEvidence["projection"]["accountingIssues"][number]
	>();
	if (keylessCount > NO_KEYLESS_OCCURRENCES) {
		issues.add("keyless-request");
	}
	if (requests.some((request) => request.identityState !== "complete")) {
		issues.add("request-identity");
	}
	if (requests.some((request) => request.usageState !== "complete")) {
		issues.add("request-usage");
	}
	addModelAndAttributionIssues(requests, issues);

	return [...issues].toSorted();
}

interface RequestNormalizationContext {
	readonly indexes: TranscriptIndexes;
	readonly rates: ContextRateCatalog | undefined;
	readonly issues: Readonly<NormalizationIssues>;
}

interface RequestSources extends RequestNormalizationContext {
	readonly logs: OtelRequestCollection;
	readonly spans: SpanRequestCollection;
}
function requestRoutes(
	key: string,
	{ logs, spans, indexes }: RequestSources,
): Set<RequestRoute> {
	const routes = new Set<RequestRoute>();
	if (logs.byRequest.has(key)) {
		routes.add("otel");
	}
	if (spans.byRequest.has(key)) {
		routes.add("span");
	}
	if (indexes.byRequest.has(key)) {
		routes.add("transcript");
	}
	return routes;
}
function sourceRequest(key: string, sources: RequestSources): RequestEvidence {
	const { logs, spans, indexes, rates } = sources;
	const metadata: RequestIdentityMetadata = {
		...identityParts(key),
		clientRequestIds: new Set(logs.clientRequestIds.get(key)),
		identityConflict: logs.identityConflicts.has(key),
		routes: requestRoutes(key, sources),
	};
	const candidateSet = new Set([
		...(indexes.agentCandidatesByRequest.get(key) ?? []),
		...(spans.agentCandidates.get(key) ?? []),
	]);
	return normalizedRequest({
		candidateSet,
		clientRequestIds: [...metadata.clientRequestIds],
		identityState: requestIdentityState(metadata),
		logs: logs.byRequest.get(key) ?? [],
		rates,
		requestId: metadata.requestId,
		sessionId: metadata.sessionId,
		spans: spans.byRequest.get(key) ?? [],
		transcriptRows: indexes.byRequest.get(key) ?? [],
	});
}
function normalizedRequests(
	files: ContextEvidenceSource["files"],
	context: RequestNormalizationContext,
): NormalizedRequests {
	const logs = collectOtelRequests(
		files.otelLogs,
		serverAliases(files.otelLogs),
		context.issues,
	);
	const spans = collectRequestSpans(files.otelSpans, context.issues);
	const requestKeys = new Set([
		...logs.byRequest.keys(),
		...spans.byRequest.keys(),
		...context.indexes.byRequest.keys(),
	]);
	const requests = [...requestKeys]
		.toSorted()
		.map((key) => sourceRequest(key, { ...context, logs, spans }));
	return {
		accountingIssues: requestAccountingIssues(requests, logs.keyless.length),
		keylessRequests: logs.keyless.map(({ record, index }) => ({
			occurrenceId: `otel-log:${String(numberValue(record, "capture_ordinal") ?? index + ORDINAL_BASE)}`,
			state: "identity-missing-no-dedup" as const,
		})),
		requests,
	};
}

function addModelAndAttributionIssues(
	requests: ContextEvidence["projection"]["requests"],
	issues: Set<ContextEvidence["projection"]["accountingIssues"][number]>,
): void {
	if (
		requests.some(
			(request) =>
				request.modelState === "missing" || request.modelState === "conflict",
		)
	) {
		issues.add("request-model");
	}
	if (requests.some((request) => request.attributionState !== undefined)) {
		issues.add("request-attribution");
	}
}

export { normalizedRequests as default };
