import { useQuery } from "@tanstack/react-query";

import comparisonIndexQuery from "#client/comparison/comparison-index-query";
import { corpusSummaryQuery } from "#client/corpus/corpus-query";
import {
	listedEntryCount,
	runListingQuery,
} from "#client/run-history/run-history-query";

import type { BadgeCounts } from "./nav-items";

/**
 * Each badge counts the whole collection its route serves, not the rows a
 * screen's own filter is showing, which is the design's own answer: its filter
 * bar reads "All 148" beside a nav badge of 148 (SPEC.md:107-109). A count is
 * undefined until its collection loads, so an unloaded badge renders nothing
 * rather than a zero it cannot vouch for.
 */
interface ShellCounts extends BadgeCounts {
	readonly metadataReady: boolean;
}

function useBadgeCounts(): ShellCounts {
	const runs = useQuery(runListingQuery);
	const metadataReady = !runs.isPending;
	const corpus = useQuery({ ...corpusSummaryQuery, enabled: metadataReady });
	const comparisons = useQuery({
		...comparisonIndexQuery,
		enabled: metadataReady,
	});

	return {
		comparisons: comparisons.data?.comparisons.length,
		corpus: corpus.data?.files.length,
		metadataReady,
		runs: runs.data === undefined ? undefined : listedEntryCount(runs.data),
	};
}

export { useBadgeCounts as default };
export type { ShellCounts };
