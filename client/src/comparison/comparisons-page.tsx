import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

import plural from "#client/plural";
import EmptyState from "#client/system/components/empty-state";
import Notice from "#client/system/components/notice";
import PageContent from "#client/system/components/page-content";
import { RecordList } from "#client/system/components/record-list";
import ScreenHeader from "#client/system/components/screen-header";

import type { ComparisonIndexResponse } from "./comparison-index-query";
import comparisonIndexQuery from "./comparison-index-query";
import type { SavedComparison } from "./comparison-list-entry";
import ComparisonEntry from "./comparison-list-entry";

const EMPTY_COLLECTION_LENGTH = 0;

const NO_UNREADABLE_RECORDS = 0;

function savedLine(readable: number, unreadable: number): string {
	const saved = `${plural(readable + unreadable, "comparison")} saved`;

	return unreadable > NO_UNREADABLE_RECORDS
		? `${saved}, ${unreadable} unreadable`
		: saved;
}

function ComparisonsPage(): React.JSX.Element {
	const query = useQuery(comparisonIndexQuery);
	const comparisons = query.data?.comparisons ?? [];
	const unreadable = query.data?.unreadable ?? [];

	return (
		<div>
			<ScreenHeader
				title="Comparisons"
				subline={
					query.isSuccess
						? savedLine(comparisons.length, unreadable.length)
						: undefined
				}
			/>

			<PageContent>
				<p className="max-w-prose text-14 leading-reading text-secondary-foreground">
					Compare the baseline before an edit, the candidate after it, and the
					recorded control. Open a comparison to inspect measured changes and
					saved attempts.
				</p>
				<ComparisonIndexReadStatus
					query={query}
					comparisons={comparisons}
					unreadable={unreadable}
				/>

				{comparisons.length > EMPTY_COLLECTION_LENGTH ? (
					<RecordList label="Saved comparisons">
						{comparisons.map((comparison) => (
							<ComparisonEntry
								key={comparison.digest}
								comparison={comparison}
							/>
						))}
					</RecordList>
				) : null}
			</PageContent>
		</div>
	);
}

type ComparisonIndexReading = Readonly<
	Pick<
		UseQueryResult<ComparisonIndexResponse>,
		"isLoading" | "isError" | "isSuccess"
	>
>;

interface ComparisonIndexReadStatusProps {
	readonly query: ComparisonIndexReading;
	readonly comparisons: readonly SavedComparison[];
	readonly unreadable: Readonly<ComparisonIndexResponse["unreadable"]>;
}

function ComparisonIndexReadStatus({
	query,
	comparisons,
	unreadable,
}: ComparisonIndexReadStatusProps): React.JSX.Element {
	return (
		<>
			{query.isLoading ? (
				<p className="text-muted-foreground">Loading…</p>
			) : null}
			{query.isError ? (
				<p role="alert" className="text-attention">
					<span aria-hidden="true">⚠ </span>
					Could not load the saved comparisons.
				</p>
			) : null}

			{unreadable.length > EMPTY_COLLECTION_LENGTH ? (
				<Notice
					message="These comparisons could not be read, so no entry shows them:"
					items={unreadable.map(({ id, reason }) => `${id}: ${reason}`)}
				/>
			) : null}

			{query.isSuccess &&
			comparisons.length === EMPTY_COLLECTION_LENGTH &&
			unreadable.length === EMPTY_COLLECTION_LENGTH ? (
				<EmptyState heading="No comparisons saved">
					<p>
						A comparison lands here once rehearse compare reads a manifest
						naming baseline, candidate and control groups for each case and
						saves its report.
					</p>
				</EmptyState>
			) : null}
		</>
	);
}

export { ComparisonsPage as default };
