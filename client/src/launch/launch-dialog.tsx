import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { InferResponseType } from "hono/client";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import type { LaunchAttempts } from "#benchmark/launch-attempts";
import { LAUNCH_ATTEMPTS } from "#benchmark/launch-attempts";
import { groupSpendCeilingUsd } from "#benchmark/spend-ceiling";
import { launchClient } from "#client/api-client";
import { plural } from "#client/plural";
import { corpusQuery } from "#client/corpus/corpus-query";
import { runHistoryQuery } from "#client/run-history/run-history-query";
import { spendReading } from "#client/run-history/run-progress";
import { FilterPill } from "#client/system/components/filter-pill";
import { Notice } from "#client/system/components/notice";
import { Button } from "#client/system/ui/button";
import type { LaunchRequest } from "#server/launches";
import { LaunchRefusedError, postLaunch } from "./post-launch";
import { launchSettingsQuery } from "./settings-query";
import { enteredCeilingUsd, putSpendCeiling } from "./spend-ceiling-entry";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "#client/system/ui/dialog";

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
			readonly kind: "comparison";
			readonly armA: string;
			readonly armB: string;
			readonly run: string;
			readonly stage: string;
			/** Arm A's group size, which the baseline group copies. */
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

type CasesResponse = InferResponseType<typeof launchClient.api.cases.$get>;

type CaseListing = CasesResponse["cases"][number];

/** An edit that differs from the stored ceiling holds the launch until stored. */
function holdsUnstoredCeiling(
	draft: string | undefined,
	storedUsd: number | undefined,
): boolean {
	return draft !== undefined && draft !== shownCeiling(undefined, storedUsd);
}

/** What the field shows: the operator's edit, or the stored ceiling as stored. */
function shownCeiling(
	draft: string | undefined,
	storedUsd: number | undefined,
): string {
	return draft ?? (storedUsd === undefined ? "" : String(storedUsd));
}

async function fetchCases(): Promise<CasesResponse> {
	const response = await launchClient.api.cases.$get();
	if (!response.ok) {
		throw new LaunchRefusedError(await response.text());
	}

	return response.json();
}

function attemptsLabel(attempts: number): string {
	return attempts === 1 ? "1 attempt" : `${String(attempts)} attempts`;
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
	if (attempts === 1) {
		return `Ceiling ${spendReading(ceilingUsd)}`;
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
			<span className="text-muted-foreground">
				{corpus.isError ? "could not read the corpus" : "reading…"}
			</span>
		);
	}

	return corpus.data.digest === undefined ? (
		<span className="font-mono text-pale">
			<span aria-hidden="true">⚠ </span>
			digest withheld
		</span>
	) : (
		<span className="font-mono text-pale">
			{corpusVersionLabel(corpus.data.digest)}
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
		<>
			<form
				className="flex items-center gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (usd !== undefined) {
						store.mutate(usd);
					}
				}}
			>
				<span className="flex h-9 items-center gap-1.5 rounded-md border border-strong bg-background px-2">
					<span aria-hidden="true" className="text-xs text-muted-foreground">
						USD
					</span>
					<input
						id="launch-spend-ceiling"
						value={entered}
						inputMode="decimal"
						onChange={(event) => {
							onDraft(event.target.value);
						}}
						className="w-20 bg-transparent font-mono text-sm"
					/>
				</span>
				<Button
					type="submit"
					variant="outline"
					size="sm"
					disabled={usd === undefined || store.isPending}
				>
					Store ceiling
				</Button>
			</form>
			{holdsUnstoredCeiling(draft, storedUsd) ? (
				<p className="mt-1 text-xs text-dim">
					Store this ceiling to start, or the launch holds to the stored one.
				</p>
			) : null}
			{store.isError ? (
				<p role="alert" className="mt-1 text-sm text-secondary-foreground">
					<span aria-hidden="true">⚠ </span>
					{store.error.message}
				</p>
			) : null}
		</>
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
		<select
			id="launch-case"
			value={selected ?? ""}
			onChange={(event) => {
				onSelect(event.target.value);
			}}
			className="h-9 w-full min-w-0 rounded-md border border-strong bg-background px-2 font-mono text-sm"
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
		</select>
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
			<p role="alert" className="text-sm text-secondary-foreground">
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
	target: LaunchTarget,
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

