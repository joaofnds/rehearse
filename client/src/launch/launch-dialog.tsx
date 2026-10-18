import { NativeSelect } from "#client/system/ui/native-select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { InferResponseType } from "hono/client";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import type { LaunchAttempts } from "#benchmark/launch-attempts";
import { LAUNCH_ATTEMPTS } from "#benchmark/launch-attempts";
import { groupSpendCeilingUsd } from "#benchmark/spend-ceiling";
import { launchClient } from "#client/api-client";
import { plural } from "#client/plural";
import { refusalReason } from "#client/refusal-reason";
import { corpusQuery } from "#client/corpus/corpus-query";
import { runRecordQuery } from "#client/monitor/run-record-query";
import { runHistoryQuery } from "#client/run-history/run-history-query";
import { spendReading } from "#client/run-history/run-progress";
import { AmountInput } from "#client/system/components/amount-input";
import { ActionGroup } from "#client/system/components/action-group";
import { FilterPill } from "#client/system/components/filter-pill";
import { Notice } from "#client/system/components/notice";
import { Button } from "#client/system/ui/button";
import { KeyHint } from "#client/system/components/key-hint";
import { useKeyShortcut } from "#client/shell/use-key-shortcut";
import type { LaunchRequest } from "#server/launches";
import { LaunchRefusedError, postLaunch } from "./post-launch";
import { launchSettingsQuery } from "./settings-query";
import {
	enteredCeilingUsd,
	putSpendCeiling,
	storedCeilingEntry,
} from "./spend-ceiling-entry";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "#client/system/ui/dialog";

/** A pipeline run the operator can replay a step of. */
export interface ReplayableRun {
	readonly run: string;
	readonly caseId: string | undefined;
	/** Its steps whose starting checkpoint is recorded, in pipeline order. */
	readonly stages: readonly string[];
	/** The step chosen when this run is chosen. */
	readonly openingStage: string;
}

export interface ReplayChoice {
	readonly run: string;
	readonly stage: string;
}

/** The launch dialog's case list, which a newly declared case makes stale. */
export const LAUNCH_CASES_QUERY_KEY = ["launch-cases"] as const;

export type LaunchTarget =
	| {
			readonly kind: "case";
			/** The case the dialog opens on, else the first that declares a model. */
			readonly caseId?: string;
			/** The attempts the dialog opens on, else one. */
			readonly attempts?: LaunchAttempts;
	  }
	| {
			readonly kind: "replay";
			readonly run: string;
			readonly stage: string;
			/** The attempts the dialog opens on, else one. */
			readonly attempts?: LaunchAttempts;
	  }
	| {
			/** A stage replay whose run and step the operator chooses in the dialog. */
			readonly kind: "chosen-replay";
			/** Newest first. */
			readonly runs: readonly ReplayableRun[];
			readonly opensOn: ReplayChoice;
	  }
	| {
			readonly kind: "comparison";
			readonly armA: string;
			readonly armB: string;
			readonly run: string;
			readonly stage: string;
			/** Baseline group size, which the control group copies. */
			readonly reps: number;
	  }
	| {
			readonly kind: "extension";
			readonly comparison: string;
			/** How many attempts each arm gains. */
			readonly attempts: number;
			/** What they cost at each arm's mean recorded cost per attempt. */
			readonly usd: number;
	  };

/** A launch target with its run and step settled. */
type SettledTarget = Exclude<LaunchTarget, { readonly kind: "chosen-replay" }>;

type CasesResponse = InferResponseType<typeof launchClient.api.cases.$get>;

type CaseListing = CasesResponse["cases"][number];

/** An edit that differs from the stored ceiling holds the launch until stored. */
function holdsUnstoredCeiling(
	draft: string | undefined,
	storedUsd: number | undefined,
): boolean {
	if (draft === undefined) {
		return false;
	}
	const usd = enteredCeilingUsd(draft);

	return usd === undefined
		? draft !== shownCeiling(undefined, storedUsd)
		: usd !== storedUsd;
}

/** What the field shows: the operator's edit, or the stored ceiling as stored. */
function shownCeiling(
	draft: string | undefined,
	storedUsd: number | undefined,
): string {
	return (
		draft ?? (storedUsd === undefined ? "" : storedCeilingEntry(storedUsd))
	);
}

async function fetchCases(): Promise<CasesResponse> {
	const response = await launchClient.api.cases.$get();
	if (!response.ok) {
		throw new LaunchRefusedError(await refusalReason(response));
	}

	return response.json();
}

