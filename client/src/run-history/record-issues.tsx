import { useEffect, useRef, useState } from "react";
import { Notice } from "#client/system/components/notice";
import { Disclosure } from "#client/system/components/disclosure";
import { Button } from "#client/system/ui/button";
import { plural } from "#client/plural";
import type { RunHistoryResponse } from "./run-history-query";
import {
	useConfirmationArchives,
	useConfirmationArchive,
} from "./confirmation-archives";

type UnreadableRecord = RunHistoryResponse["unreadable"][number];

const UNREADABLE_NOUNS = {
	run: ["run", "runs"],
	"session-attempt": ["session attempt", "session attempts"],
	replay: ["replay", "replays"],
	group: ["confirmation run", "confirmation runs"],
	launch: ["launch", "launches"],
	"short-ids": ["short id registry", "short id registries"],
} as const satisfies Readonly<
	Record<UnreadableRecord["kind"], readonly [string, string]>
>;

function unreadableSummary(
	records: readonly UnreadableRecord[],
): readonly string[] {
	return Object.entries(UNREADABLE_NOUNS).flatMap(
		([kind, [noun, nounPlural]]) => {
			const count = records.filter((record) => record.kind === kind).length;
			return count === 0 ? [] : [plural(count, noun, nounPlural)];
		},
	);
}

type PendingArchive =
	| { readonly groupId: string; readonly action: "archive" | "restore" }
	| undefined;

function IncompleteRuns({
	incomplete,
	pending,
	onArchive,
}: {
	readonly incomplete: readonly { readonly groupId: string }[];
	readonly pending: PendingArchive;
	readonly onArchive: (groupId: string) => void;
}): React.JSX.Element {
	return (
		<section
			aria-label="Incomplete confirmation runs"
			className="min-w-0 rounded-lg border border-divider bg-card px-4 py-3 text-14"
		>
			<p className="font-medium text-foreground">
				{plural(incomplete.length, "confirmation run")}{" "}
				{incomplete.length === 1 ? "has" : "have"} no saved summary
			</p>
			<p className="mt-1 text-muted-foreground">
				Execution and cost are unknown. These runs may still be recording.
			</p>
			<div className="mt-1.5 min-w-0">
				<Disclosure
					collapsedLabel="Review incomplete runs"
					expandedLabel="Hide incomplete runs"
				>
					<div className="flex w-full min-w-0 flex-col gap-3 border-t border-divider pt-3">
						<p className="text-secondary-foreground">
							Archiving keeps saved files and can be undone below. It does not
							stop a running process. Any summary saved later appears normally.
						</p>
						<ul className="flex w-full min-w-0 flex-col divide-y divide-divider">
							{incomplete.map(({ groupId }) => (
								<li
									key={groupId}
									className="flex min-w-0 flex-col items-start gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
								>
									<code className="min-w-0 text-13 wrap-anywhere text-secondary-foreground">
										{groupId}
									</code>
									<Button
										size="compact"
										variant="outline"
										disabled={pending !== undefined}
										aria-label={`Archive ${groupId}`}
										onClick={() => {
											onArchive(groupId);
										}}
									>
										{pending !== undefined &&
										pending.groupId === groupId &&
										pending.action === "archive"
											? "Archiving…"
											: "Archive"}
									</Button>
								</li>
							))}
						</ul>
					</div>
				</Disclosure>
			</div>
		</section>
	);
}

