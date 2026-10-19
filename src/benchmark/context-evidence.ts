import normalizedAgents from "./context-agent-lineage";
import {
	CONTEXT_EVIDENCE_SCHEMA_VERSION,
	contextEvidenceSchema,
} from "./context-evidence-contract";
import type {
	ContextEvidence,
	ContextEvidenceSource,
	ContextRateCatalog,
} from "./context-evidence-contract";
import { normalizedHookEvidence } from "./context-hook-deliveries";
import type { NormalizationIssues } from "./context-normalization-issues";
import { normalizationIssueCollection } from "./context-normalization-issues";
import normalizedRequests from "./context-normalized-requests";
import { transcriptIndexes } from "./context-transcript-index";

const EMPTY_COLLECTION_LENGTH = 0;
const EMPTY_LOOKUP_SIZE = 0;

interface ProjectionAccounting {
	readonly requests: ContextEvidence["projection"]["accountingIssues"];
	readonly coverage: ContextEvidence["projection"]["coverage"];
	readonly normalizationIssues: Readonly<NormalizationIssues>;
}
function projectionAccounting({
	requests,
	coverage,
	normalizationIssues,
}: ProjectionAccounting): ReadonlySet<
	ContextEvidence["projection"]["accountingIssues"][number]
> {
	const accountingIssues = new Set(requests);
	if (normalizationIssues.values.length > EMPTY_COLLECTION_LENGTH) {
		accountingIssues.add("malformed-source-record");
	}
	if (coverage.some((entry) => entry.state !== "complete")) {
		accountingIssues.add("source-coverage");
	}
	return accountingIssues;
}
function contextProjection(
	source: ContextEvidenceSource,
	rates: ContextRateCatalog | undefined,
): ContextEvidence["projection"] {
	const normalizationIssues = normalizationIssueCollection();
	const indexes = transcriptIndexes(source.files, normalizationIssues);
	const requests = normalizedRequests(source.files, {
		indexes,
		issues: normalizationIssues,
		rates,
	});
	const { instructionLoads, compactions, rawApiBodies, coverage } =
		normalizedHookEvidence(source.files, normalizationIssues);
	const accountingIssues = projectionAccounting({
		coverage,
		normalizationIssues,
		requests: requests.accountingIssues,
	});
	return {
		accountingIssues: [...accountingIssues].toSorted(),
		accountingState:
			accountingIssues.size === EMPTY_LOOKUP_SIZE ? "complete" : "incomplete",
		agents: normalizedAgents(source.files, indexes),
		compactions,
		coverage,
		instructionLoads,
		keylessRequests: requests.keylessRequests,
		normalizationIssues: normalizationIssues.values,
		rawApiBodies,
		requests: requests.requests,
	};
}
function normalizeContextEvidence(
	source: ContextEvidenceSource,
	rates?: ContextRateCatalog,
): ContextEvidence {
	const projection = contextProjection(source, rates);
	const evidence = {
		projection,
		schemaVersion: CONTEXT_EVIDENCE_SCHEMA_VERSION,
		source,
	};
	if (rates !== undefined) {
		Object.assign(evidence, { rateCatalog: rates });
	}
	return contextEvidenceSchema.parse(evidence);
}

export {
	contextEvidenceSchema,
	contextEvidenceSourceSchema,
	contextRateCatalogSchema,
} from "./context-evidence-contract";
export type {
	ContextEvidence,
	ContextEvidenceSource,
	ContextRateCatalog,
} from "./context-evidence-contract";
export { normalizeContextEvidence };
