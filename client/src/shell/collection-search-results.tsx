import type { CasesResponse } from "#client/cases/cases-query";
import type { ComparisonIndexResponse } from "#client/comparison/comparison-index-query";
import type { CorpusResponse } from "#client/corpus/corpus-query";
import { matchesText } from "#client/run-history/run-discovery";

import type { SearchResult } from "./search-result-grouping";

const PREFIX_START_INDEX = 0;

const COMPARISON_DIGEST_PREVIEW_CHARACTERS = 12;

function caseSearchResults(
	entries: CasesResponse["cases"],
	query: string,
): readonly SearchResult[] {
	return entries
		.filter((entry) => matchesText([entry.id, entry.title], query))
		.map((entry) => ({
			collection: "Cases" as const,
			detail: entry.title,
			href: `/cases?caseId=${encodeURIComponent(entry.id)}`,
			kind: "Case",
			label: entry.id,
		}));
}

function instructionSearchResults(
	entries: CorpusResponse["files"],
	query: string,
): readonly SearchResult[] {
	return entries
		.filter((entry) => matchesText([entry.path, entry.sha256], query))
		.map((entry) => ({
			collection: "Instructions" as const,
			detail: "Corpus file",
			href: `/corpus?file=${encodeURIComponent(entry.path)}`,
			kind: "Instruction",
			label: entry.path,
		}));
}

function comparisonSearchResults(
	entries: ComparisonIndexResponse["comparisons"],
	query: string,
): readonly SearchResult[] {
	return entries
		.filter((entry) =>
			matchesText([entry.digest, entry.mode, ...entry.caseIds], query),
		)
		.map((entry) => ({
			collection: "Comparisons" as const,
			detail: entry.caseIds.join(", "),
			href: `/comparisons/${encodeURIComponent(entry.digest)}`,
			kind: "Comparison",
			label: entry.digest.slice(
				PREFIX_START_INDEX,
				COMPARISON_DIGEST_PREVIEW_CHARACTERS,
			),
		}));
}

export { caseSearchResults, comparisonSearchResults, instructionSearchResults };
