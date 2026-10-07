import type { ComparisonArm } from "#benchmark/comparison-record";
import { STAGE_LETTER_GRADES } from "#benchmark/stage-letter-grades";
import { TableShell } from "#client/system/components/table-shell";
import type {
	QualityInterval,
	QualityReading,
} from "#server/comparison-quality-reading";
import type { MeterReading, WhatMovedRow } from "#server/comparison-what-moved";
import { pairKey } from "#server/comparison-arm-pair";
import { armProse, DESIGN_ARMS } from "./design-arms";
import { meterReadingText, qualityReadingText } from "./reading-text";
import type { ReadingText } from "./reading-text";

type OverallRow = Extract<WhatMovedRow, { readonly kind: "overall" }>;
type MeterRow = Extract<WhatMovedRow, { readonly kind: "meter" }>;

interface MeterInterval {
	readonly low: number;
	readonly high: number;
}

/** Positions on a measure's own axis, from the bottom of its scale up. */
interface Span {
	readonly low: number;
	readonly high: number;
}

const LETTERS_UP: readonly string[] = STAGE_LETTER_GRADES.toReversed();
const METER_CELLS = 8;
const B_AGAINST_A = pairKey("candidate", "baseline");
const KIND_LABELS = {
	overall: "overall",
	hardBlocker: "hard blocker",
	dimension: "dimension",
	meter: "meter",
} as const satisfies Readonly<Record<WhatMovedRow["kind"], string>>;
const METER_NAMES = {
	replyLength: "reply length",
	costPerAttempt: "cost per attempt",
} as const satisfies Readonly<Record<MeterRow["name"], string>>;

function letterSpan(interval: QualityInterval): Span {
	return {
		low: LETTERS_UP.indexOf(interval.low),
		high: LETTERS_UP.indexOf(interval.high),
	};
}

function percentOf(label: string): number {
	return Number(label.replace("%", ""));
}

function percentSpan(interval: QualityInterval): Span {
	return {
		low: Math.floor(percentOf(interval.low) / 10),
		high: Math.floor(percentOf(interval.high) / 10),
	};
}

function meterSpans(
	intervals: readonly (MeterInterval | undefined)[],
): readonly (Span | undefined)[] {
	const recorded = intervals.filter((interval) => interval !== undefined);
	const bottom = Math.min(...recorded.map(({ low }) => low));
	const top = Math.max(...recorded.map(({ high }) => high));
	const position = (value: number): number =>
		top === bottom
			? 0
			: Math.round(((value - bottom) / (top - bottom)) * (METER_CELLS - 1));

	return intervals.map((interval) =>
		interval === undefined
			? undefined
			: { low: position(interval.low), high: position(interval.high) },
	);
}

/**
 * Arms A and B across the positions either covers, `┼` where both arms'
 * attempts reach, `─` where only one arm's do and a space where neither does.
 */
function spreadDrawing(spans: readonly (Span | undefined)[]): string {
	const recorded = spans.filter((span) => span !== undefined);
	if (recorded.length === 0) {
		return "";
	}

	const bottom = Math.min(...recorded.map(({ low }) => low));
	const top = Math.max(...recorded.map(({ high }) => high));
	const cells = Array.from({ length: top - bottom + 1 }, (_empty, offset) => {
		const reached = recorded.filter(
			({ low, high }) => low <= bottom + offset && bottom + offset <= high,
		);

		if (reached.length === 0) {
			return " ";
		}

		return reached.length > 1 ? "┼" : "─";
	});

	return `├${cells.join("")}┤`;
}

function rangeText(
	arm: ComparisonArm,
	interval: { readonly low: string; readonly high: string } | undefined,
): string {
	return interval === undefined
		? `${armProse(arm)} not recorded`
		: `${armProse(arm)} ${interval.low} to ${interval.high}`;
}

function meterValue(name: MeterRow["name"], value: number): string {
	return name === "costPerAttempt"
		? `$${value.toFixed(2)}`
		: `${String(Math.round(value))} words`;
}

function meterRange(
	name: MeterRow["name"],
	interval: MeterInterval | undefined,
): { readonly low: string; readonly high: string } | undefined {
	if (interval === undefined) {
		return undefined;
	}
	if (name === "costPerAttempt") {
		return {
			low: meterValue(name, interval.low),
			high: meterValue(name, interval.high),
		};
	}

	return {
		low: String(Math.round(interval.low)),
		high: meterValue(name, interval.high),
	};
}

function armReasons(row: WhatMovedRow): readonly string[] {
	const reasons = (["baseline", "candidate"] as const).flatMap((arm) => {
		switch (row.kind) {
			case "overall": {
				const figure = row.arms[arm];
				return figure?.scale === "letters" &&
					figure.grades.state === "unavailable"
					? figure.grades.reasons
					: [];
			}
			case "hardBlocker":
			case "dimension":
			case "meter": {
				const reading = row.arms[arm];
				return reading.state === "unavailable" ? reading.reasons : [];
			}
			default: {
				return row satisfies never;
			}
		}
	});

	return [...new Set(reasons)];
}

interface Spread {
	readonly drawing: string;
	readonly note: string;
}

function labelSpread(
	reading: QualityReading,
	toSpan: (interval: QualityInterval) => Span,
): Spread {
	const { minuend, subtrahend } = reading.interval;

	return {
		drawing: spreadDrawing(
			[subtrahend, minuend].map((interval) =>
				interval === undefined ? undefined : toSpan(interval),
			),
		),
		note: `${rangeText("baseline", subtrahend)} · ${rangeText("candidate", minuend)}`,
	};
}

