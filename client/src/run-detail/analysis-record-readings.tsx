import { Link } from "@tanstack/react-router";

import { STAGE_LETTER_GRADES } from "#benchmark/stage-letter-grades";
import type { MonitoredStage } from "#client/monitor/run-record-query";
import { elapsedReading, spendReading } from "#client/run-history/run-progress";
import { Button } from "#client/system/ui/button";

import type { AnalyzedStage, RecordedAnalysis } from "./analysis-query";
import { RoleMark } from "./analysis-role";
import momentReading from "./moment-reading";

const ORDINAL_BASE = 1;

function provenance(analysis: RecordedAnalysis): string {
	return [
		"an agent read the recorded steps",
		analysis.costUsd === undefined
			? "cost not recorded"
			: spendReading(analysis.costUsd),
		elapsedReading(analysis.durationMs),
		momentReading(Date.parse(analysis.startedAt)),
	].join(" · ");
}

function rootCauseWords(rootCause: RecordedAnalysis["rootCause"]): string {
	if (rootCause === null) {
		return "no root cause named";
	}

	return rootCause.lines === undefined
		? `root cause: ${rootCause.file}`
		: `root cause: ${rootCause.file} · lines ${String(rootCause.lines.start)}–${String(rootCause.lines.end)}`;
}

/** Where a letter sits on the harness's grade scale, as a row of cells. */
function gradeTrack({ grade }: MonitoredStage): string {
	const letter = grade.state === "available" ? grade.letter : undefined;

	return STAGE_LETTER_GRADES.map((axis) => (axis === letter ? "▮" : "▯")).join(
		"",
	);
}

interface StepRowProps {
	readonly run: string;
	readonly stage: MonitoredStage;
	readonly index: number;
	readonly analysed: AnalyzedStage | undefined;
}

function StepRow({
	run,
	stage,
	index,
	analysed,
}: StepRowProps): React.JSX.Element {
	return (
		<li className="grid grid-cols-analysis-rows items-center gap-3 border-t border-divider py-2.5 text-12">
			<span>
				<span className="font-mono text-dim">{index + ORDINAL_BASE} </span>
				<span>{stage.stage}</span>
			</span>
			<span className="flex flex-col font-mono">
				<span>
					{stage.grade.state === "available" ? stage.grade.letter : "—"}{" "}
					<span aria-hidden="true" className="text-dim">
						{gradeTrack(stage)}
					</span>
				</span>
				<span aria-hidden="true" className="text-12 text-faint">
					{STAGE_LETTER_GRADES.join(" ")}
				</span>
			</span>
			<span>
				{analysed === undefined ? (
					<span className="text-dim">not read</span>
				) : (
					<RoleMark role={analysed.role} words="shown" />
				)}
			</span>
			<span className="text-14 leading-reading text-secondary-foreground">
				{analysed === undefined || analysed.role === "never ran"
					? null
					: analysed.note}
			</span>
			<Button asChild variant="outline" size="xs">
				<Link
					to="/runs/$run"
					params={{ run }}
					search={{ step: stage.stage, view: "results" }}
				>
					Step report
				</Link>
			</Button>
		</li>
	);
}

export { provenance, rootCauseWords, StepRow };
