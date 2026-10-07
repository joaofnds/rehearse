import type { RunRecordResponse } from "#client/monitor/run-record-query";

/**
 * Step rail (SPEC.md 4a): the run's stages down the left, and the selected
 * stage's report beside them.
 */
export function StepRail({
	record,
	selected,
}: {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly selected: string;
	readonly onSelect: (stage: string) => void;
}): React.JSX.Element {
	const number = record.stages.findIndex((each) => each.stage === selected) + 1;

	return (
		<div className="grid min-h-0 flex-1 grid-cols-step-rail">
			<section aria-label="Steps" className="border-r border-divider" />
			<section
				aria-label="Step report"
				className="overflow-y-auto px-5 pt-4 pb-8"
			>
				<h2 className="text-15">
					Step {String(number)} · {selected}
				</h2>
			</section>
		</div>
	);
}
