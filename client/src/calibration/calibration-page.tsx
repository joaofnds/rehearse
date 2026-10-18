import { NativeSelect } from "#client/system/ui/native-select";
import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { plural } from "#client/plural";
import { ScreenHeader } from "#client/system/components/screen-header";
import { SectionLabel } from "#client/system/components/section-label";
import { TableShell } from "#client/system/components/table-shell";
import { SummaryPanel } from "#client/system/components/summary-panel";
import { StateBadge } from "#client/system/components/state-badge";
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
		<span key="step" className="font-mono text-13 text-secondary-foreground">
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
			className={`inline-flex items-center gap-1.5 text-14 ${AGREEMENT_COLOURS[agreement.glyph]}`}
		>
			<span aria-hidden="true">{agreement.glyph}</span>
			{agreement.label}
		</span>,
		<span key="differed" className="text-14 text-muted-foreground">
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

/**
 * What a group is, apart from how it reads: the line carries the review
 * count, which changes when a grade lands and would lose the choice.
 */
function groupKey(group: DriftGroup): string {
	return JSON.stringify([group.judgeModel, group.stage, group.rubricSha256]);
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
						<div className="flex min-w-0 flex-wrap items-baseline gap-2">
							<span className="min-w-0 flex-1 text-14 wrap-anywhere">
								{dimension}
							</span>
							<span className="font-mono text-12 text-secondary-foreground">
								{reading.value}
							</span>
						</div>
						<div
							aria-hidden="true"
							className="font-mono text-12 tracking-widest text-deep"
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
	const shown = groups.find((group) => groupKey(group) === chosen) ?? groups[0];

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
					<label htmlFor={selectId} className="text-12 text-dim">
						Judge group
					</label>
					<NativeSelect
						id={selectId}
						value={groupKey(shown)}
						onChange={(event) => {
							setChosen(event.target.value);
						}}
					>
						{groups.map((group) => (
							<option key={groupKey(group)} value={groupKey(group)}>
								{groupLine(group)}
							</option>
						))}
					</NativeSelect>
				</div>
			) : null}
			{shown === undefined ? null : (
				<section className="mt-2">
					<p className="text-12 text-dim wrap-anywhere">{groupLine(shown)}</p>
					<DriftList group={shown} />
				</section>
			)}
			<p className="mt-3 text-14 text-pretty text-muted-foreground">
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
				<span className="text-12 text-dim">
					{reviews === 0
						? "No step the judge graded is recorded yet."
						: "Every judged step has your review."}
				</span>
				<Button size="compact" disabled>
					Review next step
				</Button>
			</div>
		);
	}

	return (
		<Button asChild size="compact">
			<Link to={reviewPath(next)}>Review next step</Link>
		</Button>
	);
}

function FirstReview({
	report,
}: {
	readonly report: CalibrationResponse;
}): React.JSX.Element {
	return (
		<SummaryPanel
			title="Your first calibration review"
			description="Compare your judgment with the Judge's using the same saved evidence."
		>
			<div className="flex flex-col gap-4 text-14">
				{report.ungraded > 0 ? (
					<div>
						<StateBadge tone="attention">
							{plural(report.ungraded, "step")} awaiting your review
						</StateBadge>
					</div>
				) : null}
				<p>
					Open a judged step, read its task and output, and grade each rubric
					criterion. Judge's scores stay hidden until you record your grade.
				</p>
				<p className="text-muted-foreground">
					Agreement and drift will appear after your first saved review.
					Calibration records your assessment; it does not change the original
					grade.
				</p>
				{report.next === null ? (
					<div>
						<Button asChild variant="outline">
							<Link to="/cases" search={{}}>
								Browse cases
							</Link>
						</Button>
					</div>
				) : null}
			</div>
		</SummaryPanel>
	);
}

function CalibrationReport({
	report,
}: {
	readonly report: CalibrationResponse;
}): React.JSX.Element {
	if (report.reviews === 0) {
		return (
			<div className="max-w-250">
				<FirstReview report={report} />
			</div>
		);
	}
	return (
		<div className="grid min-w-0 grid-cols-1 gap-4.5 lg:grid-cols-main-aside">
			<div className="min-w-0 self-start">
				<TableShell
					className="min-w-200 table-fixed"
					columnClasses={["w-56", "w-16", "w-16", "w-32", ""]}
					caption="Your grade against the judge's, same evidence"
					columns={[...COLUMNS]}
					rows={report.rows.map((row) => rowFor(row))}
				/>
			</div>
			<DriftAside groups={report.groups} />
		</div>
	);
}

export function CalibrationPage({
	embedded = false,
}: {
	readonly embedded?: boolean;
}): React.JSX.Element {
	const query = useQuery(calibrationQuery);
	const report = query.data;

	return (
		<div>
			{embedded ? (
				<div className="flex flex-wrap items-end justify-between gap-3 page-gutter pt-4">
					<div>
						<h2 className="text-16 font-semibold">Judge calibration</h2>
						{report === undefined ? null : (
							<p className="mt-1 text-12 text-dim">
								<Subline
									reviews={report.reviews}
									withinOneStep={report.withinOneStep}
								/>
							</p>
						)}
					</div>
					{report === undefined ? null : (
						<ReviewNext next={report.next} reviews={report.reviews} />
					)}
				</div>
			) : (
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
			)}

			<div className="page-gutter pt-3.5 pb-9">
				{query.isLoading ? (
					<p className="text-muted-foreground">Loading…</p>
				) : null}
				{query.isError ? (
					<p role="alert" className="text-attention">
						<span aria-hidden="true">⚠ </span>
						Could not load the calibration report.
					</p>
				) : null}

				{report === undefined ? null : <CalibrationReport report={report} />}
			</div>
		</div>
	);
}
