import type { ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

/** A form's width, or the step modal's two columns (SPEC.md 3). */
const DIALOG_WIDTHS = {
	form: "max-w-xl",
	wide: "flex max-h-(--size-dialog-max-height) max-w-264.5 flex-col",
} as const;

/**
 * The modal surface SPEC.md:353 asks of every dialog: Radix traps focus while
 * it is open, closes it on Esc, and returns focus to the trigger that opened
 * it.
 */
function DialogContent({
	children,
	width = "form",
}: {
	readonly children: ReactNode;
	readonly width?: keyof typeof DIALOG_WIDTHS;
}): React.JSX.Element {
	return (
		<DialogPrimitive.Portal>
			<DialogPrimitive.Overlay
				data-slot="dialog-overlay"
				className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-background/70 p-4 sm:p-8"
			>
				<DialogPrimitive.Content
					data-slot="dialog-content"
					aria-modal="true"
					className={`w-full ${DIALOG_WIDTHS[width]} overflow-hidden rounded-xl border border-strong bg-card shadow-(--shadow-dialog) outline-none`}
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
			className="text-20 font-semibold"
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
			className="text-14 text-muted-foreground"
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
