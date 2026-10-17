import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import type { Immutable } from "#benchmark/contracts";
import type { Check } from "#benchmark/session-check";
import { launchClient } from "#client/api-client";
import { refusalReason } from "#client/refusal-reason";
import { Button } from "#client/system/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "#client/system/ui/dialog";
import type { DeclareCaseRequest } from "#server/case-declaration";
import { LAUNCH_CASES_QUERY_KEY } from "#client/launch/launch-dialog";
import { pipelinesQuery } from "#client/tasks/pipelines-query";
import { casesQuery } from "./cases-query";

type CheckKind = Check["kind"];

type CheckField =
	| "min"
	| "max"
	| "strings"
	| "name"
	| "regex"
	| "flags"
	| "names"
	| "paths";

/** The fields each check kind is built from, as their labels name them. */
const CHECK_FIELDS = {
	"word-band": ["min", "max"],
	"forbidden-text": ["strings"],
	"forbidden-pattern": ["name", "regex", "flags"],
	"tool-calls": ["min", "max", "names"],
	"files-read": ["paths"],
} as const satisfies Record<CheckKind, readonly CheckField[]>;

const CHECK_KINDS: readonly CheckKind[] = Object.keys(CHECK_FIELDS).filter(
	(kind): kind is CheckKind => kind in CHECK_FIELDS,
);

const MULTILINE_FIELDS: ReadonlySet<CheckField> = new Set(["strings", "paths"]);

interface CheckDraft {
	readonly kind: CheckKind;
	readonly fields: Readonly<Partial<Record<CheckField, string>>>;
}

const NEW_CHECK: CheckDraft = { kind: "word-band", fields: {} };

type CaseKind = "session" | "pipeline";

interface Draft {
	readonly kind: CaseKind;
	readonly id: string;
	readonly title: string;
	readonly targetPath: string;
	readonly task: string;
	readonly productBrief: string;
	/** The pipeline case whose steps and judges a new pipeline case starts from. */
	readonly from: string;
	readonly prompt: string;
	readonly tools: string;
	readonly corpusFiles: string;
	readonly checks: readonly CheckDraft[];
	readonly model: string;
	readonly sessionBudgetUsd: string;
}

const EMPTY_DRAFT: Draft = {
	kind: "session",
	id: "",
	title: "",
	targetPath: "",
	task: "",
	productBrief: "",
	from: "",
	prompt: "",
	tools: "",
	corpusFiles: "",
	checks: [NEW_CHECK],
	model: "sonnet",
	sessionBudgetUsd: "",
};

class DeclarationRefusedError extends Error {
	public override name = "DeclarationRefusedError";
}

function commaList(text: string): string[] {
	return text
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item !== "");
}

function lineList(text: string): string[] {
	return text
		.split("\n")
		.map((item) => item.trim())
		.filter((item) => item !== "");
}

/**
 * A blank field is left out, and any other is sent as a number even when it
 * is not one, so the server's parser names the field rather than the form
 * dropping it.
 */
function optionalNumber(text: string | undefined): number | undefined {
	return text === undefined || text.trim() === "" ? undefined : Number(text);
}

function builtCheck({ kind, fields }: CheckDraft): Check {
	switch (kind) {
		case "word-band": {
			return {
				kind,
				min: optionalNumber(fields.min),
				max: optionalNumber(fields.max),
			};
		}
		case "forbidden-text": {
			return { kind, strings: lineList(fields.strings ?? "") };
		}
		case "forbidden-pattern": {
			const flags = fields.flags ?? "";
			return {
				kind,
				patterns: [
					{
						name: fields.name ?? "",
						regex: fields.regex ?? "",
						flags: flags === "" ? undefined : flags,
					},
				],
			};
		}
		case "tool-calls": {
			const names = commaList(fields.names ?? "");
			return {
				kind,
				min: optionalNumber(fields.min),
				max: optionalNumber(fields.max),
				names: names.length === 0 ? undefined : names,
			};
		}
		case "files-read": {
			return { kind, paths: lineList(fields.paths ?? "") };
		}
		default: {
			return kind satisfies never;
		}
	}
}

