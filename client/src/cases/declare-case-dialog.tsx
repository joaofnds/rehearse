import { useState } from "react";

import { Button } from "#client/system/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "#client/system/ui/dialog";

import DeclareForm from "./case-declaration-form";

/**
 * Declares a case from the browser: a session case from its prompt and
 * checks, or a pipeline case from a task and brief with another pipeline
 * case's steps and judges.
 */
interface DeclareCaseDialogProps {
	readonly onDeclared: (path: string) => void;
}

function DeclareCaseDialog({
	onDeclared,
}: DeclareCaseDialogProps): React.JSX.Element {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">Declare a case</Button>
			</DialogTrigger>
			<DialogContent width="wide">
				<DeclareForm
					onDeclared={(path) => {
						setOpen(false);
						onDeclared(path);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}

export { DeclareCaseDialog as default };
