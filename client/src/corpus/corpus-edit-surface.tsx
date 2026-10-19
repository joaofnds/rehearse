import { useEffect, useRef } from "react";

import type { OpenedCorpusFile } from "./corpus-edit-requests";
import DiffPreview from "./diff-preview";
import type { LineRange } from "./line-range";
import lineRangeOffsets from "./line-range";
import type { CorpusEditingActions } from "./use-corpus-editing";

const EDITOR_TRAILING_ROW_COUNT = 1;

const MINIMUM_EDITOR_ROWS = 6;

const MAXIMUM_EDITOR_ROWS = 24;

interface CorpusEditTextProps {
	readonly textId: string;
	readonly text: string;
	readonly lines: LineRange | undefined;
	readonly ready: boolean;
	readonly onChange: (text: string) => void;
}

function CorpusEditText({
	textId,
	text,
	lines,
	ready,
	onChange,
}: CorpusEditTextProps): React.JSX.Element {
	const field = useRef<HTMLTextAreaElement>(null);
	const linesSelected = useRef(false);
	useEffect(() => {
		const element = field.current;
		if (element !== null && lines !== undefined && !linesSelected.current) {
			linesSelected.current = true;
			const { start, end } = lineRangeOffsets(element.value, lines);
			element.setSelectionRange(start, end);
		}
	}, [ready, lines]);
	return (
		<textarea
			ref={field}
			id={textId}
			value={text}
			rows={Math.min(
				MAXIMUM_EDITOR_ROWS,
				Math.max(
					MINIMUM_EDITOR_ROWS,
					text.split("\n").length + EDITOR_TRAILING_ROW_COUNT,
				),
			)}
			spellCheck={false}
			// Put the cursor in the selected file after Edit.
			autoFocus
			onChange={(event) => {
				onChange(event.target.value);
			}}
			className="w-full rounded-md border border-strong bg-background px-2 py-1.5 font-mono text-13 leading-transcript"
		/>
	);
}

interface CorpusDraftSurfaceProps {
	readonly textId: string;
	readonly path: string;
	readonly lines: LineRange | undefined;
	readonly model: CorpusEditingActions;
	readonly file: OpenedCorpusFile;
}

function CorpusDraftSurface({
	textId,
	path,
	lines,
	model,
	file,
}: CorpusDraftSurfaceProps): React.JSX.Element {
	return (
		<div className="flex min-w-0 flex-col gap-3 md:col-span-2">
			<p className="text-12 text-dim">
				Unapplied drafts stay in this app session while you navigate. Discard
				removes this draft; reloading the app clears all drafts.
			</p>
			{model.recovered && model.draft !== null ? (
				<p role="status" className="text-12 text-pale">
					Recovered an unapplied draft from this app session. The current file
					has been read again; review the diff before applying.
				</p>
			) : null}
			{model.draft !== null && model.draft.version !== file.version ? (
				<p role="status" className="text-12 text-muted-foreground">
					The corpus changed since this draft began. The diff compares your
					draft with the current file.
				</p>
			) : null}
			<label htmlFor={textId} className="text-14">
				{"Text of "}
				<span className="font-mono">{path}</span>
			</label>
			<CorpusEditText
				textId={textId}
				text={model.text}
				lines={lines}
				ready={true}
				onChange={(next) => {
					model.saveDraft(next, model.draft?.version ?? file.version);
					model.apply.reset();
				}}
			/>
			<DiffPreview
				path={path}
				original={file.text}
				text={model.text}
				unchanged="No change from the version under test yet."
			/>
		</div>
	);
}

export { CorpusDraftSurface as default };
