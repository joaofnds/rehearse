import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { plural } from "#client/plural";
import { EmptyState } from "#client/system/components/empty-state";
import { Notice } from "#client/system/components/notice";
import { ScreenHeader } from "#client/system/components/screen-header";
import { TableShell } from "#client/system/components/table-shell";
import type { ComparisonIndexResponse } from "./comparison-index-query";
import { comparisonIndexQuery } from "./comparison-index-query";

type SavedComparison = ComparisonIndexResponse["comparisons"][number];

const COLUMNS = ["Comparison", "Mode", "Cases", "Reps"] as const;

function rowFor(comparison: SavedComparison): readonly React.ReactNode[] {
	return [
		<Link
			key="digest"
			to={`/comparisons/${comparison.digest}`}
			className="font-mono text-sm text-accent-foreground underline decoration-deeper underline-offset-4 hover:text-pale"
		>
			{comparison.digest.slice(0, 12)}
		</Link>,
		<span key="mode" className="font-mono text-sm">
			{comparison.mode}
		</span>,
		<span key="cases" className="font-mono text-sm">
			{comparison.caseIds.join(", ")}
		</span>,
		<span key="reps" className="font-mono text-sm">
			{comparison.reps}
		</span>,
	];
}

export function ComparisonsPage(): React.JSX.Element {
	const query = useQuery(comparisonIndexQuery);
	const comparisons = query.data?.comparisons ?? [];
	const unreadable = query.data?.unreadable ?? [];

	return (
		<div>
			<ScreenHeader
				title="Comparisons"
				subline={
					query.isSuccess
						? `${plural(comparisons.length, "comparison")} saved`
						: undefined
				}
			/>

			<div className="flex max-w-7xl flex-col gap-6 px-6 pt-4 pb-12">
				{query.isLoading ? (
					<p className="text-muted-foreground">Loading…</p>
				) : null}
				{query.isError ? (
					<p role="alert" className="text-muted-foreground">
						<span aria-hidden="true">⚠ </span>
						Could not load the saved comparisons.
					</p>
				) : null}

				{unreadable.length > 0 ? (
					<Notice
						message="These comparisons could not be read, so they are missing from the table below:"
						items={unreadable.map(({ id, reason }) => `${id} — ${reason}`)}
					/>
				) : null}

				{query.isSuccess &&
				comparisons.length === 0 &&
				unreadable.length === 0 ? (
					<EmptyState heading="No comparisons saved">
						<p>
							A comparison lands here once rehearse compare reads a manifest
							naming baseline, candidate and control groups for each case and
							saves its report.
						</p>
					</EmptyState>
				) : null}

				{comparisons.length > 0 ? (
					<TableShell
						caption="Saved comparisons"
						columns={[...COLUMNS]}
						numeric={["Reps"]}
						rows={comparisons.map((comparison) => rowFor(comparison))}
					/>
				) : null}
			</div>
		</div>
	);
}
