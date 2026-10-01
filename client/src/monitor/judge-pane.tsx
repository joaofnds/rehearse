import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { gradeStep, STAGE_LETTER_GRADES } from "#benchmark/stage-letter-grades";
import { plural } from "#client/plural";
import { polledRunHistoryQuery } from "#client/run-history/run-history-polling";
import { spendReading } from "#client/run-history/run-progress";
import { Grade } from "#client/system/components/grade";
import { LiveGlyph, STATUS_VOCABULARY } from "#client/system/components/status";
import { PendingLine } from "./pending-line";
import { rerunSpreadSentence } from "./rerun-spread";
import type { EndedStage, MonitoredStage } from "./run-record-query";
import { endedStatus, hasEnded, runRecordQuery } from "./run-record-query";
import type { StageJudgeResponse } from "./stage-judge-query";
import { stageJudgeQuery } from "./stage-judge-query";

type ReturningJudge = Extract<
	StageJudgeResponse,
	{ readonly state: "returning" }
>;
type JudgeProgress = NonNullable<ReturningJudge["progress"]>;
type JudgedAnswer = Extract<StageJudgeResponse, { readonly state: "judged" }>;
type Evidence = JudgedAnswer["hardBlockers"][number]["evidence"][number];

/** A row's evidence: what the record cites, or pending until the record exists. */
type RowEvidence = readonly Evidence[] | "pending";

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
}

interface SectionCount {
	readonly returned: number;
	readonly total: number;
}

/**
 * What the pane lists: each section's count, and its rows unless the
 * progress predates per-item results.
 */
interface JudgedItems {
	readonly blockers: {
		readonly count: SectionCount;
		readonly rows: readonly BlockerRow[] | undefined;
	};
	readonly dimensions: {
		readonly count: SectionCount;
		readonly rows: readonly DimensionRow[] | undefined;
	};
}