function ArchivedRuns({
	archived,
	pending,
	onRestore,
}: {
	readonly archived: readonly {
		readonly groupId: string;
		readonly archivedAt: string;
	}[];
	readonly pending: PendingArchive;
	readonly onRestore: (groupId: string) => void;
}): React.JSX.Element {
	return (
		<div className="min-w-0 text-14 text-muted-foreground">
			<Disclosure
				collapsedLabel={`Archived incomplete runs (${archived.length})`}
				expandedLabel="Hide archived incomplete runs"
			>
				<div className="flex w-full min-w-0 flex-col gap-3 rounded-lg border border-divider bg-card p-4">
					<p>
						Archived runs stay available here across browsers. Saved files are
						unchanged; execution and cost remain unknown.
					</p>
					<ul className="flex w-full min-w-0 flex-col divide-y divide-divider">
						{archived.map(({ groupId, archivedAt }) => (
							<li
								key={groupId}
								className="flex min-w-0 flex-col items-start gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
							>
								<div className="min-w-0">
									<p className="font-mono text-13 wrap-anywhere text-secondary-foreground">
										{groupId}
									</p>
									<p className="mt-1 text-12 text-dim">
										Archived{" "}
										<time dateTime={archivedAt}>
											{new Date(archivedAt).toLocaleString()}
										</time>
									</p>
								</div>
								<Button
									size="compact"
									variant="outline"
									disabled={pending !== undefined}
									aria-label={`Restore ${groupId}`}
									onClick={() => {
										onRestore(groupId);
									}}
								>
									{pending?.groupId === groupId && pending.action === "restore"
										? "Restoring…"
										: "Restore"}
								</Button>
							</li>
						))}
					</ul>
				</div>
			</Disclosure>
		</div>
	);
}

function ArchiveFeedback({
	message,
	error,
}: {
	readonly message: string | undefined;
	readonly error: Readonly<Pick<Error, "message">> | null;
}): React.JSX.Element | null {
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

export function RecordIssues({
	records,
}: {
	readonly records: readonly UnreadableRecord[];
}): React.JSX.Element | null {
	const archives = useConfirmationArchives();
	const change = useConfirmationArchive();
	const pending = change.isPending ? change.variables : undefined;
	const [feedback, setFeedback] = useState<string>();
	const incomplete = records.flatMap((record) =>
		record.incompleteConfirmation === undefined
			? []
			: [record.incompleteConfirmation],
	);
	const unreadable = records.filter(
		(record) => record.incompleteConfirmation === undefined,
	);
	const archived = archives.data?.archived ?? [];
	const archiveErrors = archives.data?.unreadable ?? [];

	function act(groupId: string, action: "archive" | "restore"): void {
		setFeedback(undefined);
		change.mutate(
			{ groupId, action },
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

	if (
		records.length === 0 &&
		archived.length === 0 &&
		archiveErrors.length === 0 &&
		!archives.isError &&
		feedback === undefined &&
		change.error === null
	) {
		return null;
	}

	return (
		<div className="flex min-w-0 flex-col gap-3">
			{incomplete.length > 0 ? (
				<IncompleteRuns
					incomplete={incomplete}
					pending={pending}
					onArchive={(groupId) => {
						act(groupId, "archive");
					}}
				/>
			) : null}

			{unreadable.length > 0 ? (
				<Notice
					message={`${unreadableSummary(unreadable).join(", ")} could not be read, so the table leaves them out.`}
					items={unreadable.map(({ id, reason }) => `${id}: ${reason}`)}
					collapsible
				/>
			) : null}

			{archived.length > 0 ? (
				<ArchivedRuns
					archived={archived}
					pending={pending}
					onRestore={(groupId) => {
						act(groupId, "restore");
					}}
				/>
			) : null}

			{archiveErrors.map(({ id, reason, groupId }) => (
				<Notice
					key={id}
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
									act(groupId, "restore");
								}}
							>
								Clear invalid archive state
							</Button>
						</div>
					)}
				</Notice>
			))}
			{archives.isError ? (
				<div
					className="flex flex-wrap items-center gap-2 text-14 text-muted-foreground"
					role="status"
				>
					<p>Could not load archived incomplete runs.</p>
					<Button
						size="compact"
						variant="outline"
						onClick={() => {
							void archives.refetch();
						}}
					>
						Retry archive list
					</Button>
				</div>
			) : null}
			<ArchiveFeedback message={feedback} error={change.error} />
		</div>
	);
}
