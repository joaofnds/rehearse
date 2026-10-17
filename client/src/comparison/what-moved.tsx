import type { ComparisonArm } from "#benchmark/comparison-record";
import { STAGE_LETTER_GRADES } from "#benchmark/stage-letter-grades";
import { RangePlot } from "#client/system/components/range-plot";
import { TableShell } from "#client/system/components/table-shell";
import { armPairs, pairKey } from "#server/comparison-arm-pair";
import type { QualityInterval } from "#server/comparison-quality-reading";
import type { WhatMovedRow } from "#server/comparison-what-moved";
import { DESIGN_ARMS } from "./design-arms";
import { meterReadingText, qualityReadingText } from "./reading-text";
import type { ReadingText } from "./reading-text";

type MeterRow = Extract<WhatMovedRow, { readonly kind: "meter" }>;
const LETTERS_UP: readonly string[] = STAGE_LETTER_GRADES.toReversed();
const CANDIDATE_AGAINST_BASELINE = pairKey("candidate", "baseline");
const METER_NAMES = {
	replyLength: "Reply length",
	costPerAttempt: "Cost per attempt",
} as const;

function measureName(row: WhatMovedRow): string {
	return row.kind === "meter" ? METER_NAMES[row.name] : row.name;
}

function rateScale(row: WhatMovedRow): boolean {
	return (
		row.kind === "hardBlocker" ||
		(row.kind === "overall" &&
			DESIGN_ARMS.some(({ arm }) => row.arms[arm]?.scale === "successRate"))
	);
}

function intervalLabel(row: WhatMovedRow): string {
	if (rateScale(row)) {
		return row.kind === "hardBlocker"
			? "Firing rate · 95% confidence interval"
			: "Pass rate · 95% confidence interval";
	}

	return row.kind === "meter"
		? "Mean and observed range"
		: "Median and observed grade range";
}

function meterValue(name: MeterRow["name"], value: number): string {
	return name === "costPerAttempt"
		? `$${value.toFixed(2)}`
		: `${String(Math.round(value))} words`;
}

function readingOf(row: WhatMovedRow): ReadingText | undefined {
	if (row.kind === "meter") {
		const reading = row.readings[CANDIDATE_AGAINST_BASELINE];
		return reading === undefined
			? undefined
			: meterReadingText(reading.verdict);
	}

	const reading = row.readings[CANDIDATE_AGAINST_BASELINE];
	return reading === undefined
		? undefined
		: qualityReadingText(reading.verdict);
}

function armFigure(row: WhatMovedRow, arm: ComparisonArm): string {
	switch (row.kind) {
		case "overall": {
			const figure = row.arms[arm];
			if (figure === undefined) {
				return "Not recorded";
			}

			if (figure.scale === "successRate") {
				return `${figure.successful}/${figure.attempts} passed`;
			}

			return figure.grades.state === "available"
				? `${figure.grades.median} · n=${figure.grades.graded}`
				: "Not recorded";
		}
		case "hardBlocker": {
			const figure = row.arms[arm];
			return figure.state === "available"
				? `${figure.fired}/${figure.of} fired`
				: "Not recorded";
		}
		case "dimension": {
			const figure = row.arms[arm];
			return figure.state === "available"
				? `${figure.median} · ${figure.graded === undefined ? "count not recorded" : `n=${figure.graded}`}`
				: "Not recorded";
		}
		case "meter": {
			const figure = row.arms[arm];
			return figure.state === "available"
				? `${meterValue(row.name, figure.mean)} · n=${figure.counted}`
				: "Not recorded";
		}
		default: {
			return row satisfies never;
		}
	}
}

function qualityInterval(
	row: Exclude<WhatMovedRow, MeterRow>,
	arm: ComparisonArm,
): QualityInterval | undefined {
	for (const pair of armPairs()) {
		const reading = row.readings[pairKey(pair.minuend, pair.subtrahend)];
		if (pair.minuend === arm && reading?.interval.minuend !== undefined) {
			return reading.interval.minuend;
		}
		if (pair.subtrahend === arm && reading?.interval.subtrahend !== undefined) {
			return reading.interval.subtrahend;
		}
	}

	return undefined;
}