function attemptsLabel(attempts: number): string {
	return attempts === 1 ? "1 attempt" : `${String(attempts)} attempts`;
}

function launchBudgetReading(
	ceilingUsd: number | undefined,
	pending: boolean,
): string {
	if (pending) {
		return "Reading saved default…";
	}
	return ceilingUsd === undefined
		? "No saved default"
		: `$${storedCeilingEntry(ceilingUsd)} per attempt · saved default`;
}

/**
 * A group's attempts each run under the stored ceiling and all of them
 * together under the group ceiling. A call already in flight when the ceiling
 * is reached still lands, which is why the ceiling can be overrun.
 */
function ceilingReading(ceilingUsd: number, started: StartedGroups): string {
	return `${ceilingHolds(ceilingUsd, started)} · stops mid-step if reached, and can be overrun by the calls in flight`;
}

function ceilingHolds(
	ceilingUsd: number,
	{ groups, attempts }: StartedGroups,
): string {
	if (attempts === 1 && groups === 1) {
		return `Ceiling ${spendReading(ceilingUsd)} per attempt`;
	}
	const perGroup = `Ceiling ${spendReading(ceilingUsd)} per attempt, ${spendReading(groupSpendCeilingUsd({ spendCeilingUsd: ceilingUsd, reps: attempts }))}`;

	return groups === 1
		? `${perGroup} for the group of ${String(attempts)}`
		: `${perGroup} for each of the ${String(groups)} groups of ${String(attempts)}`;
}

function CorpusLine(): React.JSX.Element {
	const corpus = useQuery(corpusQuery);
	if (corpus.data === undefined) {
		return (
			<span
				className={corpus.isError ? "text-attention" : "text-muted-foreground"}
			>
				{corpus.isError ? "could not read the corpus" : "reading…"}
			</span>
		);
	}

	return corpus.data.digest === undefined ? (
		<span className="font-mono text-attention">
			<span aria-hidden="true">⚠ </span>
			digest withheld
		</span>
	) : (
		<span className="font-mono text-pale">
			{corpusVersionLabel(corpus.data.digest)}
			<span className="ml-2 text-12 text-muted-foreground">
				current linked corpus
			</span>
		</span>
	);
}

/**
 * The stored spend ceiling, edited in place: storing it changes the ceiling
 * every later launch and CLI run holds to, not just this launch.
 */
function SpendCeilingField({
	storedUsd,
	draft,
	onDraft,
}: {
	readonly storedUsd: number | undefined;
	readonly draft: string | undefined;
	readonly onDraft: (draft: string | undefined) => void;
}): React.JSX.Element {
	const queryClient = useQueryClient();
	const store = useMutation({
		mutationFn: putSpendCeiling,
		onSuccess: (reading) => {
			queryClient.setQueryData(launchSettingsQuery.queryKey, reading);
			onDraft(undefined);
		},
	});
	const entered = shownCeiling(draft, storedUsd);
	const usd = enteredCeilingUsd(entered);

	return (
		<section
			aria-label="Saved spending default"
			className="rounded-md border border-divider p-3"
		>
			<h3 className="text-14 font-medium">Saved spending default</h3>
			<p className="mt-1 text-12 text-secondary-foreground">
				Start uses the saved default; this dialog has no per-launch override.
			</p>
			<label
				htmlFor="launch-spend-ceiling"
				className="mt-3 block text-12 text-muted-foreground"
			>
				Default ceiling per attempt
			</label>
			<form
				className="mt-1 flex flex-wrap items-center gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (usd !== undefined) {
						store.mutate(usd);
					}
				}}
			>
				<AmountInput
					id="launch-spend-ceiling"
					value={entered}
					accessibleName="Default ceiling per attempt"
					onChange={onDraft}
				/>
				<Button
					type="submit"
					variant="outline"
					size="sm"
					disabled={usd === undefined || store.isPending}
				>
					Save default
				</Button>
				{storedUsd !== undefined && holdsUnstoredCeiling(draft, storedUsd) ? (
					<Button
						type="button"
						size="sm"
						variant="quiet"
						disabled={store.isPending}
						onClick={() => {
							onDraft(undefined);
						}}
					>
						Use saved default
					</Button>
				) : null}
			</form>
			<p className="mt-1 text-12 text-secondary-foreground">
				Saving changes the default for this launch and future browser launches
				and CLI runs.
			</p>
			{holdsUnstoredCeiling(draft, storedUsd) ? (
				<p className="mt-1 text-12 text-muted-foreground">
					Unsaved default change. Save the default or restore the saved value
					before starting.
				</p>
			) : null}
			{store.isError ? (
				<p role="alert" className="mt-1 text-14 text-attention">
					<span aria-hidden="true">⚠ </span>
					{store.error.message}
				</p>
			) : null}
		</section>
	);
}

