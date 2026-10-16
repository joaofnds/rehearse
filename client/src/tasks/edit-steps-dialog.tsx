import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import type { StageDefinition } from "#benchmark/pipeline";
import { useId, useState } from "react";
import { launchClient } from "#client/api-client";
import { corpusQuery } from "#client/corpus/corpus-query";
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

const stepsRoute = launchClient.api.cases[":id"].steps;

type DeclaredSteps = InferResponseType<typeof stepsRoute.$get, 200>;

type StepKind = "planning" | "delivery";

/** One step as the form holds it, every field a string the operator types. */
interface StepDraft {
	readonly name: string;
	readonly kind: StepKind;
	readonly skill: string;
	readonly rubric: string;
	readonly artifact: string;
	readonly requiresAcceptanceCriteria: boolean;
}

class StepsRefusedError extends Error {
	public override name = "StepsRefusedError";
}

interface StepsQuery {
	readonly queryKey: readonly ["case-steps", string];
	readonly queryFn: () => Promise<DeclaredSteps>;
}

function stepsQuery(caseId: string): StepsQuery {
	return {
		queryKey: ["case-steps", caseId],
		queryFn: async () => {
			const response = await stepsRoute.$get({ param: { id: caseId } });
			if (response.status !== 200) {
				throw new StepsRefusedError(await refusalReason(response));
			}

			return response.json();
		},
	};
}

function draftOf(stage: DeclaredSteps["stages"][number]): StepDraft {
	return stage.kind === "planning"
		? {
				name: stage.name,
				kind: stage.kind,
				skill: stage.skill,
				rubric: stage.rubric,
				artifact: stage.artifact ?? "",
				requiresAcceptanceCriteria: stage.requiresAcceptanceCriteria,
			}
		: {
				name: stage.name,
				kind: stage.kind,
				skill: stage.skill,
				rubric: stage.rubric,
				artifact: "",
				requiresAcceptanceCriteria: false,
			};
}

/** A blank artifact is left out, since the harness reads its absence as none. */
function savedStage(draft: StepDraft): StageDefinition {
	const name = draft.name.trim();
	const skill = draft.skill.trim();
	if (draft.kind === "delivery") {
		return { name, kind: draft.kind, skill, rubric: draft.rubric };
	}

	const planning = {
		name,
		kind: draft.kind,
		skill,
		rubric: draft.rubric,
		requiresAcceptanceCriteria: draft.requiresAcceptanceCriteria,
	};
	const artifact = draft.artifact.trim();

	return artifact === "" ? planning : { ...planning, artifact };
}

async function putSteps({
	caseId,
	stages,
}: {
	readonly caseId: string;
	readonly stages: readonly StageDefinition[];
}): Promise<DeclaredSteps> {
	const response = await stepsRoute.$put(
		{ param: { id: caseId } },
		{
			headers: { "Content-Type": "application/json" },
			init: { body: JSON.stringify({ stages }) },
		},
	);
	if (response.status !== 200) {
		throw new StepsRefusedError(await refusalReason(response));
	}

	return response.json();
}

/** The skills the corpus holds, each a `skills/<name>/SKILL.md` file. */
function corpusSkills(paths: readonly string[]): readonly string[] {
	return paths.flatMap((path) => {
		const skill = /^skills\/(?<skill>[^/]+)\/SKILL\.md$/u.exec(path)?.groups?.[
			"skill"
		];

		return skill === undefined ? [] : [skill];
	});
}

const FIELD_CLASS =
	"w-full min-w-0 rounded-md border border-strong bg-background px-2 py-1.5 font-mono text-13";

function LabeledField({
	label,
	children,
}: {
	readonly label: string;
	readonly children: (id: string) => React.ReactNode;
}): React.JSX.Element {
	const id = useId();

	return (
		<span className="flex min-w-0 flex-col gap-1">
			<label htmlFor={id} className="text-12 text-muted-foreground">
				{label}
			</label>
			{children(id)}
		</span>
	);
}

