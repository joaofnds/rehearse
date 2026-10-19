import plural from "#client/plural";
import Notice from "#client/system/components/notice";

import {
	ArchiveErrorNotice,
	ArchiveFeedback,
	ArchiveListError,
} from "./confirmation-archive-feedback";
import { ArchivedRuns, IncompleteRuns } from "./confirmation-archive-panels";
import type { RecordIssueView, UnreadableRecord } from "./use-record-issues";
import useRecordIssues from "./use-record-issues";

const EMPTY_ITEM_COUNT = 0;

const UNREADABLE_NOUNS = {
	group: ["confirmation run", "confirmation runs"],
	launch: ["launch", "launches"],
	replay: ["replay", "replays"],
	run: ["run", "runs"],
	"session-attempt": ["session attempt", "session attempts"],
	"short-ids": ["short id registry", "short id registries"],
} as const satisfies Readonly<
	Record<UnreadableRecord["kind"], readonly [string, string]>
>;

function unreadableSummary(
	records: readonly UnreadableRecord[],
): readonly string[] {
	const kinds: readonly UnreadableRecord["kind"][] = [
		"run",
		"session-attempt",
		"replay",
		"group",
		"launch",
		"short-ids",
	];
	return kinds.flatMap((kind) => {
		const [noun, nounPlural] = UNREADABLE_NOUNS[kind];
		const count = records.filter((record) => record.kind === kind).length;
		return count === EMPTY_ITEM_COUNT ? [] : [plural(count, noun, nounPlural)];
	});
}

interface RecordIssuesProps {
	readonly records: readonly UnreadableRecord[];
}

interface IssueViewProps {
	readonly view: RecordIssueView;
}

function hasRecordIssues(view: RecordIssueView): boolean {
	return (
		view.incomplete.length > EMPTY_ITEM_COUNT ||
		view.unreadable.length > EMPTY_ITEM_COUNT ||
		view.archived.length > EMPTY_ITEM_COUNT ||
		view.archiveErrors.length > EMPTY_ITEM_COUNT ||
		view.archiveListFailed ||
		view.feedback !== undefined ||
		view.error !== null
	);
}

function RecordIssues({
	records,
}: RecordIssuesProps): React.JSX.Element | null {
	const view = useRecordIssues(records);
	if (!hasRecordIssues(view)) {
		return null;
	}
	return <RecordIssuesContent view={view} />;
}

function RecordIssuesContent({ view }: IssueViewProps): React.JSX.Element {
	const {
		incomplete,
		unreadable,
		archived,
		archiveErrors,
		pending,
		onArchive,
		onRestore,
	} = view;
	return (
		<div className="flex min-w-0 flex-col gap-3">
			{incomplete.length > EMPTY_ITEM_COUNT ? (
				<IncompleteRuns
					incomplete={incomplete}
					pending={pending}
					onArchive={onArchive}
				/>
			) : null}
			{unreadable.length > EMPTY_ITEM_COUNT ? (
				<Notice
					message={`${unreadableSummary(unreadable).join(", ")} could not be read, so the table leaves them out.`}
					items={unreadable.map(({ id, reason }) => `${id}: ${reason}`)}
					collapsible
				/>
			) : null}
			{archived.length > EMPTY_ITEM_COUNT ? (
				<ArchivedRuns
					archived={archived}
					pending={pending}
					onRestore={onRestore}
				/>
			) : null}
			{archiveErrors.map((issue) => (
				<ArchiveErrorNotice
					key={issue.id}
					issue={issue}
					pending={pending}
					onRestore={onRestore}
				/>
			))}
			{view.archiveListFailed ? (
				<ArchiveListError retry={view.retryArchives} />
			) : null}
			<ArchiveFeedback message={view.feedback} error={view.error} />
		</div>
	);
}

export { RecordIssues as default };
