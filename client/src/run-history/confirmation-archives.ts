import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import { confirmationArchiveClient } from "#client/api-client";
import refusalReason from "#client/refusal-reason";

import { runHistoryQuery, runListingQuery } from "./run-history-query";

const SUCCESS_STATUS = 200;

const INITIAL_READING_COUNT = 0;

const routes = confirmationArchiveClient.api["confirmation-archives"];

type ArchiveReport = InferResponseType<
	typeof routes.$get,
	typeof SUCCESS_STATUS
>;

async function fetchArchives(): Promise<ArchiveReport> {
	const response = await routes.$get();
	if (!response.ok) {
		throw new Error("Could not load archived incomplete runs.");
	}

	return await response.json();
}

const confirmationArchivesQuery = {
	queryFn: fetchArchives,
	queryKey: [...runHistoryQuery.queryKey, "confirmation-archives"],
} as const;

/** Archive decisions follow every successful history reading, including another writer's changes. */
function useConfirmationArchives(): UseQueryResult<ArchiveReport> {
	const client = useQueryClient();
	const listing = useQuery({
		...runListingQuery,
		refetchOnMount: false,
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
	});
	const reading =
		client.getQueryState(runListingQuery.queryKey)?.dataUpdateCount ??
		INITIAL_READING_COUNT;

	return useQuery({
		...confirmationArchivesQuery,
		enabled: listing.isSuccess && !listing.isFetching,
		gcTime: 0,
		placeholderData: keepPreviousData,
		queryKey: [...confirmationArchivesQuery.queryKey, reading],
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
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

function useConfirmationArchive(): UseMutationResult<
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

export {
	confirmationArchivesQuery,
	useConfirmationArchive,
	useConfirmationArchives,
};
export type { ArchiveReport };