function StepFields({
	position,
	count,
	step,
	rubrics,
	skillsId,
	focused,
	onChange,
	onMove,
	onRemove,
}: {
	readonly position: number;
	readonly count: number;
	readonly step: StepDraft;
	readonly rubrics: readonly string[];
	readonly skillsId: string;
	readonly focused: boolean;
	readonly onChange: (change: Partial<StepDraft>) => void;
	readonly onMove: (by: -1 | 1) => void;
	readonly onRemove: () => void;
}): React.JSX.Element {
	const legend = `Step ${String(position)}`;

	return (
		<fieldset
			aria-label={legend}
			className="flex flex-col gap-2 rounded-md border border-strong px-3 py-2.5"
		>
			<span className="flex items-center gap-2">
				<span aria-hidden="true" className="font-mono text-12 text-dim">
					{String(position).padStart(2, "0")}
				</span>
				<span className="ml-auto flex gap-1.5">
					<Button
						type="button"
						variant="quiet"
						size="xs"
						disabled={position === 1}
						onClick={() => {
							onMove(-1);
						}}
					>
						Move up
					</Button>
					<Button
						type="button"
						variant="quiet"
						size="xs"
						disabled={position === count}
						onClick={() => {
							onMove(1);
						}}
					>
						Move down
					</Button>
					<Button
						type="button"
						variant="quiet"
						size="xs"
						disabled={count === 1}
						onClick={onRemove}
					>
						Remove
					</Button>
				</span>
			</span>
			<span className="grid grid-cols-4 gap-2.5">
				<LabeledField label="Name">
					{(id) => (
						<input
							id={id}
							value={step.name}
							// The step the operator opened the editor from takes focus.
							// eslint-disable-next-line jsx-a11y/no-autofocus
							autoFocus={focused}
							onChange={(event) => {
								onChange({ name: event.target.value });
							}}
							className={FIELD_CLASS}
						/>
					)}
				</LabeledField>
				<LabeledField label="Kind">
					{(id) => (
						<select
							id={id}
							value={step.kind}
							onChange={(event) => {
								onChange({
									kind:
										event.target.value === "planning" ? "planning" : "delivery",
								});
							}}
							className={FIELD_CLASS}
						>
							<option value="planning">planning</option>
							<option value="delivery">delivery</option>
						</select>
					)}
				</LabeledField>
				<LabeledField label="Skill">
					{(id) => (
						<input
							id={id}
							list={skillsId}
							value={step.skill}
							onChange={(event) => {
								onChange({ skill: event.target.value });
							}}
							className={FIELD_CLASS}
						/>
					)}
				</LabeledField>
				<LabeledField label="Rubric">
					{(id) => (
						<select
							id={id}
							value={step.rubric}
							onChange={(event) => {
								onChange({ rubric: event.target.value });
							}}
							className={FIELD_CLASS}
						>
							{rubrics.includes(step.rubric) ? null : (
								<option value={step.rubric}>{step.rubric}</option>
							)}
							{rubrics.map((rubric) => (
								<option key={rubric} value={rubric}>
									{rubric}
								</option>
							))}
						</select>
					)}
				</LabeledField>
			</span>
			{step.kind === "planning" ? (
				<span className="grid grid-cols-4 items-end gap-2.5">
					<span className="col-span-3">
						<LabeledField label="Artifact">
							{(id) => (
								<input
									id={id}
									value={step.artifact}
									placeholder="optional"
									onChange={(event) => {
										onChange({ artifact: event.target.value });
									}}
									className={FIELD_CLASS}
								/>
							)}
						</LabeledField>
					</span>
					<label className="flex items-center gap-1.5 pb-1.5 text-12 text-muted-foreground">
						<input
							type="checkbox"
							checked={step.requiresAcceptanceCriteria}
							onChange={(event) => {
								onChange({ requiresAcceptanceCriteria: event.target.checked });
							}}
						/>
						Requires acceptance criteria
					</label>
				</span>
			) : null}
		</fieldset>
	);
}

function moved<T>(items: readonly T[], from: number, by: -1 | 1): T[] {
	const next = [...items];
	const to = from + by;
	const [item] = next.splice(from, 1);
	if (item === undefined) {
		return next;
	}
	next.splice(to, 0, item);

	return next;
}

