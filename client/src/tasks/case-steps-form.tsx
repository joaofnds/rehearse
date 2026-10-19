import { Button } from "#client/system/ui/button";
import { DialogClose } from "#client/system/ui/dialog";

import type { DeclaredSteps } from "./case-steps-api";
import { savedStage } from "./case-steps-draft";
import StepListEditor from "./step-list-editor";
import useStepEditing from "./use-step-editing";

interface StepsFormProps {
	readonly declared: DeclaredSteps;
	readonly focusStage: string | undefined;
	readonly onSaved: () => void;
}

function StepsForm({
	declared,
	focusStage,
	onSaved,
}: StepsFormProps): React.JSX.Element {
	const model = useStepEditing(declared, onSaved);

	return (
		<form
			className="flex min-h-0 flex-col"
			onSubmit={(event) => {
				event.preventDefault();
				model.save.mutate({
					caseId: declared.caseId,
					stages: model.steps.map((step) => savedStage(step)),
				});
			}}
		>
			<datalist id={model.skillsId}>
				{model.skills.map((skill) => (
					<option key={skill} value={skill} />
				))}
			</datalist>
			<StepListEditor
				steps={model.steps}
				setSteps={model.setSteps}
				declared={declared}
				skillsId={model.skillsId}
				focusStage={focusStage}
				error={model.save.error?.message}
			/>
			<StepSaveActions pending={model.save.isPending} />
		</form>
	);
}

interface StepSaveActionsProps {
	readonly pending: boolean;
}

function StepSaveActions({ pending }: StepSaveActionsProps): React.JSX.Element {
	return (
		<footer className="flex items-center gap-2.5 border-t border-strong px-4 py-3">
			<span className="ml-auto flex gap-2">
				<DialogClose asChild>
					<Button type="button" variant="outline">
						Cancel
					</Button>
				</DialogClose>
				<Button variant="primary" type="submit" disabled={pending}>
					Save steps
				</Button>
			</span>
		</footer>
	);
}

export { StepsForm as default };
export type { StepsFormProps };