/** A field left `undefined` is absent from the posted JSON. */
function declarationRequest(draft: Draft): DeclareCaseRequest {
	return {
		id: draft.id.trim(),
		kind: "session",
		title: draft.title,
		prompt: draft.prompt,
		tools: commaList(draft.tools),
		corpusFiles: lineList(draft.corpusFiles),
		checks: draft.checks.map(builtCheck),
		model: draft.model.trim(),
		sessionBudgetUsd: optionalNumber(draft.sessionBudgetUsd),
	};
}

/**
 * A refusal the route declares arrives as `{ error }`. Anything else, the
 * request guard's plain-text 403 included, is shown as the server sent it.
 */
async function postDeclaration(
	request: Immutable<DeclareCaseRequest>,
): Promise<string> {
	const response = await launchClient.api.cases.$post({ json: request });
	if (response.status === 201) {
		const declared = await response.json();
		return declared.path;
	}
	if (
		response.status === 400 ||
		response.status === 404 ||
		response.status === 409
	) {
		const refusal = await response.json();
		throw new DeclarationRefusedError(refusal.error);
	}
	throw new DeclarationRefusedError(await response.text());
}

/** A new pipeline case as the server's pipeline route reads one. */
interface PipelineCaseRequest {
	readonly id: string;
	readonly title: string;
	readonly targetPath: string;
	readonly task: string;
	readonly productBrief: string;
	readonly from: string;
}

function pipelineRequest(draft: Draft, from: string): PipelineCaseRequest {
	return {
		id: draft.id.trim(),
		title: draft.title,
		targetPath: draft.targetPath.trim(),
		task: draft.task,
		productBrief: draft.productBrief,
		from,
	};
}

async function postPipelineDeclaration(
	request: PipelineCaseRequest,
): Promise<string> {
	const response = await launchClient.api.cases.pipeline.$post(undefined, {
		headers: { "Content-Type": "application/json" },
		init: { body: JSON.stringify(request) },
	});
	if (response.status === 201) {
		const declared = await response.json();
		return declared.path;
	}
	throw new DeclarationRefusedError(await refusalReason(response));
}

const FIELD_CLASS =
	"w-full min-w-0 rounded-md border border-strong bg-background px-2 py-1.5 font-mono text-14";

function Field({
	label,
	value,
	onChange,
	multiline = false,
	rows = 3,
	hint,
}: {
	readonly label: string;
	readonly value: string;
	readonly onChange: (value: string) => void;
	readonly multiline?: boolean;
	readonly rows?: number;
	readonly hint?: string;
}): React.JSX.Element {
	const id = useId();
	const hintId = useId();

	return (
		<>
			<dt className="text-muted-foreground">
				<label htmlFor={id}>{label}</label>
			</dt>
			<dd className="col-span-3 flex min-w-0 flex-col gap-1">
				{multiline ? (
					<textarea
						id={id}
						value={value}
						rows={rows}
						aria-describedby={hint === undefined ? undefined : hintId}
						onChange={(event) => {
							onChange(event.target.value);
						}}
						className={FIELD_CLASS}
					/>
				) : (
					<input
						id={id}
						value={value}
						aria-describedby={hint === undefined ? undefined : hintId}
						onChange={(event) => {
							onChange(event.target.value);
						}}
						className={FIELD_CLASS}
					/>
				)}
				{hint === undefined ? null : (
					<span id={hintId} className="text-12 text-dim">
						{hint}
					</span>
				)}
			</dd>
		</>
	);
}

const NO_PIPELINE_SOURCE_REASON =
	"A pipeline case starts from another pipeline case's steps and judges, and none is declared. Import a workflow in Cases → Workflows first.";

function KindChoice({
	kind,
	pipelineAvailable,
	onChange,
}: {
	readonly kind: CaseKind;
	readonly pipelineAvailable: boolean;
	readonly onChange: (kind: CaseKind) => void;
}): React.JSX.Element {
	const reasonId = useId();

	return (
		<>
			<dt className="text-muted-foreground">Kind</dt>
			<dd
				role="radiogroup"
				aria-label="Kind"
				className="col-span-3 flex flex-col gap-1"
			>
				<span className="flex gap-4 text-14">
					<label className="flex items-center gap-1.5">
						<input
							type="radio"
							name="kind"
							value="session"
							checked={kind === "session"}
							onChange={() => {
								onChange("session");
							}}
						/>
						Session
					</label>
					<label
						className={
							pipelineAvailable
								? "flex items-center gap-1.5"
								: "flex items-center gap-1.5 text-dim"
						}
					>
						<input
							type="radio"
							name="kind"
							value="pipeline"
							checked={kind === "pipeline"}
							disabled={!pipelineAvailable}
							aria-describedby={pipelineAvailable ? undefined : reasonId}
							onChange={() => {
								onChange("pipeline");
							}}
						/>
						Pipeline
					</label>
				</span>
				{pipelineAvailable ? null : (
					<span id={reasonId} className="text-12 text-dim">
						{NO_PIPELINE_SOURCE_REASON}
					</span>
				)}
			</dd>
		</>
	);
}

