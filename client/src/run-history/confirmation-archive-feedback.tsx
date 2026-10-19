import { useEffect, useRef } from "react";

import Notice from "#client/system/components/notice";
import { Button } from "#client/system/ui/button";

import type { ArchiveReport } from "./confirmation-archives";
import type { PendingArchive } from "./use-record-issues";

interface ArchiveFeedbackProps {
	readonly message: string | undefined;
	readonly error: Readonly<Pick<Error, "message">> | null;
}

function ArchiveFeedback({
	message,
	error,
}: ArchiveFeedbackProps): React.JSX.Element | null {
	const element = useRef<HTMLParagraphElement>(null);
	useEffect(() => {
		if (message !== undefined || error !== null) {
			element.current?.focus();
		}
	}, [message, error]);
	if (message === undefined && error === null) {
		return null;
	}

	return (
		<p
			ref={element}
			tabIndex={-1}
			role={error === null ? "status" : "alert"}
			className={`text-14 wrap-anywhere ${error === null ? "text-secondary-foreground" : "text-attention"}`}
		>
			{error?.message ?? message}
		</p>
	);
}

interface ArchiveErrorNoticeProps {
	readonly issue: ArchiveReport["unreadable"][number];
	readonly pending: PendingArchive;
	readonly onRestore: (groupId: string) => void;
}

function ArchiveErrorNotice({
	issue,
	pending,
	onRestore,
}: ArchiveErrorNoticeProps): React.JSX.Element {
	const { id, reason, groupId } = issue;
	return (
		<Notice
			message="An archive record could not be read."
			items={[`${id}: ${reason}`]}
			collapsible
		>
			{groupId === undefined ? null : (
				<div className="mt-3 flex flex-col items-start gap-2">
					<p>
						Clear the invalid archive state for {groupId}. Saved experiment
						files stay in place.
					</p>
					<Button
						size="compact"
						variant="outline"
						wrap
						disabled={pending !== undefined}
						aria-label={`Clear archive state ${groupId}`}
						onClick={() => {
							onRestore(groupId);
						}}
					>
						Clear invalid archive state
					</Button>
				</div>
			)}
		</Notice>
	);
}

interface ArchiveListErrorProps {
	readonly retry: () => void;
}

function ArchiveListError({ retry }: ArchiveListErrorProps): React.JSX.Element {
	return (
		<div
			className="flex flex-wrap items-center gap-2 text-14 text-muted-foreground"
			role="status"
		>
			<p>Could not load archived incomplete runs.</p>
			<Button size="compact" variant="outline" onClick={retry}>
				Retry archive list
			</Button>
		</div>
	);
}

export { ArchiveErrorNotice, ArchiveFeedback, ArchiveListError };
