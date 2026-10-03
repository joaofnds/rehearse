import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { plural } from "#client/plural";
import { ScreenHeader } from "#client/system/components/screen-header";
import { SectionLabel } from "#client/system/components/section-label";
import { TableShell } from "#client/system/components/table-shell";
import { Button } from "#client/system/ui/button";
import {
	agreementPercent,
	agreementReading,
	driftReading,
	reviewPath,
	reviewsLine,
	stepLabel,
} from "./calibration-figures";
import type { CalibrationResponse } from "./calibration-query";
import { calibrationQuery } from "./calibration-query";

type AgreementRow = CalibrationResponse["rows"][number];
type DriftGroup = CalibrationResponse["groups"][number];

const COLUMNS = [
	"Step",
	"Judge",
	"You",
	"Agreement",
	"Where you differed",
] as const;

const AGREEMENT_COLOURS = {
	"✓": "text-muted-foreground",
	"≈": "text-secondary-foreground",
	"✕": "text-foreground",
} as const;

const RUBRIC_DIGEST_LENGTH = 12;

function Subline({
	reviews,
	withinOneStep,
}: {
	readonly reviews: number;
	readonly withinOneStep: number;
}): React.JSX.Element {
	if (reviews === 0) {
		return <>{reviewsLine(reviews)}</>;
	}

	return (
		<>
			{reviewsLine(reviews)} · agreement within one letter step on{" "}
			<span className="font-mono">
				{withinOneStep}/{reviews}
			</span>{" "}
			({agreementPercent(withinOneStep, reviews)})
		</>
	);
}

function whereTheyDiffered(row: AgreementRow): string {
	if (row.note !== null) {
		return row.note;
	}
	if (row.differences.length === 0) {
		return "—";
	}

	return row.differences
		.map(
			({ criterion, judge, operator }) =>
				`${criterion}: judge ${judge}, you ${operator}`,
		)
		.join("; ");
}

function rowFor(row: AgreementRow): readonly React.ReactNode[] {
	const agreement = agreementReading(row.stepsApart);

	return [
		<span key="step" className="font-mono text-11-5 text-secondary-foreground">
			{stepLabel(row.stage, row.stageName)}
		</span>,
		<span key="judge" className="font-mono font-bold">
			{row.judgeGrade}
		</span>,
		<span key="you" className="font-mono font-bold">
			{row.operatorGrade}
		</span>,
		<span
			key="agreement"
			className={`inline-flex items-center gap-1.5 text-11-5 ${AGREEMENT_COLOURS[agreement.glyph]}`}
		>
			<span aria-hidden="true">{agreement.glyph}</span>
			{agreement.label}
		</span>,
		<span key="differed" className="text-11-5 text-muted-foreground">
			{whereTheyDiffered(row)}
		</span>,
	];
}

function groupLine(group: DriftGroup): string {
	const rubric =
		group.rubricSha256 === null
			? "rubric not recorded"
			: `rubric ${group.rubricSha256.slice(0, RUBRIC_DIGEST_LENGTH)}`;

	return [
		group.judgeModel ?? "Judge model not recorded",
		group.stage,
		rubric,
		plural(group.reviews, "review"),
	].join(" · ");
}

function DriftList({
	group,
}: {
	readonly group: DriftGroup;
}): React.JSX.Element {
	return (
		<ul className="mt-2 flex flex-col gap-2">
			{group.drift.map(({ dimension, steps }) => {
				const reading = driftReading(steps);

				return (
					<li key={dimension}>
						<div className="flex items-baseline gap-2">
							<span className="flex-1 text-12">{dimension}</span>
							<span className="font-mono text-11-5 text-secondary-foreground">
								{reading.value}
							</span>
						</div>
						<div
							aria-hidden="true"
							className="font-mono text-10 tracking-widest text-deep"
						>
							{reading.bar}
						</div>
					</li>
				);
			})}
		</ul>
	);
}

/**
 * One group at a time, the one with the most operator grades first as the
 * server orders them, since a figure that blends two Judges or two rubrics
 * says how far to trust neither.
 */
function DriftAside({
	groups,
}: {
	readonly groups: readonly DriftGroup[];
}): React.JSX.Element {
	const headingId = useId();
	const selectId = useId();
	const [chosen, setChosen] = useState<string | undefined>(undefined);
	const shown =
		groups.find((group) => groupLine(group) === chosen) ?? groups[0];

	return (
		<aside
			aria-labelledby={headingId}
			className="self-start rounded-lg border border-strong bg-raised px-3.5 py-3"
		>
			<h2 id={headingId}>
				<SectionLabel>Where the judge drifts</SectionLabel>
			</h2>
			{groups.length > 1 && shown !== undefined ? (
				<div className="mt-2 flex flex-col gap-1">
					<label htmlFor={selectId} className="text-11 text-dim">
						Judge group
					</label>
					<select
						id={selectId}
						value={groupLine(shown)}
						onChange={(event) => {
							setChosen(event.target.value);
						}}
						className="min-h-11 rounded-md border border-strong bg-background px-2 text-11-5"
					>
						{groups.map((group) => (
							<option key={groupLine(group)} value={groupLine(group)}>
								{groupLine(group)}
							</option>
						))}
					</select>
				</div>
			) : null}
			{shown === undefined ? null : (
				<section className="mt-2">
					{groups.length > 1 ? null : (
						<p className="text-11 text-dim">{groupLine(shown)}</p>
					)}
					<DriftList group={shown} />
				</section>
			)}
			<p className="mt-3 text-11-5 text-pretty text-muted-foreground">
				Calibration does not change a grade. It tells you how much to trust one.
			</p>
		</aside>
	);
}

function ReviewNext({
	next,
	reviews,
}: {
	readonly next: CalibrationResponse["next"];
	readonly reviews: number;
}): React.JSX.Element {
	if (next === null) {
		return (
			<div className="flex items-center gap-3">
				<span className="text-11-5 text-dim">
					{reviews === 0
						? "No step the judge graded is recorded yet."
						: "Every judged step is graded."}
				</span>
				<Button size="compact" disabled>
					Review next unjudged step
				</Button>
			</div>
		);
	}

	return (
		<Button asChild size="compact">
			<Link to={reviewPath(next)}>Review next unjudged step</Link>
		</Button>
	);
}

export function CalibrationPage(): React.JSX.Element {
	const query = useQuery(calibrationQuery);
	const report = query.data;

	return (
		<div>
			<ScreenHeader
				title="Judge calibration"
				subline={
					report === undefined ? undefined : (
						<Subline
							reviews={report.reviews}
							withinOneStep={report.withinOneStep}
						/>
					)
				}
				aside={
					report === undefined ? undefined : (
						<ReviewNext next={report.next} reviews={report.reviews} />
					)
				}
			/>

			<div className="px-5 pt-3.5 pb-9">
				{query.isLoading ? (
					<p className="text-muted-foreground">Loading…</p>
				) : null}
				{query.isError ? (
					<p role="alert" className="text-muted-foreground">
						<span aria-hidden="true">⚠ </span>
						Could not load the calibration report.
					</p>
				) : null}

				{report === undefined ? null : (
					<div className="grid max-w-250 grid-cols-1 gap-4.5 lg:grid-cols-calibration">
						<div className="min-w-0 self-start overflow-x-auto">
							<TableShell
								caption="Your grade against the judge's, same evidence"
								columns={[...COLUMNS]}
								rows={report.rows.map((row) => rowFor(row))}
							/>
						</div>
						<DriftAside groups={report.groups} />
					</div>
				)}
			</div>
		</div>
	);
}
