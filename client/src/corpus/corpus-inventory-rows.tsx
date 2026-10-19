import plural from "#client/plural";
import { Button } from "#client/system/ui/button";

import type { CorpusResponse } from "./corpus-query";

const NO_INVALIDATED_RESULTS = 0;

const PREFIX_START_INDEX = 0;

const CORPUS_DIGEST_PREVIEW_CHARACTERS = 12;

type CorpusFile = CorpusResponse["files"][number];

const COLUMNS = [
	"Path",
	"Hash",
	"Last edited",
	"Read by",
	"Prior-version results",
] as const;

/**
 * A file's count is measured only against a measured last edit. Without one
 * the server serves 0 for every file, which no measurement made.
 */
function invalidatedReading(
	file: CorpusFile,
	lastEdit: CorpusResponse["lastEdit"],
): React.JSX.Element {
	if (lastEdit.kind === "not-recorded") {
		return <span className="text-14 text-dim">not recorded</span>;
	}

	return (
		<span className="font-mono text-14">
			<span aria-hidden="true">
				{file.invalidated === NO_INVALIDATED_RESULTS ? "✓ " : "⚠ "}
			</span>
			{plural(file.invalidated, "result")}
		</span>
	);
}

interface CorpusRowActions {
	readonly onEdit: ((path: string) => void) | undefined;
	readonly onView: (path: string, returnFocus: () => void) => void;
}

function rowFor(
	file: CorpusFile,
	lastEdit: CorpusResponse["lastEdit"],
	{ onEdit, onView }: CorpusRowActions,
): readonly React.ReactNode[] {
	return [
		<Button
			key="path"
			variant="link"
			size="inline"
			aria-label={`View ${file.path}`}
			onClick={(event) => {
				const origin = event.currentTarget;
				onView(file.path, () => {
					if (origin.isConnected) {
						origin.focus();
					}
				});
			}}
		>
			<span className="min-w-0 font-mono break-all">{file.path}</span>
		</Button>,
		<span key="hash" className="font-mono text-14 text-muted-foreground">
			{file.sha256.slice(PREFIX_START_INDEX, CORPUS_DIGEST_PREVIEW_CHARACTERS)}
		</span>,
		<span key="edited" className="text-14 text-secondary-foreground">
			{new Date(file.lastEditedAt).toLocaleString()}
		</span>,
		<span key="read-by" className="font-mono text-14">
			{file.readBy}
		</span>,
		<span key="invalidated">{invalidatedReading(file, lastEdit)}</span>,
		...(onEdit === undefined
			? []
			: [
					<Button
						key="edit"
						size="sm"
						variant="outline"
						aria-label={`Edit ${file.path}`}
						onClick={() => {
							onEdit(file.path);
						}}
					>
						Edit
					</Button>,
				]),
	];
}

export { COLUMNS, rowFor };
export type { CorpusFile, CorpusRowActions };
