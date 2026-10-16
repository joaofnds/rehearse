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

const COLUMNS = [
	"Case comparison",
	"Evaluation",
	"Requested per arm",
	"Record",
] as const;

function rowFor(comparison: SavedComparison): readonly React.ReactNode[] {
	return [
		<Link
			key="case"
			to={`/comparisons/${encodeURIComponent(comparison.digest)}`}
			className="text-14 text-accent-foreground underline decoration-deeper underline-offset-4 hover:text-pale"
		>
			<span className="font-medium">{comparison.caseIds.join(", ")}</span>
			<span className="mt-1 block font-mono text-11-5 text-muted-foreground">
				{comparison.digest.slice(0, 12)}
			</span>
		</Link>,
		<span key="mode" className="text-13">
			{comparison.mode}
		</span>,
		<span key="reps" className="font-mono text-13">
			{comparison.reps}
		</span>,
		<details key="record" className="text-12 text-muted-foreground">
			<summary className="cursor-pointer">Canonical ID</summary>
			<code className="mt-2 block font-mono break-all">
				{comparison.digest}
			</code>
		</details>,
	];
}

function savedLine(readable: number, unreadable: number): string {
	const saved = `${plural(readable + unreadable, "comparison")} saved`;

	return unreadable > 0 ? `${saved}, ${unreadable} unreadable` : saved;
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
						? savedLine(comparisons.length, unreadable.length)
						: undefined
				}
			/>

			<div className="flex max-w-7xl flex-col gap-6 px-6 pt-4 pb-12">
				<p className="text-13 text-secondary-foreground">
					Compare the baseline before an edit, the candidate after it, and the
					recorded control. Open a case comparison for its corpus difference,
					measured changes and saved attempts.
				</p>
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
						message="These comparisons could not be read, so no table row shows them:"
						items={unreadable.map(({ id, reason }) => `${id}: ${reason}`)}
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
						numeric={["Requested per arm"]}
						rows={comparisons.map((comparison) => rowFor(comparison))}
					/>
				) : null}
			</div>
		</div>
	);
}