function CasePicker({
	cases,
	selected,
	onSelect,
}: {
	readonly cases: readonly CaseListing[];
	readonly selected: string | undefined;
	readonly onSelect: (caseId: string) => void;
}): React.JSX.Element {
	return (
		<NativeSelect
			id="launch-case"
			value={selected ?? ""}
			onChange={(event) => {
				onSelect(event.target.value);
			}}
		>
			{cases.map((listed) =>
				listed.model === null ? (
					<option key={listed.id} value={listed.id} disabled>
						{`${listed.id} · declares no model`}
					</option>
				) : (
					<option key={listed.id} value={listed.id}>
						{`${listed.id} · ${listed.title}`}
					</option>
				),
			)}
		</NativeSelect>
	);
}

/** Why the picker offers fewer cases than are declared, if it does. */
function CaseListProblems({
	failure,
	listing,
}: {
	readonly failure: string | undefined;
	readonly listing:
		| {
				readonly unreadable: readonly {
					readonly id: string;
					readonly reason: string;
				}[];
		  }
		| undefined;
}): React.JSX.Element | null {
	if (failure !== undefined) {
		return (
			<p role="alert" className="text-14 text-attention">
				<span aria-hidden="true">⚠ </span>
				{failure}
			</p>
		);
	}
	const unreadable = listing?.unreadable ?? [];
	if (unreadable.length === 0) {
		return null;
	}

	return (
		<Notice
			message="These cases cannot be read, so they are not offered:"
			items={unreadable.map(({ id, reason }) => `${id}: ${reason}`)}
		/>
	);
}

function launchRequest(
	target: SettledTarget,
	caseId: string | undefined,
	attempts: LaunchAttempts,
): LaunchRequest | undefined {
	switch (target.kind) {
		case "case": {
			return caseId === undefined
				? undefined
				: { kind: "case", caseId, attempts };
		}
		case "replay": {
			return {
				kind: "replay",
				run: target.run,
				stage: target.stage,
				attempts,
			};
		}
		case "comparison": {
			return { kind: "comparison", armA: target.armA, armB: target.armB };
		}
		case "extension": {
			return {
				kind: "extension",
				comparison: target.comparison,
				attempts: target.attempts,
				statedUsd: target.usd,
			};
		}
		default: {
			return target satisfies never;
		}
	}
}

function dialogTitle(target: SettledTarget): string {
	switch (target.kind) {
		case "case": {
			return "Start a run";
		}
		case "replay": {
			return `Replay ${target.stage} from checkpoint`;
		}
		case "comparison": {
			return `Compare two attempts at ${target.stage}`;
		}
		case "extension": {
			return `Add ${plural(target.attempts, "attempt")} to each arm`;
		}
		default: {
			return target satisfies never;
		}
	}
}

function dialogDescription(target: SettledTarget): string {
	switch (target.kind) {
		case "case": {
			return "Runs the case against the current corpus under its declared model, and records each attempt separately.";
		}
		case "replay": {
			return `Replaying restores the checkpoint ${target.stage} starts from, runs ${target.stage} against the current corpus under the run's model, and records each attempt separately. Earlier stages are not re-run.`;
		}
		case "comparison": {
			return `Runs a control group of ${plural(target.reps, "attempt")} at ${target.stage}, against baseline's corpus without the one skill the arms differ in, under baseline's model, effort, judge and budget, then compares the control, baseline (before) and candidate (after). Baseline and candidate are not re-run.`;
		}
		case "extension": {
			return `Runs ${plural(target.attempts, "more attempt")} in the control, baseline (before) and candidate (after), each from the checkpoint its arm replayed and against its arm's corpus, then saves a comparison of every attempt each arm holds. The comparison it extends is kept as it was.`;
		}
		default: {
			return target satisfies never;
		}
	}
}