function armPoint(
	row: Exclude<WhatMovedRow, MeterRow>,
	arm: ComparisonArm,
): number | undefined {
	switch (row.kind) {
		case "overall": {
			const figure = row.arms[arm];
			if (figure?.scale === "successRate") {
				return figure.attempts === 0
					? undefined
					: (figure.successful / figure.attempts) * 100;
			}

			return figure?.grades.state === "available"
				? LETTERS_UP.indexOf(figure.grades.median)
				: undefined;
		}
		case "hardBlocker": {
			const figure = row.arms[arm];
			return figure.state === "available" && figure.of > 0
				? (figure.fired / figure.of) * 100
				: undefined;
		}
		case "dimension": {
			const figure = row.arms[arm];
			return figure.state === "available"
				? LETTERS_UP.indexOf(figure.median)
				: undefined;
		}
		default: {
			return row satisfies never;
		}
	}
}

function armRange(
	row: WhatMovedRow,
	arm: ComparisonArm,
):
	| { readonly low: number; readonly high: number; readonly value?: number }
	| undefined {
	if (row.kind === "meter") {
		const figure = row.arms[arm];
		return figure.state === "available"
			? { low: figure.low, high: figure.high, value: figure.mean }
			: undefined;
	}

	if (row.kind === "overall") {
		const figure = row.arms[arm];
		if (figure?.scale === "letters" && figure.grades.state === "available") {
			return {
				low: LETTERS_UP.indexOf(figure.grades.lowest),
				high: LETTERS_UP.indexOf(figure.grades.highest),
				value: LETTERS_UP.indexOf(figure.grades.median),
			};
		}
	}
	if (row.kind === "dimension" && row.arms[arm].state === "available") {
		const figure = row.arms[arm];
		if (figure.state === "available") {
			return {
				low: LETTERS_UP.indexOf(figure.lowest),
				high: LETTERS_UP.indexOf(figure.highest),
				value: LETTERS_UP.indexOf(figure.median),
			};
		}
	}

	const interval = qualityInterval(row, arm);
	if (interval === undefined) {
		return undefined;
	}

	if (rateScale(row)) {
		const range = {
			low: Number(interval.low.replace("%", "")),
			high: Number(interval.high.replace("%", "")),
		};
		const value = armPoint(row, arm);
		return value === undefined ? range : { ...range, value };
	}

	return {
		low: LETTERS_UP.indexOf(interval.low),
		high: LETTERS_UP.indexOf(interval.high),
	};
}

function armReasons(row: WhatMovedRow): readonly string[] {
	return [
		...new Set(
			DESIGN_ARMS.flatMap(({ arm }) => {
				if (row.kind === "overall") {
					const figure = row.arms[arm];
					return figure?.scale === "letters" &&
						figure.grades.state === "unavailable"
						? figure.grades.reasons
						: [];
				}

				const figure = row.arms[arm];
				return figure.state === "unavailable" ? figure.reasons : [];
			}),
		),
	];
}

