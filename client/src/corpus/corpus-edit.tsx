import { useId } from "react";

import type { AppliedCorpusEdit } from "./corpus-edit-requests";
import { CorpusReviewPanel } from "./corpus-edit-review";
import CorpusDraftSurface from "./corpus-edit-surface";
import type { CorpusExperimentSource } from "./experiment-source";
import type { LineRange } from "./line-range";
import useCorpusEditing from "./use-corpus-editing";

interface CorpusEditorProps {
	readonly path: string;
	readonly root: string;
	readonly source: CorpusExperimentSource | undefined;
	/** The lines selected once the text opens, where a link named them. */
	readonly lines?: LineRange | undefined;
	readonly hasReplayableSource: boolean;
	readonly onDiscard: () => void;
	readonly onApplied: (applied: AppliedCorpusEdit) => void;
}

function CorpusEditor({
	path,
	root,
	source,
	lines,
	hasReplayableSource,
	onDiscard,
	onApplied,
}: CorpusEditorProps): React.JSX.Element {
	const textId = useId();
	const model = useCorpusEditing({ onApplied, onDiscard, path, root, source });
	const { file } = model;

	if (!file.isSuccess) {
		return (
			<p
				role={file.isError ? "alert" : undefined}
				className={`text-14 ${file.isError ? "text-attention" : "text-muted-foreground"}`}
			>
				{file.isError
					? `Could not read ${path}: ${file.error.message}`
					: "Loading…"}
			</p>
		);
	}

	return (
		<div className="grid gap-4 md:grid-cols-3">
			<CorpusDraftSurface
				textId={textId}
				path={path}
				lines={lines}
				model={model}
				file={file.data}
			/>
			<CorpusReviewPanel
				path={path}
				hasReplayableSource={hasReplayableSource}
				model={model}
				file={file.data}
			/>
		</div>
	);
}

export { default as AppliedEdit } from "./corpus-applied-edit";
export { CorpusEditor };
export type { CorpusEditorProps };
