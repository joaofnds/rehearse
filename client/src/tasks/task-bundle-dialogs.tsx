import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useId, useState } from "react";
import { z } from "zod";
import { launchClient } from "#client/api-client";
import { casesQuery } from "#client/cases/cases-query";
import { LAUNCH_CASES_QUERY_KEY } from "#client/launch/launch-dialog";
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
import { pipelinesQuery } from "./pipelines-query";
import type { PipelinesResponse } from "./pipelines-query";

type ListedTask = PipelinesResponse["pipelines"][number];

const previewRoute = launchClient.api["task-bundles"].preview;

type BundlePreview = InferResponseType<typeof previewRoute.$post, 200>;

class BundleRefusedError extends Error {
	public override name = "BundleRefusedError";
}

const FIELD_CLASS =
	"w-full min-w-0 rounded-md border border-strong bg-background px-2 py-1.5 font-mono text-sm";

function DialogHeader({
	title,
}: {
	readonly title: string;
}): React.JSX.Element {
	return (
		<header className="flex items-center gap-3 border-b border-strong px-4 py-3">
			<DialogTitle>{title}</DialogTitle>
			<span className="ml-auto">
				<DialogClose asChild>
					<Button variant="outline" size="sm" aria-label="Close">
						Esc
					</Button>
				</DialogClose>
			</span>
		</header>
	);
}

/** A relative path, which the typed client's `$url` cannot build. */
function bundleUrl(caseId: string): string {
	return `/api/cases/${encodeURIComponent(caseId)}/bundle`;
}

/**
 * Every task a case declares exports as one file. A pipeline only a run's
 * override named belongs to no case, so it has no task and brief to export.
 */
