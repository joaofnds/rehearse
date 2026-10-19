import { useId } from "react";

import NativeSelect from "#client/system/ui/native-select";

import CheckCollection from "./case-declaration-checks";
import type { Draft, DraftEdit } from "./case-declaration-draft";
import { Field } from "./case-declaration-fields";

interface SessionFieldsProps {
	readonly draft: Draft;
	readonly edit: DraftEdit;
}

function SessionFields({ draft, edit }: SessionFieldsProps): React.JSX.Element {
	return (
		<>
			<dl className="grid grid-cols-1 items-center gap-x-4 gap-y-2 text-14 sm:grid-cols-4">
				<Field
					label="Prompt"
					multiline
					rows={12}
					value={draft.prompt}
					onChange={(prompt) => {
						edit({ prompt });
					}}
				/>
				<Field
					label="Tools"
					hint="Comma-separated, as the session may call them"
					value={draft.tools}
					onChange={(tools) => {
						edit({ tools });
					}}
				/>
				<Field
					label="Corpus files"
					multiline
					hint="One layout path per line, read from the corpus a run reads"
					value={draft.corpusFiles}
					onChange={(corpusFiles) => {
						edit({ corpusFiles });
					}}
				/>
				<SessionExecutionFields draft={draft} edit={edit} />
			</dl>

			<CheckCollection draft={draft} edit={edit} />
		</>
	);
}

interface PipelineFieldsProps {
	readonly draft: Draft;
	readonly from: string;
	readonly sources: readonly string[];
	readonly edit: DraftEdit;
}

function PipelineFields({
	draft,
	from,
	sources,
	edit,
}: PipelineFieldsProps): React.JSX.Element {
	const fromId = useId();
	const fromHintId = useId();

	return (
		<dl className="grid grid-cols-1 items-center gap-x-4 gap-y-2 text-14 sm:grid-cols-4">
			<Field
				label="Target repository"
				hint="A git repository root on this machine, absolute or relative to the case directory. A run works on a copy of its main branch."
				value={draft.targetPath}
				onChange={(targetPath) => {
					edit({ targetPath });
				}}
			/>
			<Field
				label="Task"
				multiline
				hint="Markdown, the work the first step is handed"
				value={draft.task}
				onChange={(task) => {
					edit({ task });
				}}
			/>
			<Field
				label="Product brief"
				multiline
				hint="Markdown, what the work is for"
				value={draft.productBrief}
				onChange={(productBrief) => {
					edit({ productBrief });
				}}
			/>
			<PipelineSourceChoice
				fromId={fromId}
				fromHintId={fromHintId}
				from={from}
				sources={sources}
				edit={edit}
			/>
		</dl>
	);
}

interface PipelineSourceChoiceProps {
	readonly fromId: string;
	readonly fromHintId: string;
	readonly from: string;
	readonly sources: readonly string[];
	readonly edit: DraftEdit;
}

function PipelineSourceChoice({
	fromId,
	fromHintId,
	from,
	sources,
	edit,
}: PipelineSourceChoiceProps): React.JSX.Element {
	return (
		<>
			<dt className="text-muted-foreground">
				<label htmlFor={fromId}>Steps and judges from</label>
			</dt>
			<dd className="sm:col-span-3 flex min-w-0 flex-col gap-1">
				<NativeSelect
					id={fromId}
					value={from}
					aria-describedby={fromHintId}
					onChange={(event) => {
						edit({ from: event.target.value });
					}}
				>
					{sources.map((source) => (
						<option key={source} value={source}>
							{source}
						</option>
					))}
				</NativeSelect>
				<span id={fromHintId} className="text-12 text-dim">
					Copies that case's steps, step rubrics, final rubric, target commands,
					model and budget. Edit the steps afterwards in Cases → Workflows.
				</span>
			</dd>
		</>
	);
}

function SessionExecutionFields({
	draft,
	edit,
}: SessionFieldsProps): React.JSX.Element {
	return (
		<>
			<Field
				label="Model"
				value={draft.model}
				onChange={(model) => {
					edit({ model });
				}}
			/>
			<Field
				label="Session budget"
				hint="USD, optional"
				value={draft.sessionBudgetUsd}
				onChange={(sessionBudgetUsd) => {
					edit({ sessionBudgetUsd });
				}}
			/>
		</>
	);
}

export { PipelineFields, SessionFields };
