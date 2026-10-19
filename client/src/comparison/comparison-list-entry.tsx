import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { RecordListItem } from "#client/system/components/record-list";
import SectionLabel from "#client/system/components/section-label";
import StateBadge from "#client/system/components/state-badge";
import { Button } from "#client/system/ui/button";

import type { ComparisonIndexResponse } from "./comparison-index-query";
import { corpusVersionText } from "./design-arms";

const PREFIX_START_INDEX = 0;

const EMPTY_COLLECTION_LENGTH = 0;

const COMPARISON_DIGEST_PREVIEW_CHARACTERS = 12;

type SavedComparison = ComparisonIndexResponse["comparisons"][number];

function changedPathsReading(comparison: SavedComparison): React.JSX.Element {
	if (
		comparison.details === undefined ||
		comparison.details.length === EMPTY_COLLECTION_LENGTH
	) {
		return (
			<p className="text-14 text-muted-foreground">
				Change details not recorded
			</p>
		);
	}

	const paths = [
		...new Set(comparison.details.flatMap((detail) => detail.changedPaths)),
	];

	if (paths.length === EMPTY_COLLECTION_LENGTH) {
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

interface ChangedInstructionsProps {
	readonly comparison: SavedComparison;
}

function ChangedInstructions({
	comparison,
}: ChangedInstructionsProps): React.JSX.Element {
	return (
		<div className="flex min-w-0 flex-col gap-2">
			<SectionLabel>Instruction change</SectionLabel>
			{changedPathsReading(comparison)}
		</div>
	);
}

interface ComparisonSetupProps {
	readonly comparison: SavedComparison;
}

function ComparisonSetup({
	comparison,
}: ComparisonSetupProps): React.JSX.Element {
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
							{detail.changedPaths.length === EMPTY_COLLECTION_LENGTH
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
				{comparison.details === undefined ||
				comparison.details.length === EMPTY_COLLECTION_LENGTH ? (
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

interface ComparisonEntryProps {
	readonly comparison: SavedComparison;
}

function ComparisonEntry({
	comparison,
}: ComparisonEntryProps): React.JSX.Element {
	const address = `/comparisons/${encodeURIComponent(comparison.digest)}`;
	return (
		<RecordListItem
			title={
				<Link
					to={address}
					aria-label={`${comparison.caseIds.join(", ")} · ${comparison.digest.slice(PREFIX_START_INDEX, COMPARISON_DIGEST_PREVIEW_CHARACTERS)}`}
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
					<code className="font-mono">
						{comparison.digest.slice(
							PREFIX_START_INDEX,
							COMPARISON_DIGEST_PREVIEW_CHARACTERS,
						)}
					</code>
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

export { ComparisonEntry as default };
export type { SavedComparison };