export function ExportTaskDialog({
	tasks,
}: {
	readonly tasks: readonly ListedTask[];
}): React.JSX.Element {
	const declared = tasks.flatMap((task) =>
		task.declaredBy === null ? [] : [{ task, caseId: task.declaredBy.id }],
	);

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="quiet">Export with judges</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader title="Export with judges" />
				<div className="flex flex-col gap-3 px-4 py-3.5">
					<DialogDescription>
						Each file holds one task: its task and brief, its steps, every step
						rubric and the final rubric, and the commands it runs in its target.
						The target path is this machine's, so whoever imports it names their
						own.
					</DialogDescription>
					{declared.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No task is declared by a case, so there is nothing to export.
						</p>
					) : (
						<ul className="flex flex-col gap-2">
							{declared.map(({ task, caseId }) => (
								<li
									key={caseId}
									className="flex items-center gap-3 rounded-md border border-strong px-3 py-2"
								>
									<span className="flex min-w-0 flex-col">
										<span className="font-mono text-sm">{caseId}</span>
										<span className="truncate font-mono text-11-5 text-dim">
											{task.stages.join(" → ")} · {task.stageJudges} step judges
											+ {task.taskJudges} task judge
										</span>
									</span>
									<Button variant="outline" size="sm" asChild>
										<a
											className="ml-auto"
											href={bundleUrl(caseId)}
											download={`${caseId}.task.json`}
										>
											Download {caseId}.task.json
										</a>
									</Button>
								</li>
							))}
						</ul>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

/** Any JSON document, which the server judges as a bundle. */
const JSON_DOCUMENT = z.json();

type JsonDocument = z.infer<typeof JSON_DOCUMENT>;

/** The file's text as JSON, so a file that is not JSON is named here rather than by the server's parser. */
function bundleDocument(text: string): JsonDocument {
	try {
		return JSON_DOCUMENT.parse(JSON.parse(text));
	} catch {
		throw new BundleRefusedError(
			"The file is not JSON, so it is no task bundle",
		);
	}
}

async function previewBundle(text: string): Promise<BundlePreview> {
	const response = await previewRoute.$post(undefined, {
		headers: { "Content-Type": "application/json" },
		init: { body: JSON.stringify({ bundle: bundleDocument(text) }) },
	});
	if (response.status !== 200) {
		throw new BundleRefusedError(await refusalReason(response));
	}

	return response.json();
}

interface ImportDraft {
	readonly id: string;
	readonly title: string;
	readonly targetPath: string;
}

interface ImportRequest extends ImportDraft {
	readonly bundleText: string;
}

async function importBundle(request: ImportRequest): Promise<string> {
	const response = await launchClient.api.cases.import.$post(undefined, {
		headers: { "Content-Type": "application/json" },
		init: {
			body: JSON.stringify({
				id: request.id.trim(),
				title: request.title,
				targetPath: request.targetPath.trim(),
				bundle: bundleDocument(request.bundleText),
			}),
		},
	});
	if (response.status !== 201) {
		throw new BundleRefusedError(await refusalReason(response));
	}
	const imported = await response.json();

	return imported.path;
}

function ImportField({
	label,
	value,
	hint,
	onChange,
}: {
	readonly label: string;
	readonly value: string;
	readonly hint?: string;
	readonly onChange: (value: string) => void;
}): React.JSX.Element {
	const id = useId();
	const hintId = useId();

	return (
		<div className="flex flex-col gap-1 text-sm">
			<label htmlFor={id} className="text-muted-foreground">
				{label}
			</label>
			<input
				id={id}
				value={value}
				aria-describedby={hint === undefined ? undefined : hintId}
				onChange={(event) => {
					onChange(event.target.value);
				}}
				className={FIELD_CLASS}
			/>
			{hint === undefined ? null : (
				<span id={hintId} className="text-xs text-dim">
					{hint}
				</span>
			)}
		</div>
	);
}

function PreviewSummary({
	preview,
}: {
	readonly preview: BundlePreview;
}): React.JSX.Element {
	return (
		<section
			aria-label="What the bundle holds"
			className="flex flex-col gap-2 rounded-md border border-strong px-3 py-2 text-sm"
		>
			<p>
				<span className="font-mono">{preview.caseId}</span> · {preview.title}
			</p>
			<p className="font-mono text-11-5">
				{preview.steps.map(({ name }) => name).join(" → ")} ·{" "}
				{preview.stepJudges} step judges + 1 task judge
				{preview.model === null ? "" : ` · ${preview.model}`}
			</p>
			<div>
				<p className="text-muted-foreground">
					Each run of it runs these commands in its target:
				</p>
				<ul className="mt-1 flex flex-col gap-0.5 font-mono text-11-5">
					{preview.commands.map((command) => (
						<li key={command}>{command}</li>
					))}
				</ul>
			</div>
			{preview.services.length > 0 && (
				<div>
					<p className="text-muted-foreground">
						It starts these containers, whose variables reach those commands and
						its agent sessions:
					</p>
					<ul className="mt-1 flex flex-col gap-0.5 font-mono text-11-5">
						{preview.services.map(({ name, image, exports }) => (
							<li key={name}>
								{name} from {image}, setting {exports.join(", ")}
							</li>
						))}
					</ul>
				</div>
			)}
		</section>
	);
}

function ImportForm({
	onImported,
}: {
	readonly onImported: (path: string) => void;
}): React.JSX.Element {
	const queryClient = useQueryClient();
	const fileId = useId();
	const [bundleText, setBundleText] = useState<string>();
	const [draft, setDraft] = useState<ImportDraft>({
		id: "",
		title: "",
		targetPath: "",
	});
	const preview = useMutation({
		mutationFn: previewBundle,
		onSuccess: (read) => {
			setDraft({
				id: read.caseId,
				title: read.title,
				targetPath: read.targetPath,
			});
		},
	});
	const imported = useMutation({
		mutationFn: importBundle,
		onSuccess: async (path) => {
			onImported(path);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: pipelinesQuery.queryKey }),
				queryClient.invalidateQueries({ queryKey: casesQuery.queryKey }),
				queryClient.invalidateQueries({ queryKey: LAUNCH_CASES_QUERY_KEY }),
			]);
		},
	});
	const edit = (change: Partial<ImportDraft>): void => {
		setDraft((current) => ({ ...current, ...change }));
	};
	const refusal = preview.error ?? imported.error;
	const readBundle = async (file: Readonly<Blob>): Promise<void> => {
		const text = await file.text();
		setBundleText(text);
		preview.mutate(text);
	};

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				if (bundleText !== undefined) {
					imported.mutate({ ...draft, bundleText });
				}
			}}
		>
			<DialogHeader title="Import a task" />
			<div className="flex flex-col gap-3 px-4 py-3.5">
				<label htmlFor={fileId} className="flex flex-col gap-1 text-sm">
					<span className="text-muted-foreground">Task bundle</span>
					<input
						id={fileId}
						type="file"
						accept=".json,application/json"
						onChange={(event) => {
							const [file] = event.target.files ?? [];
							if (file === undefined) {
								return;
							}
							imported.reset();
							void readBundle(file);
						}}
						className="text-sm"
					/>
				</label>

				{preview.isSuccess ? (
					<>
						<PreviewSummary preview={preview.data} />
						<ImportField
							label="Id"
							hint="The new case's directory under cases/"
							value={draft.id}
							onChange={(id) => {
								edit({ id });
							}}
						/>
						<ImportField
							label="Title"
							value={draft.title}
							onChange={(title) => {
								edit({ title });
							}}
						/>
						<ImportField
							label="Target repository"
							hint="A git repository root on this machine, absolute or relative to the case directory"
							value={draft.targetPath}
							onChange={(targetPath) => {
								edit({ targetPath });
							}}
						/>
					</>
				) : null}

				<DialogDescription>
					Writes the task as a new case under cases/&lt;id&gt;/ in the control
					repository, formatted and left uncommitted for you to review and
					commit.
				</DialogDescription>

				{refusal === null ? null : (
					<p role="alert" className="text-sm text-secondary-foreground">
						<span aria-hidden="true">⚠ </span>
						{refusal.message}
					</p>
				)}
			</div>
			<footer className="flex items-center gap-2.5 border-t border-strong px-4 py-3">
				<span className="ml-auto flex gap-2">
					<DialogClose asChild>
						<Button type="button" variant="outline">
							Cancel
						</Button>
					</DialogClose>
					<Button
						type="submit"
						disabled={!preview.isSuccess || imported.isPending}
					>
						Import
					</Button>
				</span>
			</footer>
		</form>
	);
}

export function ImportTaskDialog({
	onImported,
}: {
	readonly onImported: (path: string) => void;
}): React.JSX.Element {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="quiet">Import a task</Button>
			</DialogTrigger>
			<DialogContent>
				<ImportForm
					onImported={(path) => {
						setOpen(false);
						onImported(path);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
