import { STAGE_LETTER_GRADES, gradeStep } from "#benchmark/stage-letter-grades";
import { Grade } from "#client/system/components/grade";
import { STATUS_VOCABULARY } from "#client/system/components/status";

import type { RowEvidence } from "./judge-evidence";
import ItemWithEvidence from "./judge-evidence";
import type { StageJudgeResponse } from "./stage-judge-query";

const NO_EVALUATED_BAR_CELLS = 0;

type JudgedAnswer = Extract<StageJudgeResponse, { readonly state: "judged" }>;

type BlockerState = "fired" | "clear" | "pending";

interface BlockerRow {
	readonly id: string;
	readonly state: BlockerState;
	readonly evidence: RowEvidence;
}

interface DimensionRow {
	readonly id: string;
	readonly grade: string | undefined;
	readonly evidence: RowEvidence;
	/** A line of the judge's reasoning beside the grade, where the reader shows one. */
	readonly note?: string | undefined;
}

const BLOCKER_TONES = {
	clear: { row: "border-border", text: "text-muted-foreground" },
	fired: {
		row: "border-deeper bg-fired",
		text: "text-bright",
	},
	pending: { row: "border-border", text: "text-dim" },
} as const satisfies Record<
	BlockerState,
	{ readonly row: string; readonly text: string }
>;

const BAR_CELLS = STAGE_LETTER_GRADES.length;

/** The dimension's five-cell bar: an A fills every cell, each step down one fewer. */
function gradeBar(grade: string | undefined): string {
	const step = grade === undefined ? undefined : gradeStep(grade);
	const filled = step === undefined ? NO_EVALUATED_BAR_CELLS : BAR_CELLS - step;

	return "▮".repeat(filled) + "▯".repeat(BAR_CELLS - filled);
}

function blockerState(status: "PASS" | "FAIL" | undefined): BlockerState {
	if (status === undefined) {
		return "pending";
	}

	return status === "FAIL" ? "fired" : "clear";
}

/** A hard blocker's glyph, id and state word, as each list of blockers draws it. */
interface BlockerLineProps {
	readonly row: Omit<BlockerRow, "evidence">;
}

function BlockerLine({ row }: BlockerLineProps): React.JSX.Element {
	const tone = BLOCKER_TONES[row.state];

	return (
		<>
			<span aria-hidden="true" className={`font-mono text-12 ${tone.text}`}>
				{STATUS_VOCABULARY[row.state].glyph}
			</span>
			<span className="min-w-0 flex-1 font-mono text-13 wrap-anywhere">
				{row.id}
			</span>
			<span className={`text-12 tracking-label uppercase ${tone.text}`}>
				{STATUS_VOCABULARY[row.state].word}
			</span>
		</>
	);
}

/** A quality dimension's name, note where shown, bar and grade. */
interface DimensionLineProps {
	readonly row: Omit<DimensionRow, "evidence">;
}

function DimensionLine({ row }: DimensionLineProps): React.JSX.Element {
	return (
		<span className="flex min-w-0 w-full flex-col gap-2">
			<span className="flex min-w-0 flex-wrap items-center gap-3">
				<span
					className={`min-w-0 flex-1 text-14 font-medium wrap-anywhere ${row.grade === undefined ? "text-dim" : "text-foreground"}`}
				>
					{row.id}
				</span>
				<span
					aria-hidden="true"
					className="font-mono text-12 tracking-bar text-faint"
				>
					{gradeBar(row.grade)}
				</span>
				<Grade
					value={
						row.grade === undefined ? { pending: true } : { letter: row.grade }
					}
					size="inline"
				/>
			</span>
			{row.note === undefined ? null : (
				<span className="text-14 leading-reading text-secondary-foreground">
					{row.note}
				</span>
			)}
		</span>
	);
}

interface BlockerRowsProps {
	readonly run: string;
	readonly stage: string;
	readonly rows: readonly BlockerRow[];
	readonly label?: string;
}

function BlockerRows({
	run,
	stage,
	rows,
	label = "Hard blockers",
}: BlockerRowsProps): React.JSX.Element {
	return (
		<ul aria-label={label} className="mt-2.5 flex flex-col gap-px">
			{rows.map((row) => {
				const tone = BLOCKER_TONES[row.state];

				return (
					<ItemWithEvidence
						key={row.id}
						owner={{ item: row.id, run, section: "hardBlockers", stage }}
						evidence={row.evidence}
						rowClassName={`flex min-w-0 flex-col items-start gap-2.75 rounded-md border px-3 py-2.25 ${tone.row}`}
						panelClassName="mb-1.25"
						label="Cited evidence"
						// Below the label, each citation keeps its distance from the one above.
						spacing="mt-2.5"
					>
						<span className="flex min-w-0 w-full items-center gap-2.75">
							<BlockerLine row={row} />
						</span>
					</ItemWithEvidence>
				);
			})}
		</ul>
	);
}

interface DimensionRowsProps {
	readonly run: string;
	readonly stage: string;
	readonly rows: readonly DimensionRow[];
}

function DimensionRows({
	run,
	stage,
	rows,
}: DimensionRowsProps): React.JSX.Element {
	return (
		<ul aria-label="Quality dimensions" className="mt-2.5 flex flex-col gap-px">
			{rows.map((row) => (
				<ItemWithEvidence
					key={row.id}
					owner={{ item: row.id, run, section: "dimensions", stage }}
					evidence={row.evidence}
					rowClassName="flex min-w-0 flex-col items-start gap-3 border-b border-subtle px-3 py-4"
					panelClassName="mb-1.75"
					spacing="mb-2.5"
				>
					<DimensionLine row={row} />
				</ItemWithEvidence>
			))}
		</ul>
	);
}

export {
	EvidenceLink,
	EvidenceToggle,
	Label,
	SourceChip,
} from "./judge-evidence";
export type { Evidence, EvidenceOwner, RowEvidence } from "./judge-evidence";
export { BlockerLine, BlockerRows, DimensionLine, DimensionRows, blockerState };
export type { BlockerRow, DimensionRow, JudgedAnswer };