/** What the launch runs, read from the row it was started on. */
function TargetRows({
	target,
	cases,
	caseId,
	onSelectCase,
}: {
	readonly target: SettledTarget;
	readonly cases: readonly CaseListing[];
	readonly caseId: string | undefined;
	readonly onSelectCase: (caseId: string) => void;
}): React.JSX.Element {
	switch (target.kind) {
		case "case": {
			return (
				<>
					<dt className="text-muted-foreground">
						<label htmlFor="launch-case">Case</label>
					</dt>
					<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
						<CasePicker
							cases={cases}
							selected={caseId}
							onSelect={onSelectCase}
						/>
					</dd>
					<dt className="text-muted-foreground">Corpus</dt>
					<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
						<CorpusLine />
					</dd>
				</>
			);
		}
		case "replay": {
			return (
				<>
					<dt className="text-muted-foreground">Run</dt>
					<dd className="sm:col-span-3 font-mono min-w-0 wrap-anywhere">
						{target.run}
					</dd>
					<dt className="text-muted-foreground">Stage</dt>
					<dd className="sm:col-span-3 font-mono min-w-0 wrap-anywhere">
						{target.stage}
					</dd>
					<dt className="text-muted-foreground">Corpus</dt>
					<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
						<CorpusLine />
					</dd>
				</>
			);
		}
		case "comparison": {
			return (
				<>
					<dt className="text-muted-foreground">Baseline (before)</dt>
					<dd className="sm:col-span-3 min-w-0 font-mono break-all">
						{target.armA}
					</dd>
					<dt className="text-muted-foreground">Candidate (after)</dt>
					<dd className="sm:col-span-3 min-w-0 font-mono break-all">
						{target.armB}
					</dd>
					<dt className="text-muted-foreground">Run</dt>
					<dd className="sm:col-span-3 font-mono min-w-0 wrap-anywhere">
						{target.run}
					</dd>
					<dt className="text-muted-foreground">Stage</dt>
					<dd className="sm:col-span-3 font-mono min-w-0 wrap-anywhere">
						{target.stage}
					</dd>
					<dt className="text-muted-foreground">Control corpus</dt>
					<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
						baseline&apos;s corpus without the one skill that differs
					</dd>
				</>
			);
		}
		case "extension": {
			return (
				<>
					<dt className="text-muted-foreground">Comparison</dt>
					<dd className="sm:col-span-3 min-w-0 font-mono break-all">
						{target.comparison}
					</dd>
					<dt className="text-muted-foreground">Per arm</dt>
					<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
						{plural(target.attempts, "attempt")}
					</dd>
					<dt className="text-muted-foreground">Cost</dt>
					<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
						{`about $${target.usd.toFixed(2)}, at each arm's mean recorded cost per attempt`}
					</dd>
				</>
			);
		}
		default: {
			return target satisfies never;
		}
	}
}

/**
 * The groups a launch starts and how many attempts each runs, which each
 * group's ceiling bounds. An extension starts one group per arm.
 */
interface StartedGroups {
	readonly groups: number;
	readonly attempts: number;
}

function startedGroupsOf(
	target: SettledTarget,
	attempts: LaunchAttempts,
): StartedGroups {
	switch (target.kind) {
		case "case":
		case "replay": {
			return { groups: 1, attempts };
		}
		case "comparison": {
			return { groups: 1, attempts: target.reps };
		}
		case "extension": {
			return { groups: 3, attempts: target.attempts };
		}
		default: {
			return target satisfies never;
		}
	}
}

/** The case and attempts the form opens on. */
interface OpeningChoice {
	readonly caseId: string | undefined;
	readonly attempts: LaunchAttempts;
}

function openingChoice(target: SettledTarget): OpeningChoice {
	switch (target.kind) {
		case "case": {
			return { caseId: target.caseId, attempts: target.attempts ?? 1 };
		}
		case "replay": {
			return { caseId: undefined, attempts: target.attempts ?? 1 };
		}
		case "comparison":
		case "extension": {
			return { caseId: undefined, attempts: 1 };
		}
		default: {
			return target satisfies never;
		}
	}
}

