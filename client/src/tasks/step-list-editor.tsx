import { Button } from "#client/system/ui/button";
import { DialogDescription } from "#client/system/ui/dialog";

import type { DeclaredSteps } from "./case-steps-api";
import type { StepDraft, StepMove } from "./case-steps-draft";
import { DEFAULT_RUBRIC_INDEX, moved } from "./case-steps-draft";
import { StepDefinitionFields } from "./step-editing-fields";
import { PlanningStepFields, StepOrderControls } from "./step-editing-order";

const ORDINAL_BASE = 1;

const STEP_NUMBER_DIGITS = 2;

interface StepFieldsProps {
	readonly position: number;
	readonly count: number;
	readonly step: StepDraft;
	readonly rubrics: readonly string[];
	readonly skillsId: string;
	readonly focused: boolean;
	readonly onChange: (change: Partial<StepDraft>) => void;
	readonly onMove: (by: StepMove) => void;
	readonly onRemove: () => void;
}

function StepFields({
	position,
	count,
	step,
	rubrics,
	skillsId,
	focused,
	onChange,
	onMove,
	onRemove,
}: StepFieldsProps): React.JSX.Element {
	const legend = `Step ${String(position)}`;

	return (
		<fieldset
			aria-label={legend}
			className="flex min-w-0 flex-col gap-4 rounded-md border border-strong p-4"
		>
			<span className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
				<span aria-hidden="true" className="font-mono text-12 text-dim">
					{String(position).padStart(STEP_NUMBER_DIGITS, "0")}
				</span>
				<StepOrderControls
					position={position}
					count={count}
					onMove={onMove}
					onRemove={onRemove}
				/>
			</span>
			<StepDefinitionFields
				step={step}
				rubrics={rubrics}
				skillsId={skillsId}
				onChange={onChange}
				focused={focused}
			/>
			{step.kind === "planning" ? (
				<PlanningStepFields step={step} onChange={onChange} />
			) : null}
		</fieldset>
	);
}

interface StepListEditorProps {
	readonly steps: readonly StepDraft[];
	readonly setSteps: React.Dispatch<React.SetStateAction<readonly StepDraft[]>>;
	readonly declared: DeclaredSteps;
	readonly skillsId: string;
	readonly focusStage: string | undefined;
	readonly error: string | undefined;
}

function StepListEditor({
	steps,
	setSteps,
	declared,
	skillsId,
	focusStage,
	error,
}: StepListEditorProps): React.JSX.Element {
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3.5">
			{steps.map((step, index) => (
				<StepFields
					// A step's place is its identity while the operator edits its name.
					key={index}
					position={index + ORDINAL_BASE}
					count={steps.length}
					step={step}
					rubrics={declared.rubrics}
					skillsId={skillsId}
					focused={step.name === focusStage}
					onChange={(change) => {
						setSteps((current) =>
							current.map((each, at) =>
								at === index ? { ...each, ...change } : each,
							),
						);
					}}
					onMove={(by) => {
						setSteps((current) => moved(current, index, by));
					}}
					onRemove={() => {
						setSteps((current) => current.filter((_each, at) => at !== index));
					}}
				/>
			))}
			<AddStepControl
				setSteps={setSteps}
				rubric={declared.rubrics[DEFAULT_RUBRIC_INDEX] ?? ""}
			/>
			<StepEditNotice pipeline={declared.pipeline} error={error} />
		</div>
	);
}

interface AddStepControlProps {
	readonly setSteps: StepListEditorProps["setSteps"];
	readonly rubric: string;
}

function AddStepControl({
	setSteps,
	rubric,
}: AddStepControlProps): React.JSX.Element {
	return (
		<span>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => {
					setSteps((current) => [
						...current,
						{
							artifact: "",
							kind: "delivery",
							name: "",
							requiresAcceptanceCriteria: false,
							rubric,
							skill: "",
						},
					]);
				}}
			>
				Add a step
			</Button>
		</span>
	);
}

interface StepEditNoticeProps {
	readonly pipeline: string;
	readonly error: string | undefined;
}

function StepEditNotice({
	pipeline,
	error,
}: StepEditNoticeProps): React.JSX.Element {
	return (
		<>
			<DialogDescription>
				Writes the steps into {pipeline}, left uncommitted for you to review.
				Runs started after this read the new steps. Recorded runs keep the steps
				they ran.
			</DialogDescription>
			{error === undefined ? null : (
				<p role="alert" className="text-14 text-attention">
					<span aria-hidden="true">⚠ </span>
					{error}
				</p>
			)}
		</>
	);
}

export { StepListEditor as default };
