import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { confirmationArchiveClient } from "#client/api-client";
import { refusalReason } from "#client/refusal-reason";
import { runHistoryQuery, runListingQuery } from "./run-history-query";

const routes = confirmationArchiveClient.api["confirmation-archives"];

export type ArchiveReport = InferResponseType<typeof routes.$get, 200>;

async function fetchArchives(): Promise<ArchiveReport> {
	const response = await routes.$get();
	if (!response.ok) {
		throw new Error("Could not load archived incomplete runs.");
	}

	return response.json();
}

export const confirmationArchivesQuery = {
	queryKey: [...runHistoryQuery.queryKey, "confirmation-archives"],
	queryFn: fetchArchives,
} as const;

/** Archive decisions follow every successful history reading, including another writer's changes. */
export function useConfirmationArchives(): UseQueryResult<ArchiveReport> {
	const client = useQueryClient();
	const listing = useQuery({
		...runListingQuery,
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});
	const reading =
		client.getQueryState(runListingQuery.queryKey)?.dataUpdateCount ?? 0;

	return useQuery({
		...confirmationArchivesQuery,
		queryKey: [...confirmationArchivesQuery.queryKey, reading],
		gcTime: 0,
		placeholderData: keepPreviousData,
		enabled: listing.isSuccess && !listing.isFetching,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});
}

interface ArchiveAction {
	readonly groupId: string;
	readonly action: "archive" | "restore";
}

async function changeArchive(request: ArchiveAction): Promise<void> {
	const route = routes[":groupId"];
	const options = { param: { groupId: request.groupId } };
	const response =
		request.action === "archive"
			? await route.archive.$post(options)
			: await route.restore.$post(options);
	if (!response.ok) {
		throw new Error(await refusalReason(response));
	}
}

export function useConfirmationArchive(): UseMutationResult<
	void,
	Error,
	ArchiveAction
> {
	const client = useQueryClient();

	return useMutation({
		mutationFn: changeArchive,
		onSettled: async () => {
			await client.invalidateQueries({ queryKey: runHistoryQuery.queryKey });
		},
	});
}