function ReplayChoiceRows({
	runs,
	chosen,
	onChoose,
}: {
	readonly runs: readonly ReplayableRun[];
	readonly chosen: ReplayChoice;
	readonly onChoose: (choice: ReplayChoice) => void;
}): React.JSX.Element {
	const stages = runs.find(({ run }) => run === chosen.run)?.stages ?? [];

	return (
		<>
			<dt className="text-muted-foreground">
				<label htmlFor="launch-replay-run">Run</label>
			</dt>
			<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
				<NativeSelect
					id="launch-replay-run"
					value={chosen.run}
					onChange={(event) => {
						const picked = runs.find(({ run }) => run === event.target.value);
						if (picked !== undefined) {
							onChoose({ run: picked.run, stage: picked.openingStage });
						}
					}}
				>
					{runs.map(({ run, caseId }) => (
						<option key={run} value={run}>
							{caseId === undefined ? run : `${run} · ${caseId}`}
						</option>
					))}
				</NativeSelect>
			</dd>
			<dt className="text-muted-foreground">
				<label htmlFor="launch-replay-stage">Step</label>
			</dt>
			<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
				<NativeSelect
					id="launch-replay-stage"
					value={chosen.stage}
					onChange={(event) => {
						onChoose({ run: chosen.run, stage: event.target.value });
					}}
				>
					{stages.map((stage) => (
						<option key={stage} value={stage}>
							{stage}
						</option>
					))}
				</NativeSelect>
			</dd>
			<dt className="text-muted-foreground">Corpus</dt>
			<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
				<CorpusLine />
			</dd>
		</>
	);
}

function CaseConditions({
	listed,
}: {
	readonly listed: CaseListing | undefined;
}): React.JSX.Element {
	if (listed === undefined) {
		return (
			<p className="text-14 text-muted-foreground">
				Choose a readable case to inspect its launch conditions.
			</p>
		);
	}
	return (
		<section
			aria-label="Launch conditions"
			className="rounded-md border bg-muted px-3 py-2.5"
		>
			<h3 className="text-14 font-medium">{listed.title}</h3>
			<dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 text-14 sm:grid-cols-4">
				<dt className="text-muted-foreground">Workflow model</dt>
				<dd className="sm:col-span-3 font-mono min-w-0 wrap-anywhere">
					{listed.model ?? "No model declared"}
				</dd>
				<dt className="text-muted-foreground">Input</dt>
				<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
					{listed.kind === "session"
						? "Declared session prompt, fixture and transcript prefix, when provided."
						: "Declared task and product brief; the pipeline runs against its target repository."}
				</dd>
				{listed.kind === "pipeline" ? (
					<>
						<dt className="text-muted-foreground">Target</dt>
						<dd className="sm:col-span-3 font-mono wrap-anywhere min-w-0">
							{listed.target ?? "Target details unavailable"}
						</dd>
					</>
				) : null}
			</dl>
			<p className="mt-2 text-12 text-secondary-foreground">
				{listed.kind === "pipeline"
					? "Effort and Judge settings are resolved by the launcher; their effective values are not exposed by this API."
					: "Effort is resolved by the launcher; its effective value is not exposed by this API. This session is evaluated by its declared checks."}
			</p>
		</section>
	);
}

function ReplayConditions({
	target,
}: {
	readonly target: Extract<SettledTarget, { kind: "replay" }>;
}): React.JSX.Element {
	const source = useQuery(runRecordQuery(target.run));
	const pending = source.isPending ? "Reading source record…" : undefined;
	const step = source.data?.stages.find(({ stage }) => stage === target.stage);
	const checkpoint = step?.artifactsIn.entries.find(
		(entry) => entry.from === "upstream checkpoint",
	);
	let input = `The saved checkpoint ${target.stage} starts from; earlier stages are not run again.`;
	if (checkpoint?.from === "upstream checkpoint") {
		input = `${checkpoint.upstream} checkpoint`;
		if (checkpoint.checkpointShortId.state === "available") {
			input += ` · ${checkpoint.checkpointShortId.shortId}`;
		}
	}
	return (
		<section
			aria-label="Launch conditions"
			className="rounded-md border bg-muted px-3 py-2.5"
		>
			<h3 className="text-14 font-medium">Frozen input · current corpus</h3>
			<dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 text-14 sm:grid-cols-4">
				<dt className="text-muted-foreground">Case</dt>
				<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
					{source.data?.caseId ?? pending ?? "Source case unavailable"}
				</dd>
				<dt className="text-muted-foreground">Workflow model</dt>
				<dd className="sm:col-span-3 font-mono min-w-0 wrap-anywhere">
					{source.data?.identity.model ??
						pending ??
						"Source run's model; value unavailable"}
				</dd>
				<dt className="text-muted-foreground">Frozen input</dt>
				<dd className="sm:col-span-3 min-w-0 wrap-anywhere">{input}</dd>
			</dl>
			<p className="mt-2 text-12 text-secondary-foreground">
				Recorded source effort:{" "}
				{source.data?.identity.effort ?? pending ?? "not recorded"}. Replay
				effort and Judge settings are resolved at launch; they are not
				guaranteed to match the source.
			</p>
			{source.isError ? (
				<p className="mt-1 text-12 text-secondary-foreground">
					Source details could not be read. The launcher validates the saved
					checkpoint before starting.
				</p>
			) : null}
		</section>
	);
}