function dialogTitle(target: LaunchTarget): string {
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

function dialogDescription(target: LaunchTarget): string {
	switch (target.kind) {
		case "case": {
			return "Runs the case against the current corpus under its declared model, and records each attempt separately.";
		}
		case "replay": {
			return `Replaying restores the checkpoint ${target.stage} starts from, runs ${target.stage} against the current corpus under the run's model, and records each attempt separately. Earlier stages are not re-run.`;
		}
		case "comparison": {
			return `Runs a baseline group of ${plural(target.reps, "attempt")} at ${target.stage}, against arm A's corpus without the one skill the arms differ in, under arm A's model, effort, judge and budget, then compares the baseline, arm A and arm B. Arms A and B are not re-run.`;
		}
		case "extension": {
			return `Runs ${plural(target.attempts, "more attempt")} in the baseline, arm A and arm B, each from the checkpoint its arm replayed and against its arm's corpus, then saves a comparison of every attempt each arm holds. The comparison it extends is kept as it was.`;
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
	readonly target: LaunchTarget;
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
					<dd className="col-span-3 min-w-0">
						<CasePicker
							cases={cases}
							selected={caseId}
							onSelect={onSelectCase}
						/>
					</dd>
					<dt className="text-muted-foreground">Corpus</dt>
					<dd className="col-span-3">
						<CorpusLine />
					</dd>
				</>
			);
		}
		case "replay": {
			return (
				<>
					<dt className="text-muted-foreground">Run</dt>
					<dd className="col-span-3 font-mono">{target.run}</dd>
					<dt className="text-muted-foreground">Stage</dt>
					<dd className="col-span-3 font-mono">{target.stage}</dd>
					<dt className="text-muted-foreground">Corpus</dt>
					<dd className="col-span-3">
						<CorpusLine />
					</dd>
				</>
			);
		}
		case "comparison": {
			return (
				<>
					<dt className="text-muted-foreground">Arm A</dt>
					<dd className="col-span-3 min-w-0 font-mono break-all">
						{target.armA}
					</dd>
					<dt className="text-muted-foreground">Arm B</dt>
					<dd className="col-span-3 min-w-0 font-mono break-all">
						{target.armB}
					</dd>
					<dt className="text-muted-foreground">Run</dt>
					<dd className="col-span-3 font-mono">{target.run}</dd>
					<dt className="text-muted-foreground">Stage</dt>
					<dd className="col-span-3 font-mono">{target.stage}</dd>
					<dt className="text-muted-foreground">Baseline corpus</dt>
					<dd className="col-span-3">
						arm A&apos;s corpus without the one skill that differs
					</dd>
				</>
			);
		}
		case "extension": {
			return (
				<>
					<dt className="text-muted-foreground">Comparison</dt>
					<dd className="col-span-3 min-w-0 font-mono break-all">
						{target.comparison}
					</dd>
					<dt className="text-muted-foreground">Per arm</dt>
					<dd className="col-span-3">{plural(target.attempts, "attempt")}</dd>
					<dt className="text-muted-foreground">Cost</dt>
					<dd className="col-span-3">
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
	target: LaunchTarget,
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

function openingChoice(target: LaunchTarget): OpeningChoice {
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

function LaunchForm({
	target,
	onLaunched,
}: {
	readonly target: LaunchTarget;
	readonly onLaunched: () => void;
}): React.JSX.Element {
	const queryClient = useQueryClient();
	const opensOn = openingChoice(target);
	const [attempts, setAttempts] = useState(opensOn.attempts);
	const [pickedCase, setPickedCase] = useState(opensOn.caseId);
	const [ceilingDraft, setCeilingDraft] = useState<string>();
	const settings = useQuery(launchSettingsQuery);
	const cases = useQuery({
		queryKey: LAUNCH_CASES_QUERY_KEY,
		queryFn: fetchCases,
		enabled: target.kind === "case",
	});
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
		pickedCase ?? cases.data?.cases.find((listed) => listed.model !== null)?.id;
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
			<header className="flex items-center gap-3 border-b border-strong px-4 py-3">
				<DialogTitle>{dialogTitle(target)}</DialogTitle>
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
					<TargetRows
						target={target}
						cases={cases.data?.cases ?? []}
						caseId={caseId}
						onSelectCase={setPickedCase}
					/>
					<dt className="text-muted-foreground">
						<label htmlFor="launch-spend-ceiling">Spend ceiling</label>
					</dt>
					<dd className="col-span-3">
						<SpendCeilingField
							storedUsd={ceilingUsd}
							draft={ceilingDraft}
							onDraft={setCeilingDraft}
						/>
					</dd>
					{target.kind === "comparison" ||
					target.kind === "extension" ? null : (
						<>
							<dt className="text-muted-foreground">Attempts</dt>
							<dd
								role="group"
								aria-label="Attempts"
								className="col-span-3 flex gap-1.5"
							>
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
							</dd>
						</>
					)}
				</dl>

				<CaseListProblems failure={cases.error?.message} listing={cases.data} />
				{settings.data !== undefined && ceilingUsd === undefined ? (
					<Notice
						message="No spend ceiling is stored, and nothing starts without one. Store one above, or set it in a terminal with:"
						items={[settings.data.setCommand]}
					/>
				) : null}
				{settings.isError ? (
					<p role="alert" className="text-sm text-secondary-foreground">
						<span aria-hidden="true">⚠ </span>
						{settings.error.message}
					</p>
				) : null}

				<DialogDescription>{dialogDescription(target)}</DialogDescription>

				{launch.isError ? (
					<p role="alert" className="text-sm text-secondary-foreground">
						<span aria-hidden="true">⚠ </span>
						{launch.error.message}
					</p>
				) : null}
			</div>

			<footer className="flex flex-wrap items-center gap-2.5 border-t border-strong px-4 py-3">
				{ceilingUsd === undefined ? null : (
					<span className="text-xs text-dim">
						{ceilingReading(ceilingUsd, started)}
					</span>
				)}
				<span className="ml-auto flex gap-2">
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					<Button
						disabled={!startable}
						onClick={() => {
							if (request !== undefined) {
								launch.mutate(request);
							}
						}}
					>
						{`Start · ${attemptsLabel(started.groups * started.attempts)}`}
					</Button>
				</span>
			</footer>
		</>
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
	...opener
}: {
	readonly target: LaunchTarget;
} & (
	| { readonly triggerLabel: string; readonly trigger?: undefined }
	| { readonly trigger: React.ReactNode; readonly triggerLabel?: undefined }
)): React.JSX.Element {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{opener.trigger ?? (
					<Button variant="outline">{opener.triggerLabel}</Button>
				)}
			</DialogTrigger>
			<DialogContent>
				<LaunchForm
					target={target}
					onLaunched={() => {
						setOpen(false);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
