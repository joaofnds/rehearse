import { useQuery } from "@tanstack/react-query";

import casesQuery from "#client/cases/cases-query";
import comparisonIndexQuery from "#client/comparison/comparison-index-query";
import { corpusQuery } from "#client/corpus/corpus-query";
import { runListingQuery } from "#client/run-history/run-history-query";

import {
	caseSearchResults,
	comparisonSearchResults,
	instructionSearchResults,
} from "./collection-search-results";
import runSearchResults from "./run-search-results";
import type { SearchResult } from "./search-result-grouping";

interface SearchCollections {
	readonly results: readonly SearchResult[];
	readonly failures: readonly string[];
	readonly loading: boolean;
}

function useSearchCollections(query: string): SearchCollections {
	const runs = useQuery(runListingQuery);
	const cases = useQuery(casesQuery);
	const corpus = useQuery(corpusQuery);
	const comparisons = useQuery(comparisonIndexQuery);
	const results: readonly SearchResult[] = [
		...runSearchResults(runs.data?.rows ?? [], query),
		...caseSearchResults(cases.data?.cases ?? [], query),
		...instructionSearchResults(corpus.data?.files ?? [], query),
		...comparisonSearchResults(comparisons.data?.comparisons ?? [], query),
	];
	const reads = [
		["Runs", runs],
		["Cases", cases],
		["Instructions", corpus],
		["Comparisons", comparisons],
	] as const;
	return {
		failures: reads.filter(([, read]) => read.isError).map(([label]) => label),
		loading: reads.some(([, read]) => read.isLoading),
		results,
	};
}

export { useSearchCollections as default };
