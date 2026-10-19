import type { AnalyzedStage } from "#client/run-detail/analysis-query";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { Button } from "#client/system/ui/button";

import type { RunRecordResponse } from "./run-record-query";
import StageNode from "./task-graph-node";

const FINAL_STAGE_INDEX_ADJUSTMENT = 1;

const ORDINAL_BASE = 1;

/**
 * What a stage below the minimum grade does to the run. A run whose manifest
 * predates the minimum grade has none to state.
 */
interface MinimumGradeNoteProps {
	readonly record: RunRecordResponse;
}

function MinimumGradeNote({
	record,
}: MinimumGradeNoteProps): React.JSX.Element | null {
	if (record.minimumGrade.state === "unavailable") {
		return null;
	}

	return (
		<>
			Minimum grade for every step in this task is{" "}
			<span className="font-mono text-secondary-foreground">
				{record.minimumGrade.letter}
			</span>
			. A step below it stops the run.{" "}
		</>
	);
}

function contributionOf(
	analysed: AnalyzedStage | undefined,
): string | undefined {
	return analysed === undefined || analysed.role === "never ran"
		? undefined
		: analysed.contribution;
}

interface WorkflowHeadingProps {
	readonly record: RunRecordResponse;
	readonly compact: boolean;
	readonly expanded: boolean;
	readonly setExpanded: (expanded: boolean) => void;
	readonly detailsShown: boolean;
}

function WorkflowHeading({
	record,
	compact,
	expanded,
	setExpanded,
	detailsShown,
}: WorkflowHeadingProps): React.JSX.Element {
	return (
		<div className="flex flex-wrap items-center gap-x-3.75 gap-y-1 page-gutter pt-2.5">
			<h2 className="text-16 font-semibold text-dim wrap-anywhere">
				<span className="tracking-label uppercase">Workflow</span> ·{" "}
				{record.caseId} · {String(record.stages.length)} steps, in order
			</h2>
			<span className="text-12 text-muted-foreground">
				select a step to explore its results, activity and context
			</span>
			{compact ? (
				<div className="ml-auto">
					<Button
						size="compact"
						variant="ghost"
						aria-expanded={expanded}
						onClick={() => {
							setExpanded(!expanded);
						}}
					>
						{expanded ? "Hide workflow details" : "Show workflow details"}
					</Button>
				</div>
			) : null}
			{detailsShown ? (
				<span aria-hidden="true" className="ml-auto text-12 text-dim">
					✓ continued at minimum · ● running · ○ queued · ◆ checkpoint · ◇ no
					checkpoint
				</span>
			) : null}
		</div>
	);
}

interface WorkflowStepsProps {
	readonly record: RunRecordResponse;
	readonly row: PipelineRow;
	readonly shown: string | undefined;
	readonly onSelect: (stage: string) => void;
	readonly nowMs: number;
	readonly roles: ReadonlyMap<string, AnalyzedStage>;
	readonly detailsShown: boolean;
}

function WorkflowSteps({
	record,
	row,
	shown,
	onSelect,
	nowMs,
	roles,
	detailsShown,
}: WorkflowStepsProps): React.JSX.Element {
	return (
		<div
			role="region"
			aria-label="Workflow steps"
			tabIndex={0}
			className="relative overflow-x-auto page-gutter pt-2.5 pb-3"
		>
			<ol className="flex min-w-max items-stretch">
				{record.stages.map((stage, index) => (
					<StageNode
						key={stage.stage}
						stage={stage}
						number={index + ORDINAL_BASE}
						record={record}
						row={row}
						last={index === record.stages.length - FINAL_STAGE_INDEX_ADJUSTMENT}
						selected={stage.stage === shown}
						onSelect={onSelect}
						nowMs={nowMs}
						contribution={contributionOf(roles.get(stage.stage))}
						detailsShown={detailsShown}
					/>
				))}
			</ol>
		</div>
	);
}

export { MinimumGradeNote, WorkflowHeading, WorkflowSteps };
