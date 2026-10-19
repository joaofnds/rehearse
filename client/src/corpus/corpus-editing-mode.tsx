import { useQuery } from "@tanstack/react-query";

import { launchSettingsQuery } from "#client/launch/settings-query";
import StateBadge from "#client/system/components/state-badge";

import { corpusDraftIdentity } from "./corpus-draft";
import { AppliedEdit, CorpusEditor } from "./corpus-edit";
import CorpusFileViewer from "./corpus-file-viewer";
import type { EditState } from "./corpus-navigation";
import { CorpusSettingsLink } from "./corpus-return";
import type {
	CorpusExperimentSource,
	SourceEvidence,
} from "./experiment-source";

interface EditSectionProps {
	readonly edit: EditState;
	readonly onEdit: (edit: EditState) => void;
	readonly source: CorpusExperimentSource | undefined;
	readonly evidence: SourceEvidence | undefined;
	readonly viewRequest: number;
	readonly onCloseReader: () => void;
}

function EditSection({
	edit,
	onEdit,
	source,
	evidence,
	viewRequest,
	onCloseReader,
}: EditSectionProps): React.JSX.Element {
	const settings = useQuery(launchSettingsQuery);

	return (
		<section
			aria-labelledby="corpus-edit-heading"
			className="overflow-hidden rounded-lg border border-divider bg-card"
		>
			<CorpusEditingHeading
				editable={settings.data?.linkedCorpus.kind === "directory"}
			/>
			<div className="p-6">
				{settings.isError ? (
					<CorpusSettingsRefusal reason={settings.error.message} />
				) : null}
				{settings.isSuccess && settings.data.linkedCorpus.kind === "live" ? (
					<LiveCorpusReading
						edit={edit}
						linkedRoot={settings.data.linkedCorpus.root}
						linkCommand={settings.data.linkCommand}
						source={source}
						viewRequest={viewRequest}
						onCloseReader={onCloseReader}
					/>
				) : null}
				{settings.isSuccess &&
				settings.data.linkedCorpus.kind === "directory" ? (
					<EditBody
						edit={edit}
						root={settings.data.linkedCorpus.root}
						onEdit={onEdit}
						source={source}
						evidence={evidence}
						viewRequest={viewRequest}
						onCloseReader={onCloseReader}
					/>
				) : null}
			</div>
		</section>
	);
}

interface EditBodyProps {
	readonly edit: EditState;
	readonly root: string;
	readonly onEdit: (edit: EditState) => void;
	readonly source: CorpusExperimentSource | undefined;
	readonly evidence: SourceEvidence | undefined;
	readonly viewRequest: number;
	readonly onCloseReader: () => void;
}

function EditBody({
	edit,
	root,
	onEdit,
	source,
	evidence,
	viewRequest,
	onCloseReader,
}: EditBodyProps): React.JSX.Element {
	if (edit.kind === "idle") {
		return (
			<p className="text-14 text-muted-foreground">
				Choose Edit on a file to change its text against the version under test.
			</p>
		);
	}
	if (edit.kind === "viewing") {
		return (
			<EditableCorpusReader
				key={edit.path}
				edit={edit}
				root={root}
				viewRequest={viewRequest}
				onCloseReader={onCloseReader}
				onEdit={onEdit}
			/>
		);
	}
	if (edit.kind === "editing") {
		return (
			<EditableCorpusFile
				key={JSON.stringify(corpusDraftIdentity(root, edit.path, source))}
				edit={edit}
				root={root}
				source={source}
				evidence={evidence}
				onEdit={onEdit}
			/>
		);
	}
	return (
		<AppliedEdit
			path={edit.path}
			applied={edit.applied}
			source={source}
			evidence={evidence}
		/>
	);
}

interface LiveCorpusReadingProps {
	readonly edit: EditState;
	readonly linkedRoot: string;
	readonly linkCommand: string;
	readonly source: CorpusExperimentSource | undefined;
	readonly viewRequest: number;
	readonly onCloseReader: () => void;
}

function LiveCorpusReading({
	edit,
	linkedRoot,
	linkCommand,
	source,
	viewRequest,
	onCloseReader,
}: LiveCorpusReadingProps): React.JSX.Element {
	return (
		<div className="flex flex-col gap-4">
			<p className="text-14 text-muted-foreground">
				<StateBadge tone="neutral">Live install · read only</StateBadge> Open a
				file below to read it. Editing requires a separate linked copy. Link
				that copy with{" "}
				<code className="font-mono text-pale">{linkCommand}</code>
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
					root={linkedRoot}
					path={edit.path}
					lines={edit.lines}
					viewRequest={viewRequest}
					onClose={onCloseReader}
				/>
			) : null}
		</div>
	);
}

interface EditableCorpusFileProps {
	readonly edit: Extract<EditState, { readonly kind: "editing" }>;
	readonly root: string;
	readonly source: CorpusExperimentSource | undefined;
	readonly evidence: SourceEvidence | undefined;
	readonly onEdit: (edit: EditState) => void;
}

function EditableCorpusFile({
	edit,
	root,
	source,
	evidence,
	onEdit,
}: EditableCorpusFileProps): React.JSX.Element {
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
				onEdit({ applied, kind: "applied", path: edit.path });
			}}
		/>
	);
}

interface EditableCorpusReaderProps {
	readonly edit: Extract<EditState, { readonly kind: "viewing" }>;
	readonly root: string;
	readonly viewRequest: number;
	readonly onCloseReader: () => void;
	readonly onEdit: (edit: EditState) => void;
}

function EditableCorpusReader({
	edit,
	root,
	viewRequest,
	onCloseReader,
	onEdit,
}: EditableCorpusReaderProps): React.JSX.Element {
	return (
		<CorpusFileViewer
			key={edit.path}
			root={root}
			path={edit.path}
			lines={edit.lines}
			viewRequest={viewRequest}
			onClose={onCloseReader}
			onEdit={() => {
				onEdit({ kind: "editing", lines: edit.lines, path: edit.path });
			}}
		/>
	);
}

interface CorpusEditingHeadingProps {
	readonly editable: boolean;
}

function CorpusEditingHeading({
	editable,
}: CorpusEditingHeadingProps): React.JSX.Element {
	return (
		<header className="border-b border-divider px-6 py-4">
			<h2 id="corpus-edit-heading" className="font-semibold">
				{editable
					? "Edit an instruction, review, then apply"
					: "Inspect your instructions"}
			</h2>
		</header>
	);
}

interface CorpusSettingsRefusalProps {
	readonly reason: string;
}

function CorpusSettingsRefusal({
	reason,
}: CorpusSettingsRefusalProps): React.JSX.Element {
	return (
		<p role="alert" className="text-14 text-attention">
			<span aria-hidden="true">⚠ </span>
			{`Could not read which corpus is linked, so nothing can be edited here: ${reason}`}
		</p>
	);
}

export { EditSection as default };
