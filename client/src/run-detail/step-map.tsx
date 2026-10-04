import { Fragment } from "react";
import type { RunRecordResponse } from "#client/monitor/run-record-query";
import type { GradeValue } from "#client/system/components/grade";
import { Grade } from "#client/system/components/grade";
import type { AnalyzedStage } from "./analysis-query";
import { RoleMark } from "./analysis-role";

type MonitoredGrade = RunRecordResponse["stages"][number]["grade"];

function gradeValue(grade: MonitoredGrade): GradeValue {
	return grade.state === "available"
		? { letter: grade.letter }
		: { pending: true };
}

/**
 * SPEC.md 4c item 2: the pipeline as a chain of step chips, a map rather than
 * a second graph, each with the role the newest analysis gave it.
 */
export function StepMap({
	record,
	roles,
}: {
	readonly record: RunRecordResponse;
	readonly roles: ReadonlyMap<string, AnalyzedStage>;
}): React.JSX.Element {
	return (
		<ol aria-label="Step map" className="flex flex-wrap items-center gap-2">
			{record.stages.map((stage, index) => {
				const role = roles.get(stage.stage)?.role;

				return (
					<Fragment key={stage.stage}>
						{index === 0 ? null : (
							<li role="presentation" aria-hidden="true" className="text-faint">
								▶
							</li>
						)}
						<li className="flex items-center gap-1.75 rounded-md border border-border bg-card px-2.5 py-1.25 text-12">
							<span className="font-mono text-dim">{index + 1}</span>
							<span>{stage.stage}</span>
							<Grade value={gradeValue(stage.grade)} size="inline" />
							{role === undefined ? null : (
								<RoleMark role={role} words="spoken" />
							)}
						</li>
					</Fragment>
				);
			})}
		</ol>
	);
}