function LaunchConditions({
	target,
	cases,
	caseId,
}: {
	readonly target: SettledTarget;
	readonly cases: readonly CaseListing[];
	readonly caseId: string | undefined;
}): React.JSX.Element {
	switch (target.kind) {
		case "case": {
			return <CaseConditions listed={cases.find(({ id }) => id === caseId)} />;
		}
		case "replay": {
			return <ReplayConditions target={target} />;
		}
		case "comparison":
		case "extension": {
			return (
				<section
					aria-label="Launch conditions"
					className="rounded-md border bg-muted px-3 py-2.5 text-14 text-secondary-foreground"
				>
					Each new group uses its saved arm’s checkpoint, corpus, workflow
					model, effort and Judge settings. Their values are not exposed by this
					launch API. The stored spending ceiling still applies.
				</section>
			);
		}
		default: {
			return target satisfies never;
		}
	}
}

function LaunchForm({
	target,
	targetRows,
	onLaunched,
}: {
	readonly target: SettledTarget;
	/** Rows that choose the target in place of the rows naming it. */
	readonly targetRows?: React.ReactNode;
	readonly onLaunched: () => void;
}): React.JSX.Element {
	const queryClient = useQueryClient();
	const opening = openingChoice(target);
	const [attempts, setAttempts] = useState(opening.attempts);
	const [pickedCase, setPickedCase] = useState(opening.caseId);
	const [ceilingDraft, setCeilingDraft] = useState<string>();
	const settings = useQuery(launchSettingsQuery);
	const cases = useQuery({
		queryKey: LAUNCH_CASES_QUERY_KEY,
		queryFn: fetchCases,
		enabled: target.kind === "case",
	});
	const availableCases = cases.data?.cases ?? [];
	const launch = useMutation({
		mutationFn: postLaunch,
		onSuccess: async () => {
			onLaunched();
			await queryClient.invalidateQueries({
				queryKey: runHistoryQuery.queryKey,
			});
		},
	});

	const caseId =
		pickedCase ?? availableCases.find((listed) => listed.model !== null)?.id;
	const request = launchRequest(target, caseId, attempts);
	const started = startedGroupsOf(target, attempts);
	const ceilingUsd = settings.data?.spendCeilingUsd ?? undefined;
	const startable =
		ceilingUsd !== undefined &&
		!holdsUnstoredCeiling(ceilingDraft, ceilingUsd) &&
		request !== undefined &&
		!launch.isPending;

	return (
		<>
			<header className="flex shrink-0 items-center gap-3 border-b border-divider px-6 py-4">
				<DialogTitle>{dialogTitle(target)}</DialogTitle>
				<span className="ml-auto">
					<DialogClose asChild>
						<Button variant="outline" size="sm" aria-label="Close">
							Esc
						</Button>
					</DialogClose>
				</span>
			</header>

			<div className="flex min-h-0 min-w-0 flex-col gap-5 overflow-y-auto px-6 py-5">
				<dl className="grid grid-cols-1 items-center gap-x-3 gap-y-2 text-14 sm:grid-cols-4">
					{targetRows ?? (
						<TargetRows
							target={target}
							cases={availableCases}
							caseId={caseId}
							onSelectCase={setPickedCase}
						/>
					)}
					<dt className="text-muted-foreground">Launch ceiling</dt>
					<dd className="sm:col-span-3 min-w-0 wrap-anywhere">
						{launchBudgetReading(ceilingUsd, settings.isPending)}
					</dd>
					{target.kind === "comparison" ||
					target.kind === "extension" ? null : (
						<>
							<dt className="text-muted-foreground">Attempts</dt>
							<dd
								role="group"
								aria-label="Attempts"
								className="min-w-0 sm:col-span-3"
							>
								<ActionGroup>
									{LAUNCH_ATTEMPTS.map((count) => (
										<FilterPill
											key={count}
											pressed={count === attempts}
											onPress={() => {
												setAttempts(count);
											}}
										>
											{`×${String(count)}`}
										</FilterPill>
									))}
								</ActionGroup>
							</dd>
						</>
					)}
				</dl>

				<LaunchConditions
					target={target}
					cases={availableCases}
					caseId={caseId}
				/>
				<SpendCeilingField
					storedUsd={ceilingUsd}
					draft={ceilingDraft}
					onDraft={setCeilingDraft}
				/>
				<p className="text-12 text-secondary-foreground">
					Ceilings bound spending; they are not projected charges.
				</p>
				<CaseListProblems failure={cases.error?.message} listing={cases.data} />
				{settings.data !== undefined && ceilingUsd === undefined ? (
					<Notice
						message="No spend ceiling is saved. Save a default above before starting, or set it in a terminal with:"
						items={[settings.data.setCommand]}
					/>
				) : null}
				{settings.isError ? (
					<p role="alert" className="text-14 text-attention">
						<span aria-hidden="true">⚠ </span>
						{settings.error.message}
					</p>
				) : null}

				<DialogDescription>{dialogDescription(target)}</DialogDescription>

				{launch.isError ? (
					<p role="alert" className="text-14 text-attention">
						<span aria-hidden="true">⚠ </span>
						{launch.error.message}
					</p>
				) : null}
			</div>

			<footer className="flex shrink-0 flex-wrap items-center gap-2.5 border-t border-divider px-4 py-3">
				{ceilingUsd === undefined ? null : (
					<span className="text-12 text-muted-foreground">
						{ceilingReading(ceilingUsd, started)}
					</span>
				)}
				<ActionGroup className="ml-auto justify-end">
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					<Button
						variant="primary"
						disabled={!startable}
						onClick={() => {
							if (request !== undefined) {
								launch.mutate(request);
							}
						}}
					>
						{`Start · ${attemptsLabel(started.groups * started.attempts)}`}
					</Button>
				</ActionGroup>
			</footer>
		</>
	);
}

