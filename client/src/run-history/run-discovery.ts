import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";

import type {
	RunHistoryResponse,
	RunListingResponse,
} from "./run-history-query";

const runDiscoverySearchSchema = z.object({
	corpus: z
		.union([
			z.enum(["all", "current", "stale"]),
			z.unknown().transform((): undefined => undefined),
		])
		.optional(),
	kind: z
		.union([
			z.enum(["all", "run", "session-attempt", "replay", "group"]),
			z.unknown().transform((): undefined => undefined),
		])
		.optional(),
	query: z
		.union([z.string(), z.unknown().transform((): undefined => undefined)])
		.optional(),
	sort: z
		.union([
			z.enum(["newest", "oldest", "cost", "case"]),
			z.unknown().transform((): undefined => undefined),
		])
		.optional(),
	status: z
		.union([
			z.enum(["all", "running", "ended", "passed", "failed", "stopped"]),
			z.unknown().transform((): undefined => undefined),
		])
		.optional(),
});

type RunDiscoverySearch = z.output<typeof runDiscoverySearchSchema>;

type Row = RunHistoryResponse["rows"][number];

type ListedRow = RunListingResponse["rows"][number];

type Launch = RunHistoryResponse["launches"][number];

const RETURN_SEARCH_KEY = ["runs-return-search"] as const;

function useRunsReturnSearch(): RunDiscoverySearch {
	const cached = useQuery({
		enabled: false,
		initialData: {},
		queryFn: (): RunDiscoverySearch => ({}),
		queryKey: RETURN_SEARCH_KEY,
	});
	return cached.data;
}

function useRememberRunsSearch(search: RunDiscoverySearch): void {
	const client = useQueryClient();
	const { query, status, kind, corpus, sort } = search;
	useEffect(() => {
		client.setQueryData<RunDiscoverySearch>(RETURN_SEARCH_KEY, {
			corpus,
			kind,
			query,
			sort,
			status,
		});
	}, [client, query, status, kind, corpus, sort]);
}

export {
	launchMatchesDiscovery,
	matchesDiscovery,
} from "./history-record-filtering";
export {
	matchesText,
	recordIdentity,
	recordSearchTexts,
} from "./history-record-search";
export { recordedTime, sortDiscoveredRows } from "./history-record-sorting";
export { runDiscoverySearchSchema, useRememberRunsSearch, useRunsReturnSearch };
export type { Launch, ListedRow, Row, RunDiscoverySearch };
