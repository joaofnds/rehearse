import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { gradeStep, STAGE_LETTER_GRADES } from "#benchmark/stage-letter-grades";
import { Grade } from "#client/system/components/grade";
import { STATUS_VOCABULARY } from "#client/system/components/status";
import type { StageJudgeResponse } from "./stage-judge-query";

export type JudgedAnswer = Extract<
	StageJudgeResponse,
	{ readonly state: "judged" }
>;
export type Evidence = JudgedAnswer["hardBlockers"][number]["evidence"][number];

/** A row's evidence: what the record cites, or pending until the record exists. */
export type RowEvidence = readonly Evidence[] | "pending";

type BlockerState = "fired" | "clear" | "pending";

export interface BlockerRow {
	readonly id: string;
	readonly state: BlockerState;
	readonly evidence: RowEvidence;
}

export interface DimensionRow {
	readonly id: string;
	readonly grade: string | undefined;
	readonly evidence: RowEvidence;
}

const BLOCKER_TONES = {
	fired: {
		row: "border-deeper bg-fired",
		text: "text-bright",
	},
	clear: { row: "border-border", text: "text-muted-foreground" },
	pending: { row: "border-border", text: "text-dim" },
} as const satisfies Record<
	BlockerState,
	{ readonly row: string; readonly text: string }
>;

const BAR_CELLS = STAGE_LETTER_GRADES.length;

/** The dimension's five-cell bar: an A fills every cell, each step down one fewer. */
function gradeBar(grade: string | undefined): string {
	const step = grade === undefined ? undefined : gradeStep(grade);
	const filled = step === undefined ? 0 : BAR_CELLS - step;

	return "▮".repeat(filled) + "▯".repeat(BAR_CELLS - filled);
}

export function blockerState(
	status: "PASS" | "FAIL" | undefined,
): BlockerState {
	if (status === undefined) {
		return "pending";
	}

	return status === "FAIL" ? "fired" : "clear";
}

/** The pane label the design sets in small capitals. */
export function Label({
	children,
}: {
	readonly children: React.ReactNode;
}): React.JSX.Element {
	return (
		<div className="text-10 tracking-label text-dim uppercase">{children}</div>
	);
}

/** What a closed toggle says of the evidence it would open. */
function closedToggleWords(evidence: RowEvidence): string {
	if (evidence === "pending") {
		return "evidence pending";
	}

	return evidence.length === 0
		? "no evidence"
		: `${String(evidence.length)} cited`;
}

function EvidenceToggle({
	evidence,
	shown,
	onToggle,
}: {
	readonly evidence: RowEvidence;
	readonly shown: string | undefined;
	readonly onToggle: () => void;
}): React.JSX.Element {
	const disabled = evidence === "pending" || evidence.length === 0;

	return (
		<button
			type="button"
			aria-expanded={shown !== undefined}
			aria-controls={shown}
			aria-disabled={disabled || undefined}
			onClick={disabled ? undefined : onToggle}
			className="flex-none rounded-tight border border-strong px-2.25 py-0.5 text-10-5 text-muted-foreground"
		>
			{shown === undefined ? closedToggleWords(evidence) : "hide evidence"}
		</button>
	);
}

interface EvidenceOwner {
	readonly run: string;
	readonly stage: string;
	readonly section: "hardBlockers" | "dimensions";
	readonly item: string;
}

function CitedEvidence({
	owner,
	evidence,
	spacing,
}: {
	readonly owner: EvidenceOwner;
	readonly evidence: readonly Evidence[];
	readonly spacing: string;
}): React.JSX.Element {
	return (
		<>
			{evidence.map((cited, index) => (
				<div
					// The record keeps an item's evidence in the order it was cited.
					key={String(index)}
					className={spacing}
				>
					<div className="flex items-center gap-2.5 font-mono text-10-5 text-muted-foreground">
						<span className="rounded-sm border border-strong px-1.5 py-0.25">
							{cited.source}
						</span>
						<Link
							to="/runs/$run/stages/$stage/evidence/$section/$item/$index"
							params={{ ...owner, index: String(index) }}
						>
							{cited.place ?? cited.path}
						</Link>
					</div>
					{cited.quote === undefined ? null : (
						<blockquote className="mt-1.5 border-l border-strong px-2.75 py-1.75 font-mono text-11-5 whitespace-pre-wrap text-bright">
							{cited.quote}
						</blockquote>
					)}
				</div>
			))}
		</>
	);
}

