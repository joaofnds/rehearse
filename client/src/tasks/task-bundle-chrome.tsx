import ActionGroup from "#client/system/components/action-group";
import { Button } from "#client/system/ui/button";
import { DialogClose, DialogTitle } from "#client/system/ui/dialog";

interface DialogHeaderProps {
	readonly title: string;
}

function DialogHeader({ title }: DialogHeaderProps): React.JSX.Element {
	return (
		<header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-strong px-4 py-3">
			<div className="min-w-0 flex-1 wrap-anywhere">
				<DialogTitle>{title}</DialogTitle>
			</div>
			<ActionGroup className="ml-auto">
				<DialogClose asChild>
					<Button variant="outline" size="sm" aria-label="Close">
						Esc
					</Button>
				</DialogClose>
			</ActionGroup>
		</header>
	);
}

interface ImportActionsProps {
	readonly canImport: boolean;
	readonly pending: boolean;
}

function ImportActions({
	canImport,
	pending,
}: ImportActionsProps): React.JSX.Element {
	return (
		<footer className="flex shrink-0 flex-wrap items-center gap-2.5 border-t border-strong px-4 py-3">
			<ActionGroup className="ml-auto">
				<DialogClose asChild>
					<Button type="button" variant="outline">
						Cancel
					</Button>
				</DialogClose>
				<Button
					type="submit"
					variant="primary"
					disabled={!canImport || pending}
				>
					Import
				</Button>
			</ActionGroup>
		</footer>
	);
}

export { DialogHeader, ImportActions };
