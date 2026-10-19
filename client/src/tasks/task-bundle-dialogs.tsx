import { useState } from "react";

import { Button } from "#client/system/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTrigger,
} from "#client/system/ui/dialog";

import { DialogHeader } from "./task-bundle-chrome";
import type { ListedTask } from "./task-bundle-downloads";
import BundleDownloads from "./task-bundle-downloads";
import ImportForm from "./task-bundle-import-form";

/**
 * Every task a case declares exports as one file. A pipeline only a run's
 * override named belongs to no case, so it has no task and brief to export.
 */
const EMPTY_COLLECTION_LENGTH = 0;

interface ExportTaskDialogProps {
	readonly tasks: readonly ListedTask[];
}

function ExportTaskDialog({ tasks }: ExportTaskDialogProps): React.JSX.Element {
	const declared = tasks.flatMap((task) =>
		task.declaredBy === null ? [] : [{ caseId: task.declaredBy.id, task }],
	);

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="quiet">Export with judges</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader title="Export with judges" />
				<div className="relative flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-y-contain px-4 py-3.5">
					<DialogDescription>
						Each file holds one workflow: its task and brief, its steps, every
						step rubric and the final rubric, and the commands it runs in its
						target. The target path is this machine's, so whoever imports it
						names their own.
					</DialogDescription>
					{declared.length === EMPTY_COLLECTION_LENGTH ? (
						<p className="text-14 text-muted-foreground">
							No workflow is declared by a case, so there is nothing to export.
						</p>
					) : (
						<BundleDownloads declared={declared} />
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

interface ImportTaskDialogProps {
	readonly onImported: (path: string) => void;
}

function ImportTaskDialog({
	onImported,
}: ImportTaskDialogProps): React.JSX.Element {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="quiet">Import workflow</Button>
			</DialogTrigger>
			<DialogContent>
				<ImportForm
					onImported={(path) => {
						setOpen(false);
						onImported(path);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}

export { ExportTaskDialog, ImportTaskDialog };