function StepsForm({
	declared,
	focusStage,
	onSaved,
}: {
	readonly declared: DeclaredSteps;
	readonly focusStage: string | undefined;
	readonly onSaved: () => void;
}): React.JSX.Element {
	const queryClient = useQueryClient();
	const corpus = useQuery(corpusQuery);
	const skillsId = useId();
	const [steps, setSteps] = useState<readonly StepDraft[]>(() =>
		declared.stages.map(draftOf),
	);
	const save = useMutation({
		mutationFn: putSteps,
		onSuccess: async () => {
			onSaved();
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: pipelinesQuery.queryKey }),
				queryClient.invalidateQueries({
					queryKey: stepsQuery(declared.caseId).queryKey,
				}),
			]);
		},
	});
	const skills = corpusSkills(corpus.data?.files.map(({ path }) => path) ?? []);

	return (
		<form
			className="flex min-h-0 flex-col"
			onSubmit={(event) => {
				event.preventDefault();
				save.mutate({
					caseId: declared.caseId,
					stages: steps.map((step) => savedStage(step)),
				});
			}}
		>
			<datalist id={skillsId}>
				{skills.map((skill) => (
					<option key={skill} value={skill} />
				))}
			</datalist>
			<div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3.5">
				{steps.map((step, index) => (
					<StepFields
						// A step's place is its identity while the operator edits its name.
						key={index}
						position={index + 1}
						count={steps.length}
						step={step}
						rubrics={declared.rubrics}
						skillsId={skillsId}
						focused={step.name === focusStage}
						onChange={(change) => {
							setSteps((current) =>
								current.map((each, at) =>
									at === index ? { ...each, ...change } : each,
								),
							);
						}}
						onMove={(by) => {
							setSteps((current) => moved(current, index, by));
						}}
						onRemove={() => {
							setSteps((current) =>
								current.filter((_each, at) => at !== index),
							);
						}}
					/>
				))}
				<span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							setSteps((current) => [
								...current,
								{
									name: "",
									kind: "delivery",
									skill: "",
									rubric: declared.rubrics[0] ?? "",
									artifact: "",
									requiresAcceptanceCriteria: false,
								},
							]);
						}}
					>
						Add a step
					</Button>
				</span>
				<DialogDescription>
					Writes the steps into {declared.pipeline}, left uncommitted for you to
					review. Runs started after this read the new steps. Recorded runs keep
					the steps they ran.
				</DialogDescription>
				{save.isError ? (
					<p role="alert" className="text-13 text-secondary-foreground">
						<span aria-hidden="true">⚠ </span>
						{save.error.message}
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
					<Button type="submit" disabled={save.isPending}>
						Save steps
					</Button>
				</span>
			</footer>
		</form>
	);
}

function StepsEditor({
	caseId,
	focusStage,
	onSaved,
}: {
	readonly caseId: string;
	readonly focusStage: string | undefined;
	readonly onSaved: () => void;
}): React.JSX.Element {
	const query = useQuery(stepsQuery(caseId));
	if (query.data === undefined) {
		return (
			<p
				role={query.error === null ? undefined : "alert"}
				className="px-4 py-3.5 text-13 text-secondary-foreground"
			>
				{query.error === null ? "Reading the steps" : query.error.message}
			</p>
		);
	}

	return (
		<StepsForm
			declared={query.data}
			focusStage={focusStage}
			onSaved={onSaved}
		/>
	);
}

/**
 * Edits the steps a pipeline case's file declares: each step's name, kind,
 * skill and rubric, and their order. `focusStage` opens the editor on one
 * step, as the step modal does.
 */
export function EditStepsDialog({
	caseId,
	focusStage,
	trigger,
}: {
	readonly caseId: string;
	readonly focusStage?: string;
	readonly trigger: React.ReactNode;
}): React.JSX.Element {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent width="wide">
				<header className="flex items-center gap-3 border-b border-strong px-4 py-3">
					<DialogTitle>{`Edit steps · ${caseId}`}</DialogTitle>
					<span className="ml-auto">
						<DialogClose asChild>
							<Button variant="outline" size="sm" aria-label="Close">
								Esc
							</Button>
						</DialogClose>
					</span>
				</header>
				{open ? (
					<StepsEditor
						caseId={caseId}
						focusStage={focusStage}
						onSaved={() => {
							setOpen(false);
						}}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
