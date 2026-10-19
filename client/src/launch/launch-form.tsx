import { DialogDescription } from "#client/system/ui/dialog";

import { LaunchReadinessNotes } from "./launch-case-list";
import SpendCeilingField from "./launch-ceiling-field";
import LaunchConditions from "./launch-conditions";
import { LaunchFormFooter, LaunchFormHeader } from "./launch-form-chrome";
import { dialogDescription } from "./launch-request";
import type { SettledTarget } from "./launch-target-contract";
import LaunchTargetChoices from "./launch-target-rows";
import type { LaunchFormModel } from "./use-launch-form";
import useLaunchForm from "./use-launch-form";

interface LaunchFormProps {
	readonly target: SettledTarget;
	/** Rows that choose the target in place of the rows naming it. */
	readonly targetRows?: React.ReactNode;
	readonly onLaunched: () => void;
}

function LaunchForm({
	target,
	targetRows,
	onLaunched,
}: LaunchFormProps): React.JSX.Element {
	const model = useLaunchForm(target, onLaunched);

	return (
		<>
			<LaunchFormHeader target={target} />

			<LaunchFormContent
				target={target}
				targetRows={targetRows}
				model={model}
			/>

			<LaunchFormFooter model={model} />
		</>
	);
}

interface LaunchFormContentProps {
	readonly target: SettledTarget;
	readonly targetRows: React.ReactNode;
	readonly model: LaunchFormModel;
}

function LaunchFormContent({
	target,
	targetRows,
	model,
}: LaunchFormContentProps): React.JSX.Element {
	return (
		<div className="flex min-h-0 min-w-0 flex-col gap-5 overflow-y-auto px-6 py-5">
			<LaunchTargetChoices
				target={target}
				targetRows={targetRows}
				model={model}
			/>

			<LaunchConditions
				target={target}
				cases={model.availableCases}
				caseId={model.caseId}
			/>
			<SpendCeilingField
				storedUsd={model.ceilingUsd}
				draft={model.ceilingDraft}
				onDraft={model.setCeilingDraft}
			/>
			<p className="text-12 text-secondary-foreground">
				Ceilings bound spending; they are not projected charges.
			</p>
			<LaunchReadinessNotes model={model} />
			<DialogDescription>{dialogDescription(target)}</DialogDescription>

			{model.launchFailure === undefined ? null : (
				<p role="alert" className="text-14 text-attention">
					<span aria-hidden="true">⚠ </span>
					{model.launchFailure}
				</p>
			)}
		</div>
	);
}

export { LaunchForm as default };