/**
 * A replay whose run and step the operator picks. A choice whose run a later
 * read no longer offers falls back to the opening one, so the form never
 * starts a run its Run field does not show.
 */
function ChosenReplayForm({
	runs,
	opensOn,
	onLaunched,
}: {
	readonly runs: readonly ReplayableRun[];
	readonly opensOn: ReplayChoice;
	readonly onLaunched: () => void;
}): React.JSX.Element {
	const [picked, setPicked] = useState(opensOn);
	const chosen = runs.some(({ run }) => run === picked.run) ? picked : opensOn;

	return (
		<LaunchForm
			target={{ kind: "replay", run: chosen.run, stage: chosen.stage }}
			targetRows={
				<ReplayChoiceRows runs={runs} chosen={chosen} onChoose={setPicked} />
			}
			onLaunched={onLaunched}
		/>
	);
}

/**
 * The run-launch dialog (SPEC.md:355): starts a declared case, or replays one
 * recorded stage, as one run or a group of attempts under the stored spend
 * ceiling. The spend field edits the stored ceiling itself, not a per-launch
 * override, so the server and the CLI hold every later run to what it stores.
 */
export function LaunchDialog({
	target,
	shortcut,
	...opener
}: {
	readonly target: LaunchTarget;
	/** The key that opens the dialog from anywhere on the page, shown on the trigger. */
	readonly shortcut?: string;
} & (
	| { readonly triggerLabel: string; readonly trigger?: undefined }
	| { readonly trigger: React.ReactNode; readonly triggerLabel?: undefined }
)): React.JSX.Element {
	const [open, setOpen] = useState(false);
	const close = (): void => {
		setOpen(false);
	};
	useKeyShortcut(shortcut, () => {
		setOpen(true);
	});

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{opener.trigger ?? (
					<Button
						variant={target.kind === "case" ? "primary" : "outline"}
						aria-keyshortcuts={shortcut}
					>
						{opener.triggerLabel}
						{shortcut === undefined ? null : <KeyHint letter={shortcut} />}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent width="wide">
				{target.kind === "chosen-replay" ? (
					<ChosenReplayForm
						runs={target.runs}
						opensOn={target.opensOn}
						onLaunched={close}
					/>
				) : (
					<LaunchForm target={target} onLaunched={close} />
				)}
			</DialogContent>
		</Dialog>
	);
}
