import { useEffect, useRef, useState } from "react";

import type { AppliedCorpusEdit } from "./corpus-edit-requests";
import type { CorpusRowActions } from "./corpus-inventory-rows";
import type { LineRange } from "./line-range";

const INITIAL_PREVIEW_REQUEST = 0;

const PREVIEW_REQUEST_SEQUENCE_STEP = 1;

/** A corpus file a link opens in the editor, with the lines it names. */
interface OpenedCorpusFile {
	readonly path: string;
	readonly lines?: LineRange | undefined;
}

type EditState =
	| {
			readonly kind: "viewing";
			readonly path: string;
			readonly lines?: LineRange | undefined;
	  }
	| { readonly kind: "idle" }
	| {
			readonly kind: "editing";
			readonly path: string;
			readonly lines?: LineRange | undefined;
	  }
	| {
			readonly kind: "applied";
			readonly path: string;
			readonly applied: AppliedCorpusEdit;
	  };

interface CorpusFileNavigation {
	readonly viewRequest: number;
	readonly onView: CorpusRowActions["onView"];
	readonly onEdit: CorpusRowActions["onEdit"];
	readonly onCloseReader: () => void;
}

interface CorpusNavigationInput {
	readonly edit: EditState;
	readonly setEdit: (edit: EditState) => void;
	readonly selectedFile: (path: string) => void;
	readonly editable: boolean;
}

function useCorpusFileNavigation({
	edit,
	setEdit,
	selectedFile,
	editable,
}: CorpusNavigationInput): CorpusFileNavigation {
	const [viewRequest, setViewRequest] = useState(INITIAL_PREVIEW_REQUEST);
	const returnToFile = useRef<(() => void) | null>(null);
	const onEdit = editable
		? (path: string) => {
				selectedFile(path);
				setEdit({ kind: "editing", path });
			}
		: undefined;

	return {
		onCloseReader: () => {
			setEdit({ kind: "idle" });
			returnToFile.current?.();
		},
		onEdit,
		onView: (path, returnFocus) => {
			returnToFile.current = returnFocus;
			setViewRequest((request) => request + PREVIEW_REQUEST_SEQUENCE_STEP);
			selectedFile(path);
			if (
				(edit.kind === "viewing" || edit.kind === "editing") &&
				edit.path === path
			) {
				setEdit({ kind: "viewing", lines: edit.lines, path });
			} else {
				setEdit({ kind: "viewing", path });
			}
		},
		viewRequest,
	};
}

interface OpenedFileState {
	readonly edit: EditState;
	readonly setEdit: (edit: EditState) => void;
}

function useOpenedCorpusFile(
	opened: OpenedCorpusFile | undefined,
): OpenedFileState {
	const [edit, setEdit] = useState<EditState>(
		opened === undefined
			? { kind: "idle" }
			: { kind: "editing", lines: opened.lines, path: opened.path },
	);
	useEffect(() => {
		setEdit(
			opened === undefined
				? { kind: "idle" }
				: { kind: "editing", lines: opened.lines, path: opened.path },
		);
	}, [opened?.path, opened?.lines?.start, opened?.lines?.end]);
	return { edit, setEdit };
}

export { useCorpusFileNavigation, useOpenedCorpusFile };
export type { CorpusFileNavigation, EditState, OpenedCorpusFile };
