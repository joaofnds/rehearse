import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import type { Immutable } from "#benchmark/contracts";
import type { Check } from "#benchmark/session-check";
import { launchClient } from "#client/api-client";
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
import { DECLARED_BY_HAND_REASON } from "#server/declared-by-hand";
import { LAUNCH_CASES_QUERY_KEY } from "#client/launch/launch-dialog";
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

interface Draft {
	readonly id: string;
	readonly title: string;
	readonly prompt: string;
	readonly tools: string;
	readonly corpusFiles: string;
	readonly checks: readonly CheckDraft[];
	readonly model: string;
	readonly sessionBudgetUsd: string;
}

const EMPTY_DRAFT: Draft = {
	id: "",
	title: "",
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

const FIELD_CLASS =
	"w-full min-w-0 rounded-md border border-strong bg-background px-2 py-1.5 font-mono text-sm";

function Field({
	label,
	value,
	onChange,
	multiline = false,
	hint,
}: {
	readonly label: string;
	readonly value: string;
	readonly onChange: (value: string) => void;
	readonly multiline?: boolean;
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
						rows={3}
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
					<span id={hintId} className="text-xs text-dim">
						{hint}
					</span>
				)}
			</dd>
		</>
	);
}

function KindChoice(): React.JSX.Element {
	const reasonId = useId();

	return (
		<>
			<dt className="text-muted-foreground">Kind</dt>
			<dd
				role="radiogroup"
				aria-label="Kind"
				className="col-span-3 flex flex-col gap-1"
			>
				<span className="flex gap-4 text-sm">
					<label className="flex items-center gap-1.5">
						<input type="radio" name="kind" value="session" checked readOnly />
						Session
					</label>
					<label className="flex items-center gap-1.5 text-dim">
						<input
							type="radio"
							name="kind"
							value="pipeline"
							disabled
							aria-describedby={reasonId}
						/>
						Pipeline
					</label>
				</span>
				<span id={reasonId} className="text-xs text-dim">
					{DECLARED_BY_HAND_REASON}
				</span>
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
			<legend className="px-1 text-xs text-muted-foreground">{name}</legend>
			<label className="flex items-center gap-2 text-sm">
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
					className="h-9 min-w-0 flex-1 rounded-md border border-strong bg-background px-2 font-mono text-sm"
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
					<label key={field} className="flex items-center gap-2 text-sm">
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

function DeclareForm({
	onDeclared,
}: {
	readonly onDeclared: (path: string) => void;
}): React.JSX.Element {
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState(EMPTY_DRAFT);
	const declare = useMutation({
		mutationFn: postDeclaration,
		onSuccess: async (path) => {
			onDeclared(path);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: casesQuery.queryKey }),
				queryClient.invalidateQueries({ queryKey: LAUNCH_CASES_QUERY_KEY }),
			]);
		},
	});
	const edit = (change: Partial<Draft>): void => {
		setDraft((current) => ({ ...current, ...change }));
	};

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				declare.mutate(declarationRequest(draft));
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

			<div className="flex flex-col gap-3 px-4 py-3.5">
				<dl className="grid grid-cols-4 items-center gap-x-3 gap-y-2 text-sm">
					<Field
						label="Id"
						value={draft.id}
						onChange={(id) => {
							edit({ id });
						}}
					/>
					<KindChoice />
					<Field
						label="Title"
						value={draft.title}
						onChange={(title) => {
							edit({ title });
						}}
					/>
					<Field
						label="Prompt"
						multiline
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

				<DialogDescription>
					Writes cases/&lt;id&gt;/case.json in the control repository. The file
					is left uncommitted and unformatted, for you to format, review and
					commit.
				</DialogDescription>

				{declare.isError ? (
					<p role="alert" className="text-sm text-secondary-foreground">
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
					<Button type="submit" disabled={declare.isPending}>
						Declare
					</Button>
				</span>
			</footer>
		</form>
	);
}

/**
 * Declares a session case from the browser. A pipeline case needs a target
 * repository and task files, so the form offers only the session kind.
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
			<DialogContent>
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
