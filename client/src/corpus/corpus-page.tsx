import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { CorpusFileViewer } from "./corpus-file-viewer";
import { StateBadge } from "#client/system/components/state-badge";
import { useEffect, useState } from "react";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { launchSettingsQuery } from "#client/launch/settings-query";
import { plural } from "#client/plural";
import { EmptyState } from "#client/system/components/empty-state";
import { Notice } from "#client/system/components/notice";
import { ScreenHeader } from "#client/system/components/screen-header";
import { TableShell } from "#client/system/components/table-shell";
import { Button } from "#client/system/ui/button";
import { corpusDraftIdentity } from "./corpus-draft";
import { AppliedEdit, CorpusEditor } from "./corpus-edit";
import type { AppliedCorpusEdit } from "./corpus-edit-requests";
import type { CorpusResponse } from "./corpus-query";
import { corpusQuery } from "./corpus-query";
import { CorpusSettingsLink } from "./corpus-return";
import { ExperimentSource, useExperimentSource } from "./experiment-source";
import type {
	CorpusExperimentSource,
	SourceEvidence,
} from "./experiment-source";
import { LastEditCard } from "./last-edit-card";
import type { LineRange } from "./line-range";

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
	onView: (path: string) => void,
): readonly React.ReactNode[] {
	return [
		<Button
			key="path"
			variant="link"
			size="compact"
			aria-label={`View ${file.path}`}
			onClick={() => {
				onView(file.path);
			}}
		>
			<span className="font-mono">{file.path}</span>
		</Button>,
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
					{settings.data?.linkedCorpus.kind === "directory"
						? "Edit an instruction, review, then apply"
						: "Inspect your instructions"}
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
					<div className="flex flex-col gap-4">
						<p className="text-14 text-muted-foreground">
							<StateBadge tone="neutral">Live install · read only</StateBadge>{" "}
							Open a file below to read it. Editing requires a separate linked
							copy. Link that copy with{" "}
							<code className="font-mono text-pale">
								{settings.data.linkCommand}
							</code>
							{". "}
							<CorpusSettingsLink
								path={edit.kind === "idle" ? undefined : edit.path}
								lines={
									edit.kind === "editing" || edit.kind === "viewing"
										? edit.lines
										: undefined
								}
								source={source}
							/>
						</p>
						{edit.kind === "viewing" || edit.kind === "editing" ? (
							<CorpusFileViewer
								key={edit.path}
								root={settings.data.linkedCorpus.root}
								path={edit.path}
								lines={edit.lines}
								onClose={() => {
									onEdit({ kind: "idle" });
								}}
							/>
						) : null}
					</div>
				) : null}
				{settings.isSuccess &&
				settings.data.linkedCorpus.kind === "directory" ? (
					<EditBody
						edit={edit}
						root={settings.data.linkedCorpus.root}
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
	root,
	onEdit,
	source,
	evidence,
}: {
	readonly edit: EditState;
	readonly root: string;
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
		case "viewing": {
			return (
				<CorpusFileViewer
					key={edit.path}
					root={root}
					path={edit.path}
					lines={edit.lines}
					onClose={() => {
						onEdit({ kind: "idle" });
					}}
					onEdit={() => {
						onEdit({ kind: "editing", path: edit.path, lines: edit.lines });
					}}
				/>
			);
		}
		case "editing": {
			return (
				<CorpusEditor
					key={JSON.stringify(corpusDraftIdentity(root, edit.path, source))}
					path={edit.path}
					root={root}
					source={source}
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
	onView,
	sourcePath,
}: {
	readonly sourcePath: string | undefined;
	readonly report: CorpusResponse | undefined;
	readonly isLoading: boolean;
	readonly isError: boolean;
	readonly onEdit: ((path: string) => void) | undefined;
	readonly onView: (path: string) => void;
}): React.JSX.Element {
	const [search, setSearch] = useState("");
	const needle = search.trim().toLowerCase();
	const files = (report?.files ?? [])
		.filter((file) =>
			[file.path, file.sha256].some((text) =>
				text.toLowerCase().includes(needle),
			),
		)
		.toSorted(
			(left, right) =>
				Number(right.path === sourcePath) - Number(left.path === sourcePath),
		);

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
				<div className="flex flex-wrap items-center gap-3">
					<label className="flex flex-1 items-center gap-2 rounded-md border border-strong bg-card px-3 py-2">
						<Search aria-hidden="true" className="size-4 text-dim" />
						<input
							type="search"
							aria-label="Search corpus files"
							placeholder="File path or hash"
							value={search}
							onChange={(event) => {
								setSearch(event.target.value);
							}}
							className="w-full bg-transparent text-12"
						/>
					</label>
					<Button
						variant="ghost"
						onClick={() => {
							setSearch("");
						}}
					>
						Clear search
					</Button>
					<span
						role="status"
						className="text-11-5 text-dim"
					>{`${files.length} of ${report.files.length} files shown`}</span>
				</div>
			) : null}
			{report !== undefined && report.files.length > 0 && files.length === 0 ? (
				<p className="text-13 text-muted-foreground">
					No corpus files match. Clear search to show all files.
				</p>
			) : null}
			{report !== undefined && report.files.length > 0 ? (
				<details className="rounded-md border border-divider bg-card px-4 py-3 text-13">
					<summary className="cursor-pointer font-medium">
						What do Read by and prior-version counts mean?
					</summary>
					<dl className="mt-3 grid gap-3">
						<div>
							<dt className="font-medium">Read by</dt>
							<dd className="text-muted-foreground">
								Distinct run-history rows whose records include this path in
								their captured corpus files or additional recorded corpus reads.
								This includes declared capture; the count does not establish
								that a model used the instruction. Unreadable records are
								excluded.
							</dd>
						</div>
						<div>
							<dt className="font-medium">Prior-version results</dt>
							<dd className="text-muted-foreground">
								Rows that recorded this file’s hash from the previous corpus
								version when that hash differs from the current file. These rows
								can include results already stale before the last edit. The
								last-edit card counts only results newly made stale by the whole
								edit. Counts are unavailable without a measured prior version.
							</dd>
						</div>
					</dl>
				</details>
			) : null}
			{report !== undefined && files.length > 0 ? (
				<TableShell
					caption="Corpus files"
					columns={onEdit === undefined ? [...COLUMNS] : [...COLUMNS, "Edit"]}
					numeric={["Read by", "Prior-version results"]}
					rows={files.map((file) =>
						rowFor(file, report.lastEdit, onEdit, onView),
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
						operation={
							settings.data?.linkedCorpus.kind === "directory" &&
							edit.kind === "editing"
								? "editing"
								: "reading"
						}
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
					sourcePath={sourcePath}
					report={query.data}
					isLoading={query.isLoading}
					isError={query.isError}
					onEdit={onEdit}
					onView={(path) => {
						selectedFile(path);
						if (
							(edit.kind === "viewing" || edit.kind === "editing") &&
							edit.path === path
						) {
							setEdit({ kind: "viewing", path, lines: edit.lines });
						} else {
							setEdit({ kind: "viewing", path });
						}
					}}
				/>
			</div>
		</div>
	);
}