interface Verdict {
	readonly glyph: string;
	readonly phrase: string;
	readonly grade: string | undefined;
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

function blockerState(status: "PASS" | "FAIL" | undefined): BlockerState {
	if (status === undefined) {
		return "pending";
	}

	return status === "FAIL" ? "fired" : "clear";
}

function returningItems(progress: JudgeProgress): JudgedItems {
	const { sections, items } = progress;

	return {
		blockers: {
			count: sections.hardBlockers,
			rows: items?.hardBlockers.map(({ id, status }) => ({
				id,
				state: blockerState(status),
				evidence: "pending",
			})),
		},
		dimensions: {
			count: sections.dimensions,
			rows: items?.dimensions.map(({ id, grade }) => ({
				id,
				grade,
				evidence: "pending",
			})),
		},
	};
}

function judgedItems(judge: JudgedAnswer): JudgedItems {
	const { hardBlockers, dimensions } = judge;

	return {
		blockers: {
			count: { returned: hardBlockers.length, total: hardBlockers.length },
			rows: hardBlockers.map(({ id, status, evidence }) => ({
				id,
				state: blockerState(status),
				evidence,
			})),
		},
		dimensions: {
			count: { returned: dimensions.length, total: dimensions.length },
			rows: dimensions,
		},
	};
}

const GRADE_NOT_RECORDED = "pending: grade not recorded yet";

/** What the judge still owes while it returns, in the design's pending phrase. */
function pendingPhrase(progress: JudgeProgress | undefined): string {
	if (progress === undefined) {
		return "pending: nothing returned yet";
	}
	const { hardBlockers, dimensions } = progress.sections;
	if (dimensions.returned < dimensions.total) {
		return "pending: dimensions still returning";
	}
	if (hardBlockers.returned < hardBlockers.total) {
		return "pending: blockers still returning";
	}

	return GRADE_NOT_RECORDED;
}

function pendingVerdict(phrase: string): Verdict {
	return {
		glyph: STATUS_VOCABULARY.pending.glyph,
		phrase,
		grade: undefined,
	};
}

function judgedVerdict(judge: JudgedAnswer, figures: EndedStage): Verdict {
	const ended = endedStatus(figures);
	const fired = judge.hardBlockers.filter(
		({ status }) => status === "FAIL",
	).length;

	return {
		glyph: STATUS_VOCABULARY[ended].glyph,
		phrase: `${STATUS_VOCABULARY[ended].word}: ${plural(fired, "blocker")} fired`,
		grade:
			figures.grade.state === "available" ? figures.grade.letter : undefined,
	};
}

/** The pane label the design sets in small capitals. */
function Label({
	children,
}: {
	readonly children: React.ReactNode;
}): React.JSX.Element {
	return (
		<div className="text-10 tracking-label text-dim uppercase">{children}</div>
	);
}

function VerdictCard({
	verdict,
}: {
	readonly verdict: Verdict;
}): React.JSX.Element {
	return (
		<div
			role="group"
			aria-label="Verdict and grade"
			className="flex items-center gap-3 rounded-card border border-strong bg-raised px-3.75 py-3"
		>
			<div>
				<Label>Verdict</Label>
				<div className="mt-0.5 flex items-center gap-2.25">
					<span aria-hidden="true" className="text-11 text-dim">
						{verdict.glyph}
					</span>
					<span className="text-13 text-secondary-foreground">
						{verdict.phrase}
					</span>
				</div>
			</div>
			<div className="ml-auto text-right">
				<Label>Grade</Label>
				<Grade
					value={
						verdict.grade === undefined
							? { pending: true }
							: { letter: verdict.grade }
					}
					size="verdict"
				/>
			</div>
		</div>
	);
}

function SectionHeading({
	title,
	count,
	counted,
}: {
	readonly title: string;
	readonly count: SectionCount;
	readonly counted: string;
}): React.JSX.Element {
	return (
		<h3 className="mt-5 text-10 tracking-label text-dim uppercase">
			{title}{" "}
			<span className="tracking-normal text-muted-foreground normal-case">
				· {String(count.returned)} of {String(count.total)} {counted}
			</span>
		</h3>
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

function BlockerRows({
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

function DimensionRows({
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

/** The design's variance note (SPEC.md 2d): product rule 1, a grade read as one attempt. */
function VarianceNote({
	run,
	stage,
}: {
	readonly run: string;
	readonly stage: string;
}): React.JSX.Element {
	const { data } = useQuery(polledRunHistoryQuery);
	const spread =
		data === undefined
			? undefined
			: rerunSpreadSentence(data.rows, { run, stage });

	return (
		<div
			role="note"
			className="mt-5 rounded-card border border-border bg-raised px-3.75 py-3"
		>
			<Label>Read this as one attempt</Label>
			<p className="mt-1.5 text-11-5 text-pretty text-muted-foreground">
				{spread === undefined ? null : `${spread} `}A single grade is a data
				point, not a score.{" "}
				<Link
					to="/comparisons"
					className="border-b border-deeper text-accent-foreground"
				>
					Compare arms
				</Link>{" "}
				to say whether an edit moved anything.
			</p>
		</div>
	);
}

function JudgedBody({
	run,
	stage,
	verdict,
	items,
}: {
	readonly run: string;
	readonly stage: string;
	readonly verdict: Verdict;
	readonly items: JudgedItems | undefined;
}): React.JSX.Element {
	return (
		<>
			<VerdictCard verdict={verdict} />
			{items === undefined ? null : (
				<>
					<SectionHeading
						title="Hard blockers"
						count={items.blockers.count}
						counted="evaluated"
					/>
					{items.blockers.rows === undefined ? null : (
						<BlockerRows run={run} stage={stage} rows={items.blockers.rows} />
					)}
					<SectionHeading
						title="Quality dimensions"
						count={items.dimensions.count}
						counted="returned"
					/>
					{items.dimensions.rows === undefined ? null : (
						<DimensionRows
							run={run}
							stage={stage}
							rows={items.dimensions.rows}
						/>
					)}
				</>
			)}
			<VarianceNote run={run} stage={stage} />
		</>
	);
}

/** The header's reading of the judge as its own priced session. */
function judgeMeta(
	judge: StageJudgeResponse,
	figures: MonitoredStage,
): string | undefined {
	if (judge.state === "returning") {
		return `independent session · ${
			judge.spentUsd === undefined || judge.spentUsd === 0
				? "cost pending"
				: `${spendReading(judge.spentUsd)} so far`
		}`;
	}
	if (judge.state !== "judged") {
		return undefined;
	}

	return figures.judgeCost.state === "available"
		? `independent session · ${spendReading(figures.judgeCost.usd)}`
		: "independent session";
}

/**
 * The judge pane (SPEC.md 2d): the stage judge's verdict and grade, its hard
 * blockers and quality dimensions as each returns, the evidence each cites
 * once the record holds it, and the reminder that one grade is one attempt.
 */
export function JudgePane({
	run,
	number,
	figures,
}: {
	readonly run: string;
	readonly number: number;
	readonly figures: MonitoredStage;
}): React.JSX.Element {
	const { stage } = figures;
	const { data, isError } = useQuery(stageJudgeQuery(run, stage));
	const meta = data === undefined ? undefined : judgeMeta(data, figures);
	const client = useQueryClient();
	const lagging = data?.state === "judged" && !hasEnded(figures);
	useEffect(() => {
		// The record the judge read was written with no run event behind it, so
		// the run record is read again once rather than waiting for one.
		if (lagging) {
			void client.invalidateQueries({ queryKey: runRecordQuery(run).queryKey });
		}
	}, [client, lagging, run]);

	return (
		<section aria-label="Judge" className="flex min-h-0 flex-col bg-secondary">
			<div className="flex flex-none items-center gap-2.75 border-b border-divider px-4.25 py-2.75">
				<h2 className="text-12 font-medium tracking-caps text-muted-foreground uppercase">
					Judge · step {String(number)}
				</h2>
				{data?.state === "returning" ? (
					<>
						<span className="text-10">
							<LiveGlyph />
						</span>
						<span className="text-11-5 text-accent-foreground">grading</span>
					</>
				) : null}
				{meta === undefined ? null : (
					<span className="ml-auto font-mono text-11 text-dim">{meta}</span>
				)}
			</div>
			<div className="flex-1 overflow-y-auto px-4.25 pt-3.75 pb-6">
				{isError ? (
					<p role="alert" className="text-13 text-muted-foreground">
						<span aria-hidden="true">⚠ </span>
						Could not read this step's judge.
					</p>
				) : null}
				{data?.state === "waiting" ? (
					<PendingLine words="This step's judge has not started yet." />
				) : null}
				{data?.state === "not-judged" ? (
					<PendingLine words="This step ended without a judged grade, so there is no verdict to show." />
				) : null}
				{data?.state === "returning" ? (
					<JudgedBody
						run={run}
						stage={stage}
						verdict={pendingVerdict(pendingPhrase(data.progress))}
						items={
							data.progress === undefined
								? undefined
								: returningItems(data.progress)
						}
					/>
				) : null}
				{data?.state === "judged" ? (
					<JudgedBody
						run={run}
						stage={stage}
						verdict={
							// The run record can lag the judge's answer by one read.
							hasEnded(figures)
								? judgedVerdict(data, figures)
								: pendingVerdict(GRADE_NOT_RECORDED)
						}
						items={judgedItems(data)}
					/>
				) : null}
			</div>
		</section>
	);
}