function SpreadCell({
	row,
}: {
	readonly row: WhatMovedRow;
}): React.JSX.Element {
	const rows = DESIGN_ARMS.flatMap(({ arm, role }) => {
		const range = armRange(row, arm);
		return range === undefined
			? []
			: [
					{
						id: arm,
						label: role.replace(" (before)", "").replace(" (after)", ""),
						...range,
					},
				];
	});
	const rate = rateScale(row);
	const minimum =
		row.kind === "meter" ? Math.min(0, ...rows.map(({ low }) => low)) : 0;
	let maximum = LETTERS_UP.length - 1;
	let valueLabel = "median";
	if (rate) {
		maximum = 100;
		valueLabel = "observed rate";
	} else if (row.kind === "meter") {
		maximum = Math.max(0, ...rows.map(({ high }) => high)) || 1;
		valueLabel = "mean";
	}

	const formatValue = (value: number): string => {
		if (row.kind === "meter") {
			return meterValue(row.name, value);
		}

		return rate
			? `${Math.round(value)}%`
			: (LETTERS_UP[Math.round(value)] ?? "");
	};
	const reasons = armReasons(row);
	const missing = DESIGN_ARMS.filter(
		({ arm }) => !rows.some(({ id }) => id === arm),
	);
	const change =
		row.kind === "meter"
			? row.readings[CANDIDATE_AGAINST_BASELINE]?.change
			: undefined;

	return (
		<div className="flex min-w-72 flex-col gap-2">
			{rows.length === 0 ? null : (
				<RangePlot
					label={`${measureName(row)} · ${intervalLabel(row)}`}
					minimum={minimum}
					maximum={maximum}
					formatValue={formatValue}
					valueLabel={valueLabel}
					rows={rows}
				/>
			)}
			<span className="text-12 text-muted-foreground">
				{intervalLabel(row)}
				{change === undefined ? "" : ` · candidate mean ${change} vs baseline`}
			</span>
			{missing.length === 0 ? null : (
				<span className="text-12 text-muted-foreground">
					{missing.map(({ role }) => `${role}: range not recorded`).join(" · ")}
				</span>
			)}
			{reasons.length === 0 ? null : (
				<span className="text-12 text-muted-foreground">
					{reasons.join("; ")}
				</span>
			)}
		</div>
	);
}

function ReadingCell({
	row,
}: {
	readonly row: WhatMovedRow;
}): React.JSX.Element | null {
	const reading = readingOf(row);
	return reading === undefined ? null : (
		<span className="text-14">{reading.phrase}</span>
	);
}

function whatMovedRow(row: WhatMovedRow): readonly React.ReactNode[] {
	let kind = "Recorded outcome";
	if (row.kind === "hardBlocker") {
		kind = `${row.stage} · hard blocker`;
	} else if (row.kind === "dimension") {
		kind = `${row.stage} · dimension`;
	} else if (row.kind === "meter") {
		kind = "Per-attempt mean";
	}

	return [
		<span key="measure" className="flex flex-col gap-1">
			<span className="text-14 font-medium">{measureName(row)}</span>
			<span className="text-12 text-muted-foreground">{kind}</span>
		</span>,
		...DESIGN_ARMS.map(({ arm }) => (
			<span key={arm} className="text-14 font-medium tabular-nums">
				{armFigure(row, arm)}
			</span>
		)),
		<SpreadCell key="spread" row={row} />,
		<ReadingCell key="reading" row={row} />,
	];
}

export function WhatMoved({
	caseId,
	rows,
	attemptsPerArm,
}: {
	readonly caseId: string;
	readonly rows: readonly WhatMovedRow[];
	readonly attemptsPerArm: Readonly<Record<ComparisonArm, number>>;
}): React.JSX.Element {
	return (
		<div className="flex flex-col gap-2 overflow-x-auto">
			<p className="text-12 text-muted-foreground">
				Saved attempts:{" "}
				{DESIGN_ARMS.map(
					({ arm, role }) => `${role} ${attemptsPerArm[arm]}`,
				).join(" · ")}
				. Coverage is shown per measure. Passing every recorded attempt does not
				establish equivalent quality.
			</p>
			<TableShell
				caption={
					<>
						What moved ·{" "}
						<span className="font-mono tracking-normal normal-case">
							{caseId}
						</span>
					</>
				}
				columns={[
					"Measure",
					...DESIGN_ARMS.map(({ role }) => role),
					"Range and uncertainty",
					"Candidate vs baseline",
				]}
				rows={rows.map((row) => whatMovedRow(row))}
			/>
		</div>
	);
}