function CheckRow({
	position,
	check,
	onChange,
}: {
	readonly position: number;
	readonly check: CheckDraft;
	readonly onChange: (check: CheckDraft) => void;
}): React.JSX.Element {
	const name = `Check ${String(position)}`;

	return (
		<fieldset className="flex flex-col gap-1.5 rounded-md border border-strong px-3 py-2">
			<legend className="px-1 text-12 text-muted-foreground">{name}</legend>
			<label className="flex items-center gap-2 text-14">
				<span className="w-16 text-muted-foreground">kind</span>
				<select
					aria-label={`${name} kind`}
					value={check.kind}
					onChange={(event) => {
						const kind = CHECK_KINDS.find(
							(choice) => choice === event.target.value,
						);
						if (kind !== undefined) {
							onChange({ kind, fields: {} });
						}
					}}
					className="h-9 min-w-0 flex-1 rounded-md border border-strong bg-background px-2 font-mono text-14"
				>
					{CHECK_KINDS.map((kind) => (
						<option key={kind} value={kind}>
							{kind}
						</option>
					))}
				</select>
			</label>
			{CHECK_FIELDS[check.kind].map((field) => {
				const value = check.fields[field] ?? "";
				const change = (next: string): void => {
					onChange({ ...check, fields: { ...check.fields, [field]: next } });
				};

				return (
					<label key={field} className="flex items-center gap-2 text-14">
						<span className="w-16 text-muted-foreground">{field}</span>
						{MULTILINE_FIELDS.has(field) ? (
							<textarea
								aria-label={`${name} ${field}`}
								value={value}
								rows={2}
								onChange={(event) => {
									change(event.target.value);
								}}
								className={FIELD_CLASS}
							/>
						) : (
							<input
								aria-label={`${name} ${field}`}
								value={value}
								onChange={(event) => {
									change(event.target.value);
								}}
								className={FIELD_CLASS}
							/>
						)}
					</label>
				);
			})}
		</fieldset>
	);
}

type DraftEdit = (change: Partial<Draft>) => void;

function SessionFields({
	draft,
	edit,
}: {
	readonly draft: Draft;
	readonly edit: DraftEdit;
}): React.JSX.Element {
	return (
		<>
			<dl className="grid grid-cols-4 items-center gap-x-3 gap-y-2 text-14">
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
			</dl>

			<div className="flex flex-col gap-2">
				{draft.checks.map((check, index) => (
					<CheckRow
						key={index}
						position={index + 1}
						check={check}
						onChange={(changed) => {
							edit({
								checks: draft.checks.map((current, at) =>
									at === index ? changed : current,
								),
							});
						}}
					/>
				))}
				<span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							edit({ checks: [...draft.checks, NEW_CHECK] });
						}}
					>
						Add a check
					</Button>
				</span>
			</div>
		</>
	);
}

function PipelineFields({
	draft,
	from,
	sources,
	edit,
}: {
	readonly draft: Draft;
	readonly from: string;
	readonly sources: readonly string[];
	readonly edit: DraftEdit;
}): React.JSX.Element {
	const fromId = useId();
	const fromHintId = useId();

	return (
		<dl className="grid grid-cols-4 items-center gap-x-3 gap-y-2 text-14">
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
			<dt className="text-muted-foreground">
				<label htmlFor={fromId}>Steps and judges from</label>
			</dt>
			<dd className="col-span-3 flex min-w-0 flex-col gap-1">
				<select
					id={fromId}
					value={from}
					aria-describedby={fromHintId}
					onChange={(event) => {
						edit({ from: event.target.value });
					}}
					className="h-9 min-w-0 rounded-md border border-strong bg-background px-2 font-mono text-14"
				>
					{sources.map((source) => (
						<option key={source} value={source}>
							{source}
						</option>
					))}
				</select>
				<span id={fromHintId} className="text-12 text-dim">
					Copies that case's steps, step rubrics, final rubric, target commands,
					model and budget. Edit the steps afterwards in Cases → Workflows.
				</span>
			</dd>
		</dl>
	);
}

