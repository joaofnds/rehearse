import { useCallback, useId } from "react";

import NativeSelect from "#client/system/ui/native-select";

import type { StepDraft } from "./case-steps-draft";

const FIELD_CLASS =
	"w-full min-w-0 rounded-md border border-strong bg-background px-2 py-1.5 font-mono text-14";

interface LabeledFieldProps {
	readonly label: string;
	readonly children: (id: string) => React.ReactNode;
}

function LabeledField({
	label,
	children,
}: LabeledFieldProps): React.JSX.Element {
	const id = useId();

	return (
		<span className="flex min-w-0 flex-col gap-1">
			<label htmlFor={id} className="text-12 text-muted-foreground">
				{label}
			</label>
			{children(id)}
		</span>
	);
}

interface StepDefinitionFieldsProps {
	readonly step: StepDraft;
	readonly rubrics: readonly string[];
	readonly skillsId: string;
	readonly onChange: (change: Partial<StepDraft>) => void;
	readonly focused: boolean;
}

function StepDefinitionFields({
	step,
	rubrics,
	skillsId,
	onChange,
	focused,
}: StepDefinitionFieldsProps): React.JSX.Element {
	return (
		<span className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<StepNameField step={step} onChange={onChange} focused={focused} />
			<LabeledField label="Kind">
				{(id) => (
					<NativeSelect
						id={id}
						value={step.kind}
						onChange={(event) => {
							onChange({
								kind:
									event.target.value === "planning" ? "planning" : "delivery",
							});
						}}
					>
						<option value="planning">planning</option>
						<option value="delivery">delivery</option>
					</NativeSelect>
				)}
			</LabeledField>
			<LabeledField label="Skill">
				{(id) => (
					<input
						id={id}
						list={skillsId}
						value={step.skill}
						onChange={(event) => {
							onChange({ skill: event.target.value });
						}}
						className={FIELD_CLASS}
					/>
				)}
			</LabeledField>
			<StepRubricField step={step} rubrics={rubrics} onChange={onChange} />
		</span>
	);
}

interface StepNameFieldProps {
	readonly step: StepDraft;
	readonly onChange: (change: Partial<StepDraft>) => void;
	readonly focused: boolean;
}

function StepNameField({
	step,
	onChange,
	focused,
}: StepNameFieldProps): React.JSX.Element {
	const focusName = useCallback<React.RefCallback<HTMLInputElement>>(
		(input) => {
			if (focused) {
				input?.focus();
			}
		},
		[focused],
	);

	return (
		<LabeledField label="Name">
			{(id) => (
				<input
					id={id}
					value={step.name}
					ref={focusName}
					onChange={(event) => {
						onChange({ name: event.target.value });
					}}
					className={FIELD_CLASS}
				/>
			)}
		</LabeledField>
	);
}

interface StepRubricFieldProps {
	readonly step: StepDraft;
	readonly rubrics: readonly string[];
	readonly onChange: (change: Partial<StepDraft>) => void;
}

function StepRubricField({
	step,
	rubrics,
	onChange,
}: StepRubricFieldProps): React.JSX.Element {
	return (
		<LabeledField label="Rubric">
			{(id) => (
				<NativeSelect
					id={id}
					value={step.rubric}
					onChange={(event) => {
						onChange({ rubric: event.target.value });
					}}
				>
					{rubrics.includes(step.rubric) ? null : (
						<option value={step.rubric}>{step.rubric}</option>
					)}
					{rubrics.map((rubric) => (
						<option key={rubric} value={rubric}>
							{rubric}
						</option>
					))}
				</NativeSelect>
			)}
		</LabeledField>
	);
}

export { FIELD_CLASS, LabeledField, StepDefinitionFields };
