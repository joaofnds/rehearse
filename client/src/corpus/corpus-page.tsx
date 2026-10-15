import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { EmptyState } from "#client/system/components/empty-state";
import { TableShell } from "#client/system/components/table-shell";
import { Button } from "#client/system/ui/button";
import type { CorpusResponse } from "./corpus-query";
import { corpusQuery } from "./corpus-query";
import { plural } from "#client/plural";
import { ScreenHeader } from "#client/system/components/screen-header";
import { Notice } from "#client/system/components/notice";
import { launchSettingsQuery } from "#client/launch/settings-query";
import type { AppliedCorpusEdit } from "./corpus-edit-requests";
import { AppliedEdit, CorpusEditor } from "./corpus-edit";
import { LastEditCard } from "./last-edit-card";
import type { LineRange } from "./line-range";
import { ExperimentSource, useExperimentSource } from "./experiment-source";
import type {
	CorpusExperimentSource,
	SourceEvidence,
} from "./experiment-source";

type CorpusFile = CorpusResponse["files"][number];

const COLUMNS = [
	"Path",
	"Hash",
	"Last edited",
	"Read by",
	"Invalidated",
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
		return <span className="text-sm text-dim">not recorded</span>;
	}

	return (
		<span className="font-mono text-sm">
			<span aria-hidden="true">{file.invalidated === 0 ? "✓ " : "⚠ "}</span>
			{plural(file.invalidated, "result")}
		</span>
	);
}