function DeclareForm({
	onDeclared,
}: {
	readonly onDeclared: (path: string) => void;
}): React.JSX.Element {
	const queryClient = useQueryClient();
	const cases = useQuery(casesQuery);
	const sources = (cases.data?.cases ?? [])
		.filter((listed) => listed.kind === "pipeline")
		.map(({ id }) => id);
	const [draft, setDraft] = useState(EMPTY_DRAFT);
	const from = sources.includes(draft.from) ? draft.from : (sources[0] ?? "");
	const declare = useMutation({
		mutationFn: (declared: Draft) =>
			declared.kind === "session"
				? postDeclaration(declarationRequest(declared))
				: postPipelineDeclaration(pipelineRequest(declared, from)),
		onSuccess: async (path) => {
			onDeclared(path);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: casesQuery.queryKey }),
				queryClient.invalidateQueries({ queryKey: LAUNCH_CASES_QUERY_KEY }),
				queryClient.invalidateQueries({ queryKey: pipelinesQuery.queryKey }),
			]);
		},
	});
	const edit: DraftEdit = (change) => {
		setDraft((current) => ({ ...current, ...change }));
	};

	return (
		<form
			className="flex min-h-0 flex-col overflow-hidden"
			onSubmit={(event) => {
				event.preventDefault();
				declare.mutate(draft);
			}}
		>
			<header className="flex items-center gap-3 border-b border-strong px-4 py-3">
				<DialogTitle>Declare a case</DialogTitle>
				<span className="ml-auto">
					<DialogClose asChild>
						<Button variant="outline" size="sm" aria-label="Close">
							Esc
						</Button>
					</DialogClose>
				</span>
			</header>

			<div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-4">
				<dl className="grid grid-cols-4 items-center gap-x-3 gap-y-2 text-14">
					<Field
						label="Id"
						value={draft.id}
						onChange={(id) => {
							edit({ id });
						}}
					/>
					<KindChoice
						kind={draft.kind}
						pipelineAvailable={sources.length > 0}
						onChange={(kind) => {
							edit({ kind });
						}}
					/>
					<Field
						label="Title"
						value={draft.title}
						onChange={(title) => {
							edit({ title });
						}}
					/>
				</dl>

				{draft.kind === "session" ? (
					<SessionFields draft={draft} edit={edit} />
				) : (
					<PipelineFields
						draft={draft}
						from={from}
						sources={sources}
						edit={edit}
					/>
				)}

				<DialogDescription>
					{draft.kind === "session"
						? "Writes cases/<id>/case.json in the control repository, formatted and left uncommitted for you to review and commit."
						: "Writes cases/<id>/ in the control repository: its case.json, the task and brief, and a copy of the chosen case's pipeline and rubrics, formatted and left uncommitted for you to review and commit."}
				</DialogDescription>

				{declare.isError ? (
					<p role="alert" className="text-14 text-attention">
						<span aria-hidden="true">⚠ </span>
						{declare.error.message}
					</p>
				) : null}
			</div>

			<footer className="flex items-center gap-2.5 border-t border-strong px-4 py-3">
				<span className="ml-auto flex gap-2">
					<DialogClose asChild>
						<Button type="button" variant="outline">
							Cancel
						</Button>
					</DialogClose>
					<Button variant="primary" type="submit" disabled={declare.isPending}>
						Declare
					</Button>
				</span>
			</footer>
		</form>
	);
}

/**
 * Declares a case from the browser: a session case from its prompt and
 * checks, or a pipeline case from a task and brief with another pipeline
 * case's steps and judges.
 */
export function DeclareCaseDialog({
	onDeclared,
}: {
	readonly onDeclared: (path: string) => void;
}): React.JSX.Element {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">Declare a case</Button>
			</DialogTrigger>
			<DialogContent width="wide">
				<DeclareForm
					onDeclared={(path) => {
						setOpen(false);
						onDeclared(path);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
