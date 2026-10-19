import { useState } from "react";

import type { RecordedTextMode } from "#client/system/components/recorded-text";
import RecordedText from "#client/system/components/recorded-text";
import { Button } from "#client/system/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "#client/system/ui/dialog";

import type { StageEvidence } from "./stage-evidence";

function savedOutputInitialMode(
	output: StageEvidence["output"] | undefined,
): RecordedTextMode {
	return output?.state === "available" && output.kind === "diff"
		? "Raw"
		: "Formatted";
}

interface SavedOutputProps {
	readonly title: string;
	readonly text: string | undefined;
	readonly note?: string | undefined;
	readonly pending?: boolean;
	readonly initialMode?: RecordedTextMode;
	readonly emptyMessage?: string;
}

function SavedOutput({
	title,
	text,
	note,
	pending = false,
	initialMode = "Formatted",
	emptyMessage = "Output unavailable in this saved record.",
}: SavedOutputProps): React.JSX.Element {
	const [open, setOpen] = useState(false);
	return (
		<section
			aria-label={title}
			className="min-w-0 rounded-lg border border-divider bg-card p-6"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 className="min-w-0 text-16 font-semibold wrap-anywhere">{title}</h2>
				{text === undefined ? null : (
					<Dialog open={open} onOpenChange={setOpen}>
						<DialogTrigger asChild>
							<Button size="sm" variant="quiet">
								Open complete output
							</Button>
						</DialogTrigger>
						<CompleteSavedOutput title={title} text={text} />
					</Dialog>
				)}
			</div>
			{note === undefined ? null : (
				<p className="mt-2 text-12 text-dim">{note}</p>
			)}
			{pending ? (
				<p className="mt-3 text-14 text-dim">Reading saved output…</p>
			) : null}
			{text === undefined && !pending ? (
				<p className="mt-3 text-14 text-attention">{emptyMessage}</p>
			) : null}
			{text === undefined ? null : (
				<div className="mt-3 max-h-100 overflow-auto">
					<RecordedText
						key={initialMode}
						text={text}
						initialMode={initialMode}
					/>
				</div>
			)}
		</section>
	);
}

interface CompleteSavedOutputProps {
	readonly title: string;
	readonly text: string;
}

function CompleteSavedOutput({
	title,
	text,
}: CompleteSavedOutputProps): React.JSX.Element {
	return (
		<DialogContent width="wide">
			<div className="shrink-0 border-b border-divider p-4">
				<DialogTitle>Complete saved output</DialogTitle>
				<DialogDescription>
					Complete output preserved by the saved record.
				</DialogDescription>
			</div>
			<div className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
				<p className="mb-3 font-mono text-13 wrap-anywhere text-secondary-foreground">
					{title}
				</p>
				<pre className="font-mono leading-transcript text-13 whitespace-pre-wrap wrap-anywhere">
					{text}
				</pre>
			</div>
			<div className="shrink-0 border-t border-divider p-4">
				<DialogClose asChild>
					<Button size="sm" variant="quiet">
						Close
					</Button>
				</DialogClose>
			</div>
		</DialogContent>
	);
}

export { SavedOutput, savedOutputInitialMode };
