import { useQuery } from "@tanstack/react-query";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { RecordedText } from "#client/system/components/recorded-text";
import { StateBadge } from "#client/system/components/state-badge";
import { Button } from "#client/system/ui/button";
import { fetchCorpusFileForReading } from "./corpus-edit-requests";
import type { LineRange } from "./line-range";

export function CorpusFileViewer({
	path,
	root,
	lines,
	onEdit,
	onClose,
}: {
	readonly path: string;
	readonly root: string;
	readonly lines?: LineRange | undefined;
	readonly onEdit?: (() => void) | undefined;
	readonly onClose: () => void;
}): React.JSX.Element {
	const file = useQuery({
		queryKey: ["corpus-file-reading", root, path],
		queryFn: () => fetchCorpusFileForReading(path),
		gcTime: 0,
		refetchOnMount: "always",
	});

	return (
		<section
			aria-label={`Instruction text · ${path}`}
			className="flex min-w-0 flex-col gap-3"
		>
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-wrap items-center gap-3">
					<h3 className="font-mono text-14">{path}</h3>
					<StateBadge tone="neutral">Read only</StateBadge>
					{file.isSuccess ? (
						<span className="font-mono text-12 text-muted-foreground">
							{corpusVersionLabel(file.data.version)}
						</span>
					) : null}
				</div>
				<div className="flex items-center gap-2">
					{onEdit === undefined ? null : (
						<Button variant="quiet" onClick={onEdit}>
							Edit this file
						</Button>
					)}
					<Button variant="quiet" onClick={onClose}>
						Close file
					</Button>
				</div>
			</header>
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
