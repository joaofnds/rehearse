import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { analysesQuery, rolesOf } from "#client/run-detail/analysis-query";
import useNow from "#client/run-history/use-now";
import type { PipelineRow } from "#client/shell/run-in-flight";

import type { RunRecordResponse } from "./run-record-query";
import {
	MinimumGradeNote,
	WorkflowHeading,
	WorkflowSteps,
} from "./task-graph-layout";

/** The monitor's task graph (SPEC.md 2c): the run's stages as a chain of node cards. */
interface TaskGraphProps {
	readonly record: RunRecordResponse;
	readonly row: PipelineRow;
	/** The stage the panes below show, marked current as the design marks it. */
	readonly shown: string | undefined;
	readonly onSelect: (stage: string) => void;
	readonly compact?: boolean;
}

function TaskGraph({
	record,
	row,
	shown,
	onSelect,
	compact = false,
}: TaskGraphProps): React.JSX.Element {
	const nowMs = useNow(row.progress.state === "running");
	const analyses = useQuery(analysesQuery(row.run));
	const roles = rolesOf(analyses.data);
	const [expanded, setExpanded] = useState(false);
	const detailsShown = !compact || expanded;

	return (
		<section
			aria-label="Task graph"
			className="flex-none border-b border-divider bg-secondary"
		>
			<WorkflowHeading
				record={record}
				compact={compact}
				expanded={expanded}
				setExpanded={setExpanded}
				detailsShown={detailsShown}
			/>
			<WorkflowSteps
				record={record}
				row={row}
				shown={shown}
				onSelect={onSelect}
				nowMs={nowMs}
				roles={roles}
				detailsShown={detailsShown}
			/>
			{detailsShown ? (
				<p className="page-gutter pb-2.5 text-12 text-pretty text-dim">
					<MinimumGradeNote record={record} />A step shows what its record says
					it produced until an analysis of the ended run gives one agent's
					reading of its contribution to the task's final grade.
				</p>
			) : null}
		</section>
	);
}

export { costReading, durationReading } from "./task-graph-readings";
export { nodeStatus } from "./task-graph-status";
export type { NodeStatus } from "./task-graph-status";
export { TaskGraph };
