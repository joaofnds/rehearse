import { useState } from "react";

import type { ArchiveReport } from "./confirmation-archives";
import {
	useConfirmationArchive,
	useConfirmationArchives,
} from "./confirmation-archives";
import type { RunHistoryResponse } from "./run-history-query";

type UnreadableRecord = RunHistoryResponse["unreadable"][number];

type PendingArchive =
	| { readonly groupId: string; readonly action: "archive" | "restore" }
	| undefined;

interface ArchiveActionState {
	readonly pending: PendingArchive;
	readonly feedback: string | undefined;
	readonly error: Readonly<Pick<Error, "message">> | null;
	readonly onArchive: (groupId: string) => void;
	readonly onRestore: (groupId: string) => void;
}

function useArchiveAction(): ArchiveActionState {
	const change = useConfirmationArchive();
	const [feedback, setFeedback] = useState<string>();
	function act(groupId: string, action: "archive" | "restore"): void {
		setFeedback(undefined);
		change.mutate(
			{ action, groupId },
			{
				onSuccess: () => {
					setFeedback(
						action === "archive"
							? `Archived ${groupId}. Saved files are unchanged.`
							: `Archive cleared for ${groupId}. Saved files are unchanged.`,
					);
				},
			},
		);
	}
	return {
		error: change.error,
		feedback,
		onArchive: (groupId) => {
			act(groupId, "archive");
		},
		onRestore: (groupId) => {
			act(groupId, "restore");
		},
		pending: change.isPending ? change.variables : undefined,
	};
}

interface RecordIssueView extends ArchiveActionState {
	readonly incomplete: readonly { readonly groupId: string }[];
	readonly unreadable: readonly UnreadableRecord[];
	readonly archived: readonly Readonly<ArchiveReport["archived"][number]>[];
	readonly archiveErrors: readonly Readonly<
		ArchiveReport["unreadable"][number]
	>[];
	readonly archiveListFailed: boolean;
	readonly retryArchives: () => void;
}

const EMPTY_ARCHIVES: ArchiveReport = { archived: [], unreadable: [] };

function useRecordIssues(
	records: readonly UnreadableRecord[],
): RecordIssueView {
	const archives = useConfirmationArchives();
	const actions = useArchiveAction();
	const { archived, unreadable: archiveErrors } =
		archives.data ?? EMPTY_ARCHIVES;
	const incomplete = records.flatMap((record) =>
		record.incompleteConfirmation === undefined
			? []
			: [record.incompleteConfirmation],
	);
	const unreadable = records.filter(
		(record) => record.incompleteConfirmation === undefined,
	);
	return {
		...actions,
		archiveErrors,
		archiveListFailed: archives.isError,
		archived,
		incomplete,
		retryArchives: () => {
			void archives.refetch();
		},
		unreadable,
	};
}

export { useRecordIssues as default };
export type { PendingArchive, RecordIssueView, UnreadableRecord };