/**
 * One rubric item: its row, and beneath it inside the same list item the
 * evidence its toggle opens once the record holds it.
 */
function ItemWithEvidence({
	owner,
	evidence,
	rowClassName,
	panelClassName,
	label,
	spacing,
	children,
}: {
	readonly owner: EvidenceOwner;
	readonly evidence: RowEvidence;
	readonly rowClassName: string;
	readonly panelClassName: string;
	readonly label?: string;
	readonly spacing: string;
	readonly children: React.ReactNode;
}): React.JSX.Element {
	const [toggled, setToggled] = useState(false);
	const evidenceId = useId();
	const cited = toggled && evidence !== "pending" ? evidence : undefined;

	return (
		<li>
			<div className={rowClassName}>
				{children}
				<EvidenceToggle
					evidence={evidence}
					shown={cited === undefined ? undefined : evidenceId}
					onToggle={() => {
						setToggled((shown) => !shown);
					}}
				/>
			</div>
			{cited === undefined ? null : (
				<div
					id={evidenceId}
					className={`mt-0.5 border-l-2 border-deeper bg-background px-3.5 py-2.75 ${panelClassName}`}
				>
					{label === undefined ? null : <Label>{label}</Label>}
					<CitedEvidence owner={owner} evidence={cited} spacing={spacing} />
				</div>
			)}
		</li>
	);
}

export function BlockerRows({
	run,
	stage,
	rows,
}: {
	readonly run: string;
	readonly stage: string;
	readonly rows: readonly BlockerRow[];
}): React.JSX.Element {
	return (
		<ul aria-label="Hard blockers" className="mt-2.5 flex flex-col gap-px">
			{rows.map((row) => {
				const tone = BLOCKER_TONES[row.state];

				return (
					<ItemWithEvidence
						key={row.id}
						owner={{ run, stage, section: "hardBlockers", item: row.id }}
						evidence={row.evidence}
						rowClassName={`flex items-center gap-2.75 rounded-md border px-3 py-2.25 ${tone.row}`}
						panelClassName="mb-1.25"
						label="Cited evidence"
						// Below the label, each citation keeps its distance from the one above.
						spacing="mt-2.5"
					>
						<span
							aria-hidden="true"
							className={`font-mono text-12 ${tone.text}`}
						>
							{STATUS_VOCABULARY[row.state].glyph}
						</span>
						<span className="flex-1 font-mono text-11-5">{row.id}</span>
						<span className={`text-10 tracking-label uppercase ${tone.text}`}>
							{STATUS_VOCABULARY[row.state].word}
						</span>
					</ItemWithEvidence>
				);
			})}
		</ul>
	);
}

export function DimensionRows({
	run,
	stage,
	rows,
}: {
	readonly run: string;
	readonly stage: string;
	readonly rows: readonly DimensionRow[];
}): React.JSX.Element {
	return (
		<ul aria-label="Quality dimensions" className="mt-2.5 flex flex-col gap-px">
			{rows.map((row) => (
				<ItemWithEvidence
					key={row.id}
					owner={{ run, stage, section: "dimensions", item: row.id }}
					evidence={row.evidence}
					rowClassName="flex items-center gap-3 border-b border-subtle px-3 py-2.25"
					panelClassName="mb-1.75"
					spacing="mb-2.5"
				>
					<span
						className={`flex-1 text-11-5 ${row.grade === undefined ? "text-dim" : "text-foreground"}`}
					>
						{row.id}
					</span>
					<span
						aria-hidden="true"
						className="font-mono text-10-5 tracking-bar text-faint"
					>
						{gradeBar(row.grade)}
					</span>
					<span className="w-8 text-right">
						<Grade
							value={
								row.grade === undefined
									? { pending: true }
									: { letter: row.grade }
							}
							size="inline"
						/>
					</span>
				</ItemWithEvidence>
			))}
		</ul>
	);
}
