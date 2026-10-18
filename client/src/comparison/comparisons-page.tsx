import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { plural } from "#client/plural";
import { EmptyState } from "#client/system/components/empty-state";
import { Notice } from "#client/system/components/notice";
import { ScreenHeader } from "#client/system/components/screen-header";
import { ArrowRight } from "lucide-react";
import { PageContent } from "#client/system/components/page-content";
import {
	RecordList,
	RecordListItem,
} from "#client/system/components/record-list";
import { SectionLabel } from "#client/system/components/section-label";
import { StateBadge } from "#client/system/components/state-badge";
import { Button } from "#client/system/ui/button";
import type { ComparisonIndexResponse } from "./comparison-index-query";
import { comparisonIndexQuery } from "./comparison-index-query";
import { corpusVersionText } from "./design-arms";

type SavedComparison = ComparisonIndexResponse["comparisons"][number];

function changedPathsReading(comparison: SavedComparison): React.JSX.Element {
	if (comparison.details === undefined || comparison.details.length === 0) {
		return (
			<p className="text-14 text-muted-foreground">
				Change details not recorded
			</p>
		);
	}

	const paths = [
		...new Set(comparison.details.flatMap((detail) => detail.changedPaths)),
	];

	if (paths.length === 0) {
		return (
			<p className="text-14 text-secondary-foreground">Identical corpora</p>
		);
	}

	return (
		<ul
			aria-label="Changed instructions"
			className="flex flex-col gap-1 font-mono text-13 text-secondary-foreground wrap-anywhere"
		>
			{paths.map((path) => (
				<li key={path}>{path}</li>
			))}
		</ul>
	);
}

function ChangedInstructions({
	comparison,
}: {
	readonly comparison: SavedComparison;
}): React.JSX.Element {
	return (
		<div className="flex min-w-0 flex-col gap-2">
			<SectionLabel>Instruction change</SectionLabel>
			{changedPathsReading(comparison)}
		</div>
	);
}

function ComparisonSetup({
	comparison,
}: {
	readonly comparison: SavedComparison;
}): React.JSX.Element {
	return (
		<div className="grid min-w-0 gap-6 lg:grid-cols-2">
			<div className="flex min-w-0 flex-col gap-5">
				{comparison.details?.map((detail) => (
					<section
						key={detail.caseId}
						className="flex min-w-0 flex-col gap-2"
						aria-label={`Setup for ${detail.caseId}`}
					>
						<h3 className="font-medium">{detail.caseId}</h3>
						<p className="font-mono text-13">
							{detail.changedPaths.length === 0
								? "Identical corpora"
								: detail.changedPaths.join(", ")}
						</p>
						<dl className="grid grid-cols-1 gap-2 text-12 text-muted-foreground sm:grid-cols-3">
							{(["baseline", "candidate", "control"] as const).map((arm) => (
								<div key={arm} className="flex min-w-0 flex-col gap-1">
									<dt className="capitalize">{arm}</dt>
									<dd className="font-mono text-secondary-foreground">
										{corpusVersionText(detail.corpusVersions[arm])}
									</dd>
								</div>
							))}
						</dl>
					</section>
				))}
				{comparison.details === undefined || comparison.details.length === 0 ? (
					<p className="text-muted-foreground">Change details not recorded</p>
				) : null}
			</div>
			<div className="flex min-w-0 flex-col gap-2">
				<SectionLabel>Canonical ID</SectionLabel>
				<code className="font-mono text-13 text-secondary-foreground">
					{comparison.digest}
				</code>
				<p className="text-12 text-muted-foreground">
					Comparison time not recorded
				</p>
			</div>
		</div>
	);
}

function ComparisonEntry({
	comparison,
}: {
	readonly comparison: SavedComparison;
}): React.JSX.Element {
	const address = `/comparisons/${encodeURIComponent(comparison.digest)}`;
	return (
		<RecordListItem
			title={
				<Link
					to={address}
					aria-label={`${comparison.caseIds.join(", ")} · ${comparison.digest.slice(0, 12)}`}
					className="text-foreground no-underline hover:text-link hover:underline"
				>
					{comparison.caseIds.join(", ")}
				</Link>
			}
			meta={
				<>
					<StateBadge>
						<span className="capitalize">{comparison.mode}</span>
					</StateBadge>
					<span>{comparison.reps} requested per arm</span>
					<code className="font-mono">{comparison.digest.slice(0, 12)}</code>
				</>
			}
			action={
				<Button asChild variant="outline">
					<Link to={address}>
						Open comparison
						<ArrowRight aria-hidden="true" className="size-4 shrink-0" />
					</Link>
				</Button>
			}
			details={<ComparisonSetup comparison={comparison} />}
		>
			<ChangedInstructions comparison={comparison} />
		</RecordListItem>
	);
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

			<PageContent>
				<p className="max-w-prose text-14 leading-reading text-secondary-foreground">
					Compare the baseline before an edit, the candidate after it, and the
					recorded control. Open a comparison to inspect measured changes and
					saved attempts.
				</p>
				{query.isLoading ? (
					<p className="text-muted-foreground">Loading…</p>
				) : null}
				{query.isError ? (
					<p role="alert" className="text-attention">
						<span aria-hidden="true">⚠ </span>
						Could not load the saved comparisons.
					</p>
				) : null}

				{unreadable.length > 0 ? (
					<Notice
						message="These comparisons could not be read, so no entry shows them:"
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
