import type { ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

/**
 * The modal surface SPEC.md:353 asks of every dialog: Radix traps focus while
 * it is open, closes it on Esc, and returns focus to the trigger that opened
 * it.
 */
function DialogContent({
	children,
}: {
	readonly children: ReactNode;
}): React.JSX.Element {
	return (
		<DialogPrimitive.Portal>
			<DialogPrimitive.Overlay
				data-slot="dialog-overlay"
				className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-background/70 p-6"
			>
				<DialogPrimitive.Content
					data-slot="dialog-content"
					className="w-full max-w-xl overflow-hidden rounded-xl border border-strong bg-raised shadow-(--shadow-dialog) outline-none"
				>
					{children}
				</DialogPrimitive.Content>
			</DialogPrimitive.Overlay>
		</DialogPrimitive.Portal>
	);
}

function DialogTitle({
	children,
}: {
	readonly children: ReactNode;
}): React.JSX.Element {
	return (
		<DialogPrimitive.Title
			data-slot="dialog-title"
			className="text-base font-medium"
		>
			{children}
		</DialogPrimitive.Title>
	);
}

function DialogDescription({
	children,
}: {
	readonly children: ReactNode;
}): React.JSX.Element {
	return (
		<DialogPrimitive.Description
			data-slot="dialog-description"
			className="text-sm text-muted-foreground"
		>
			{children}
		</DialogPrimitive.Description>
	);
}

export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
};
