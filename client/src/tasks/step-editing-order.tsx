import { Button } from "#client/system/ui/button";

import type { StepDraft, StepMove } from "./case-steps-draft";
import { STEP_MOVE_NEXT, STEP_MOVE_PREVIOUS } from "./case-steps-draft";
import { FIELD_CLASS, LabeledField } from "./step-editing-fields";

const FIRST_STEP_NUMBER = 1;

const SINGLE_ITEM_COUNT = 1;

interface StepOrderControlsProps {
	readonly position: number;
	readonly count: number;
	readonly onMove: (by: StepMove) => void;
	readonly onRemove: () => void;
}

function StepOrderControls({
	position,
	count,
	onMove,
	onRemove,
}: StepOrderControlsProps): React.JSX.Element {
	return (
		<span className="ml-auto flex flex-wrap gap-2">
			<Button
				type="button"
				variant="quiet"
				size="xs"
				disabled={position === FIRST_STEP_NUMBER}
				onClick={() => {
					onMove(STEP_MOVE_PREVIOUS);
				}}
			>
				Move up
			</Button>
			<Button
				type="button"
				variant="quiet"
				size="xs"
				disabled={position === count}
				onClick={() => {
					onMove(STEP_MOVE_NEXT);
				}}
			>
				Move down
			</Button>
			<Button
				type="button"
				variant="quiet"
				size="xs"
				disabled={count === SINGLE_ITEM_COUNT}
				onClick={onRemove}
			>
				Remove
			</Button>
		</span>
	);
}

interface PlanningStepFieldsProps {
	readonly step: StepDraft;
	readonly onChange: (change: Partial<StepDraft>) => void;
}

function PlanningStepFields({
	step,
	onChange,
}: PlanningStepFieldsProps): React.JSX.Element {
	return (
		<span className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4">
			<span className="sm:col-span-3">
				<LabeledField label="Artifact">
					{(id) => (
						<input
							id={id}
							value={step.artifact}
							placeholder="optional"
							onChange={(event) => {
								onChange({ artifact: event.target.value });
							}}
							className={FIELD_CLASS}
						/>
					)}
				</LabeledField>
			</span>
			<label className="flex min-h-11 items-center gap-2 text-14 text-muted-foreground">
				<input
					type="checkbox"
					checked={step.requiresAcceptanceCriteria}
					onChange={(event) => {
						onChange({ requiresAcceptanceCriteria: event.target.checked });
					}}
				/>
				Requires acceptance criteria
			</label>
		</span>
	);
}

export { PlanningStepFields, StepOrderControls };
