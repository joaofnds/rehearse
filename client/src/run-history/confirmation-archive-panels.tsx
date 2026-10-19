import plural from "#client/plural";
import Disclosure from "#client/system/components/disclosure";
import { Button } from "#client/system/ui/button";

import type { PendingArchive } from "./use-record-issues";

const SINGLE_ITEM_COUNT = 1;

interface IncompleteRunsProps {
	readonly incomplete: readonly { readonly groupId: string }[];
	readonly pending: PendingArchive;
	readonly onArchive: (groupId: string) => void;
}

function IncompleteRuns({
	incomplete,
	pending,
	onArchive,
}: IncompleteRunsProps): React.JSX.Element {
	return (
		<section
			aria-label="Incomplete confirmation runs"
			className="min-w-0 rounded-lg border border-divider bg-card px-4 py-3 text-14"
		>
			<p className="font-medium text-foreground">
				{plural(incomplete.length, "confirmation run")}{" "}
				{incomplete.length === SINGLE_ITEM_COUNT ? "has" : "have"} no saved
				summary
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
						<IncompleteRunList
							incomplete={incomplete}
							pending={pending}
							onArchive={onArchive}
						/>
					</div>
				</Disclosure>
			</div>
		</section>
	);
}

interface ArchivedRunsProps {
	readonly archived: readonly {
		readonly groupId: string;
		readonly archivedAt: string;
	}[];
	readonly pending: PendingArchive;
	readonly onRestore: (groupId: string) => void;
}

function ArchivedRuns({
	archived,
	pending,
	onRestore,
}: ArchivedRunsProps): React.JSX.Element {
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
					<ArchivedRunList
						archived={archived}
						pending={pending}
						onRestore={onRestore}
					/>
				</div>
			</Disclosure>
		</div>
	);
}

interface IncompleteRunListProps {
	readonly incomplete: readonly { readonly groupId: string }[];
	readonly pending: PendingArchive;
	readonly onArchive: (groupId: string) => void;
}

function IncompleteRunList({
	incomplete,
	pending,
	onArchive,
}: IncompleteRunListProps): React.JSX.Element {
	return (
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
	);
}

interface ArchivedRunListProps {
	readonly archived: readonly {
		readonly groupId: string;
		readonly archivedAt: string;
	}[];
	readonly pending: PendingArchive;
	readonly onRestore: (groupId: string) => void;
}

function ArchivedRunList({
	archived,
	pending,
	onRestore,
}: ArchivedRunListProps): React.JSX.Element {
	return (
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
	);
}

export { ArchivedRuns, IncompleteRuns };