function meterSpread(row: MeterRow, reading: MeterReading): Spread {
	const { minuend, subtrahend } = reading.interval;
	const ranges = `${rangeText("baseline", meterRange(row.name, subtrahend))} · ${rangeText("candidate", meterRange(row.name, minuend))}`;

	return {
		drawing: spreadDrawing(meterSpans([subtrahend, minuend])),
		note:
			reading.change === undefined ? ranges : `${ranges} · ${reading.change}`,
	};
}

function overallSpan(row: OverallRow): (interval: QualityInterval) => Span {
	return row.arms.baseline?.scale === "successRate" ? percentSpan : letterSpan;
}

function spreadOf(row: WhatMovedRow): Spread | undefined {
	switch (row.kind) {
		case "overall": {
			const reading = row.readings[B_AGAINST_A];
			return reading === undefined
				? undefined
				: labelSpread(reading, overallSpan(row));
		}
		case "hardBlocker": {
			const reading = row.readings[B_AGAINST_A];
			return reading === undefined
				? undefined
				: labelSpread(reading, percentSpan);
		}
		case "dimension": {
			const reading = row.readings[B_AGAINST_A];
			return reading === undefined
				? undefined
				: labelSpread(reading, letterSpan);
		}
		case "meter": {
			const reading = row.readings[B_AGAINST_A];
			return reading === undefined ? undefined : meterSpread(row, reading);
		}
		default: {
			return row satisfies never;
		}
	}
}

function readingOf(row: WhatMovedRow): ReadingText | undefined {
	if (row.kind === "meter") {
		const reading = row.readings[B_AGAINST_A];
		return reading === undefined
			? undefined
			: meterReadingText(reading.verdict);
	}

	const reading = row.readings[B_AGAINST_A];

	return reading === undefined
		? undefined
		: qualityReadingText(reading.verdict);
}

function armFigure(row: WhatMovedRow, arm: ComparisonArm): string {
	switch (row.kind) {
		case "overall": {
			const figure = row.arms[arm];
			if (figure === undefined) {
				return "not recorded";
			}
			if (figure.scale === "successRate") {
				return `${String(figure.successful)}/${String(figure.attempts)} passed`;
			}

			return figure.grades.state === "available"
				? figure.grades.median
				: "not recorded";
		}
		case "hardBlocker": {
			const firings = row.arms[arm];
			return firings.state === "available"
				? `${String(firings.fired)}/${String(firings.of)} fired`
				: "not recorded";
		}
		case "dimension": {
			const range = row.arms[arm];
			return range.state === "available" ? range.median : "not recorded";
		}
		case "meter": {
			const spread = row.arms[arm];
			return spread.state === "available"
				? meterValue(row.name, spread.mean)
				: "not recorded";
		}
		default: {
			return row satisfies never;
		}
	}
}

function measureName(row: WhatMovedRow): string {
	return row.kind === "meter" ? METER_NAMES[row.name] : row.name;
}

function measureKind(row: WhatMovedRow): string {
	return row.kind === "hardBlocker" || row.kind === "dimension"
		? `${row.stage} · ${KIND_LABELS[row.kind]}`
		: KIND_LABELS[row.kind];
}

function SpreadCell({
	row,
}: {
	readonly row: WhatMovedRow;
}): React.JSX.Element {
	const spread = spreadOf(row);
	const reasons = armReasons(row);

	return (
		<div className="flex flex-col gap-0.5">
			<span
				aria-hidden="true"
				className="font-mono text-11 tracking-widest whitespace-pre text-deep"
			>
				{spread?.drawing}
			</span>
			<span className="text-10-5 text-dim">{spread?.note}</span>
			{reasons.length === 0 ? null : (
				<span className="text-10-5 text-dim">{reasons.join("; ")}</span>
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
	if (reading === undefined) {
		return null;
	}

	return (
		<span className="inline-flex items-baseline gap-1.5">
			<span aria-hidden="true">{reading.glyph}</span>
			<span>{reading.phrase}</span>
		</span>
	);
}

function whatMovedRow(row: WhatMovedRow): readonly React.ReactNode[] {
	const cells = DESIGN_ARMS.map(({ arm }) => (
		<span
			key={arm}
			className={
				arm === "control"
					? "font-mono font-bold text-muted-foreground"
					: "font-mono font-bold"
			}
		>
			{armFigure(row, arm)}
		</span>
	));

	return [
		<span key="measure" className="flex flex-col">
			<span>{measureName(row)}</span>
			<span className="text-11 font-normal text-dim">{measureKind(row)}</span>
		</span>,
		...cells,
		<SpreadCell key="spread" row={row} />,
		<ReadingCell key="reading" row={row} />,
	];
}

function spreadColumn(
	attemptsPerArm: Readonly<Record<ComparisonArm, number>>,
): string {
	const counts = new Set([attemptsPerArm.baseline, attemptsPerArm.candidate]);
	const [only] = counts;

	return counts.size === 1 && only !== undefined
		? `Spread across ${String(only)} attempts`
		: "Spread across attempts";
}

/** Each measure of one case, every arm's figure beside arm B against arm A. */
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
		<div className="max-w-301">
			<TableShell
				caption={
					<>
						{"What moved · "}
						<span className="font-mono tracking-normal normal-case">
							{caseId}
						</span>
					</>
				}
				columns={[
					"Measure",
					...DESIGN_ARMS.map(({ role }) => role),
					spreadColumn(attemptsPerArm),
					"Reading",
				]}
				rows={rows.map((row) => whatMovedRow(row))}
			/>
		</div>
	);
}
