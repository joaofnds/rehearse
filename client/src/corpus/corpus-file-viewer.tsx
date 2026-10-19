import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import ActionGroup from "#client/system/components/action-group";
import RecordedText from "#client/system/components/recorded-text";
import StateBadge from "#client/system/components/state-badge";
import focusWorkspaceTarget from "#client/system/focus-workspace-target";
import { Button } from "#client/system/ui/button";

import { fetchCorpusFileForReading } from "./corpus-edit-requests";
import type { LineRange } from "./line-range";

const INITIAL_VIEW_REQUEST = 0;

interface CorpusFileViewerProps {
	readonly path: string;
	readonly root: string;
	readonly lines?: LineRange | undefined;
	readonly onEdit?: (() => void) | undefined;
	readonly onClose: () => void;
	readonly viewRequest: number;
}

function CorpusFileViewer({
	path,
	root,
	lines,
	onEdit,
	onClose,
	viewRequest,
}: CorpusFileViewerProps): React.JSX.Element {
	const file = useQuery({
		gcTime: 0,
		queryFn: async () => await fetchCorpusFileForReading(path),
		queryKey: ["corpus-file-reading", root, path],
		refetchOnMount: "always",
	});

	return (
		<section
			aria-label={`Instruction text · ${path}`}
			className="flex min-w-0 flex-col gap-3"
		>
			<CorpusReaderHeader
				path={path}
				viewRequest={viewRequest}
				version={file.data?.version}
				onEdit={onEdit}
				onClose={onClose}
			/>
			{lines === undefined ? null : (
				<p className="text-12 text-muted-foreground">{`Linked lines ${lines.start}–${lines.end}. The text below is from the current linked corpus.`}</p>
			)}
			{file.isPending ? (
				<p className="text-14 text-muted-foreground">Reading instruction…</p>
			) : null}
			{file.isError ? (
				<p
					role="alert"
					className="text-14 text-attention"
				>{`Could not read ${path}: ${file.error.message}`}</p>
			) : null}
			{file.isSuccess ? <RecordedText text={file.data.text} /> : null}
		</section>
	);
}

interface CorpusReaderHeaderProps {
	readonly path: string;
	readonly viewRequest: number;
	readonly version: string | undefined;
	readonly onEdit: CorpusFileViewerProps["onEdit"];
	readonly onClose: () => void;
}

function CorpusReaderHeader({
	path,
	viewRequest,
	version,
	onEdit,
	onClose,
}: CorpusReaderHeaderProps): React.JSX.Element {
	const heading = useRef<HTMLHeadingElement>(null);
	useEffect(() => {
		if (viewRequest === INITIAL_VIEW_REQUEST || heading.current === null) {
			return;
		}

		focusWorkspaceTarget(heading.current);
	}, [path, viewRequest]);
	return (
		<header className="flex flex-wrap items-center justify-between gap-3">
			<div className="flex min-w-0 flex-wrap items-center gap-3">
				<h3
					ref={heading}
					tabIndex={-1}
					className="min-w-0 font-mono text-14 wrap-anywhere"
				>
					{path}
				</h3>
				<StateBadge tone="neutral">Read only</StateBadge>
				{version === undefined ? null : (
					<span className="font-mono text-12 text-muted-foreground">
						{corpusVersionLabel(version)}
					</span>
				)}
			</div>
			<ActionGroup>
				{onEdit === undefined ? null : (
					<Button variant="quiet" onClick={onEdit}>
						Edit this file
					</Button>
				)}
				<Button variant="quiet" onClick={onClose}>
					Close file
				</Button>
			</ActionGroup>
		</header>
	);
}

export { CorpusFileViewer as default };