function rowFor(
	file: CorpusFile,
	lastEdit: CorpusResponse["lastEdit"],
	onEdit: ((path: string) => void) | undefined,
): readonly React.ReactNode[] {
	return [
		<span key="path" className="font-mono text-sm">
			{file.path}
		</span>,
		<span key="hash" className="font-mono text-sm text-muted-foreground">
			{file.sha256.slice(0, 12)}
		</span>,
		<span key="edited" className="text-sm text-secondary-foreground">
			{new Date(file.lastEditedAt).toLocaleString()}
		</span>,
		<span key="read-by" className="font-mono text-sm">
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

/** A corpus file a link opens in the editor, with the lines it names. */
export interface OpenedCorpusFile {
	readonly path: string;
	readonly lines?: LineRange | undefined;
}

type EditState =
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

function EditSection({
	edit,
	onEdit,
	source,
	evidence,
}: {
	readonly edit: EditState;
	readonly onEdit: (edit: EditState) => void;
	readonly source: CorpusExperimentSource | undefined;
	readonly evidence: SourceEvidence | undefined;
}): React.JSX.Element {
	const settings = useQuery(launchSettingsQuery);

	return (
		<section
			aria-labelledby="corpus-edit-heading"
			className="overflow-hidden rounded-lg border border-strong"
		>
			<header className="border-b border-strong bg-raised px-4 py-2.5">
				<h2 id="corpus-edit-heading" className="font-medium">
					Edit an instruction, review, then apply
				</h2>
			</header>
			<div className="px-4 py-3">
				{settings.isError ? (
					<p role="alert" className="text-sm text-muted-foreground">
						<span aria-hidden="true">⚠ </span>
						{`Could not read which corpus is linked, so nothing can be edited here: ${settings.error.message}`}
					</p>
				) : null}
				{settings.isSuccess && settings.data.linkedCorpus.kind === "live" ? (
					<p className="text-sm text-muted-foreground">
						The linked corpus is the live install, which is rendered from your
						source and loaded by every agent session on this machine, so it is
						not edited here. Link a copy to edit with{" "}
						<code className="font-mono text-pale">
							{settings.data.linkCommand}
						</code>
					</p>
				) : null}
				{settings.isSuccess &&
				settings.data.linkedCorpus.kind === "directory" ? (
					<EditBody
						edit={edit}
						onEdit={onEdit}
						source={source}
						evidence={evidence}
					/>
				) : null}
			</div>
		</section>
	);
}

function EditBody({
	edit,
	onEdit,
	source,
	evidence,
}: {
	readonly edit: EditState;
	readonly onEdit: (edit: EditState) => void;
	readonly source: CorpusExperimentSource | undefined;
	readonly evidence: SourceEvidence | undefined;
}): React.JSX.Element {
	switch (edit.kind) {
		case "idle": {
			return (
				<p className="text-sm text-muted-foreground">
					Choose Edit on a file to change its text against the version under
					test.
				</p>
			);
		}
		case "editing": {
			return (
				<CorpusEditor
					key={edit.path}
					path={edit.path}
					lines={edit.lines}
					hasReplayableSource={evidence?.replayable === true}
					onDiscard={() => {
						onEdit({ kind: "idle" });
					}}
					onApplied={(applied) => {
						onEdit({ kind: "applied", path: edit.path, applied });
					}}
				/>
			);
		}
		case "applied": {
			return (
				<AppliedEdit
					path={edit.path}
					applied={edit.applied}
					source={source}
					evidence={evidence}
				/>
			);
		}
		default: {
			return edit satisfies never;
		}
	}
}

function CorpusInventory({
	report,
	isLoading,
	isError,
	onEdit,
}: {
	readonly report: CorpusResponse | undefined;
	readonly isLoading: boolean;
	readonly isError: boolean;
	readonly onEdit: ((path: string) => void) | undefined;
}): React.JSX.Element {
	return (
		<>
			{isLoading ? <p className="text-muted-foreground">Loading…</p> : null}
			{isError ? (
				<p role="alert" className="text-muted-foreground">
					<span aria-hidden="true">⚠ </span>
					Could not load the corpus.
				</p>
			) : null}
			{report !== undefined && report.refusals.length > 0 ? (
				<Notice
					message="These entries could not be hashed, so they are missing from the table, and a refused layout directory is missing from it whole:"
					items={report.refusals}
				/>
			) : null}
			{report !== undefined &&
			report.files.length === 0 &&
			report.refusals.length === 0 ? (
				<EmptyState heading="No corpus files found">
					<p>
						The corpus root holds no files in corpus layout. Add a CLAUDE.md, a
						skill, an output style, or an agent definition under it, then reload
						this screen.
					</p>
				</EmptyState>
			) : null}
			{report !== undefined && report.files.length > 0 ? (
				<TableShell
					caption="Corpus files"
					columns={onEdit === undefined ? [...COLUMNS] : [...COLUMNS, "Edit"]}
					numeric={["Read by", "Invalidated"]}
					rows={report.files.map((file) =>
						rowFor(file, report.lastEdit, onEdit),
					)}
				/>
			) : null}
		</>
	);
}

export function CorpusPage({
	opened,
	source,
}: {
	readonly opened?: OpenedCorpusFile | undefined;
	readonly source?: CorpusExperimentSource | undefined;
}): React.JSX.Element {
	const query = useQuery(corpusQuery);
	const settings = useQuery(launchSettingsQuery);
	const [edit, setEdit] = useState<EditState>(
		opened === undefined
			? { kind: "idle" }
			: { kind: "editing", path: opened.path, lines: opened.lines },
	);
	useEffect(() => {
		setEdit(
			opened === undefined
				? { kind: "idle" }
				: { kind: "editing", path: opened.path, lines: opened.lines },
		);
	}, [opened?.path, opened?.lines?.start, opened?.lines?.end]);
	const {
		activeSource,
		sourcePath,
		visibleEvidence,
		clearSource,
		selectedFile,
	} = useExperimentSource(
		opened?.path,
		source,
		edit.kind === "idle" ? undefined : edit.path,
	);
	const onEdit =
		settings.isSuccess && settings.data.linkedCorpus.kind === "directory"
			? (path: string) => {
					selectedFile(path);
					setEdit({ kind: "editing", path });
				}
			: undefined;

	return (
		<div>
			<ScreenHeader
				title="Instruction corpus"
				subline={
					query.isSuccess ? (
						<>
							<span className="font-mono">{query.data.root}</span>
							{` · ${plural(query.data.files.length, "file")}`}
							{query.data.digest === undefined ? null : (
								<>
									{" · current version "}
									<span className="font-mono text-pale">
										{corpusVersionLabel(query.data.digest)}
									</span>
								</>
							)}
						</>
					) : undefined
				}
				aside={
					query.isSuccess ? (
						<LastEditCard lastEdit={query.data.lastEdit} />
					) : undefined
				}
			/>

			<div className="flex max-w-7xl flex-col gap-6 px-6 pt-4 pb-12">
				{activeSource === undefined || sourcePath === undefined ? null : (
					<ExperimentSource
						source={activeSource}
						path={sourcePath}
						evidence={visibleEvidence}
						currentCorpus={query.data?.digest}
						onClear={clearSource}
					/>
				)}
				<EditSection
					edit={edit}
					onEdit={setEdit}
					source={activeSource}
					evidence={visibleEvidence}
				/>
				<CorpusInventory
					report={query.data}
					isLoading={query.isLoading}
					isError={query.isError}
					onEdit={onEdit}
				/>
			</div>
		</div>
	);
}
