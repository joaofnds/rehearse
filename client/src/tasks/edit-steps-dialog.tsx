import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "#client/system/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "#client/system/ui/dialog";

import { stepsQuery } from "./case-steps-api";
import StepsForm from "./case-steps-form";

interface StepsEditorProps {
	readonly caseId: string;
	readonly focusStage: string | undefined;
	readonly onSaved: () => void;
}

function StepsEditor({
	caseId,
	focusStage,
	onSaved,
}: StepsEditorProps): React.JSX.Element {
	const query = useQuery(stepsQuery(caseId));
	if (query.data === undefined) {
		return (
			<p
				role={query.error === null ? undefined : "alert"}
				className="px-4 py-3.5 text-14 text-secondary-foreground"
			>
				{query.error === null ? "Reading the steps" : query.error.message}
			</p>
		);
	}

	return (
		<StepsForm
			declared={query.data}
			focusStage={focusStage}
			onSaved={onSaved}
		/>
	);
}

/**
 * Edits the steps a pipeline case's file declares: each step's name, kind,
 * skill and rubric, and their order. `focusStage` opens the editor on one
 * step, as the step modal does.
 */
interface EditStepsDialogProps {
	readonly caseId: string;
	readonly focusStage?: string;
	readonly trigger: React.ReactNode;
}

function EditStepsDialog({
	caseId,
	focusStage,
	trigger,
}: EditStepsDialogProps): React.JSX.Element {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent width="wide">
				<header className="flex items-center gap-3 border-b border-strong px-4 py-3">
					<DialogTitle>{`Edit steps · ${caseId}`}</DialogTitle>
					<span className="ml-auto">
						<DialogClose asChild>
							<Button variant="outline" size="sm" aria-label="Close">
								Esc
							</Button>
						</DialogClose>
					</span>
				</header>
				{open ? (
					<StepsEditor
						caseId={caseId}
						focusStage={focusStage}
						onSaved={() => {
							setOpen(false);
						}}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

export { EditStepsDialog as default };
