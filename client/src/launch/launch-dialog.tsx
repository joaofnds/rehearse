import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { InferResponseType } from "hono/client";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import type { LaunchAttempts } from "#benchmark/launch-attempts";
import { LAUNCH_ATTEMPTS } from "#benchmark/launch-attempts";
import { groupSpendCeilingUsd } from "#benchmark/spend-ceiling";
import { launchClient } from "#client/api-client";
import { corpusQuery } from "#client/corpus/corpus-query";
import { runHistoryQuery } from "#client/run-history/run-history-query";
import { spendReading } from "#client/run-history/run-progress";
import { FilterPill } from "#client/system/components/filter-pill";
import { Notice } from "#client/system/components/notice";
import { Button } from "#client/system/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "#client/system/ui/dialog";
import type { LaunchRequest } from "#server/launches";

export type LaunchTarget =
	| { readonly kind: "case" }
	| { readonly kind: "replay"; readonly run: string; readonly stage: string };

type CaseListing = InferResponseType<
	typeof launchClient.api.cases.$get
>["cases"][number];

class LaunchRefusedError extends Error {
	public override name = "LaunchRefusedError";
}

/**
 * A refusal the launch routes declare arrives as `{ error }`. Anything else,
 * the request guard's plain-text 403 included, is shown as the server sent it.
 */
async function postLaunch(request: LaunchRequest): Promise<void> {
	const response = await launchClient.api.launches.$post({ json: request });
	if (response.ok) {
		return;
	}
	if (
		response.status === 400 ||
		response.status === 404 ||
		response.status === 409
	) {
		const refusal = await response.json();
		throw new LaunchRefusedError(refusal.error);
	}
	throw new LaunchRefusedError(await response.text());
}

async function fetchSettings(): Promise<
	InferResponseType<typeof launchClient.api.settings.$get, 200>
> {
	const response = await launchClient.api.settings.$get();
	if (response.status === 409) {
		const refusal = await response.json();
		throw new LaunchRefusedError(refusal.error);
	}
	if (!response.ok) {
		throw new LaunchRefusedError(await response.text());
	}

	return response.json();
}

async function fetchCases(): Promise<readonly CaseListing[]> {
	const response = await launchClient.api.cases.$get();
	const listing = await response.json();

	return listing.cases;
}

function attemptsLabel(attempts: LaunchAttempts): string {
	return attempts === 1 ? "1 attempt" : `${String(attempts)} attempts`;
}

/**
 * A group's attempts each run under the stored ceiling and all of them
 * together under the group ceiling. A call already in flight when the ceiling
 * is reached still lands, which is why the ceiling can be overrun.
 */
function ceilingReading(ceilingUsd: number, attempts: LaunchAttempts): string {
	const holds =
		attempts === 1
			? `Ceiling ${spendReading(ceilingUsd)}`
			: `Ceiling ${spendReading(ceilingUsd)} per attempt, ${spendReading(groupSpendCeilingUsd({ spendCeilingUsd: ceilingUsd, reps: attempts }))} for the group of ${String(attempts)}`;

	return `${holds} · stops mid-step if reached, and can be overrun by the calls in flight`;
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
			className="h-9 rounded-md border border-strong bg-background px-2 font-mono text-sm"
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

function launchRequest(
	target: LaunchTarget,
	caseId: string | undefined,
	attempts: LaunchAttempts,
): LaunchRequest | undefined {
	if (target.kind === "replay") {
		return {
			kind: "replay",
			run: target.run,
			stage: target.stage,
			attempts,
		};
	}

	return caseId === undefined ? undefined : { kind: "case", caseId, attempts };
}

function LaunchForm({
	target,
	onLaunched,
}: {
	readonly target: LaunchTarget;
	readonly onLaunched: () => void;
}): React.JSX.Element {
	const queryClient = useQueryClient();
	const [attempts, setAttempts] = useState<LaunchAttempts>(1);
	const [pickedCase, setPickedCase] = useState<string>();
	const settings = useQuery({
		queryKey: ["launch-settings"],
		queryFn: fetchSettings,
	});
	const cases = useQuery({
		queryKey: ["launch-cases"],
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
		pickedCase ?? cases.data?.find((listed) => listed.model !== null)?.id;
	const request = launchRequest(target, caseId, attempts);
	const ceilingUsd = settings.data?.spendCeilingUsd ?? undefined;
	const startable =
		ceilingUsd !== undefined && request !== undefined && !launch.isPending;

	return (
		<>
			<header className="flex items-center gap-3 border-b border-strong px-4 py-3">
				<DialogTitle>
					{target.kind === "case"
						? "Start a run"
						: `Replay ${target.stage} from checkpoint`}
				</DialogTitle>
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
					{target.kind === "case" ? (
						<>
							<dt className="text-muted-foreground">
								<label htmlFor="launch-case">Case</label>
							</dt>
							<dd className="col-span-3">
								<CasePicker
									cases={cases.data ?? []}
									selected={caseId}
									onSelect={setPickedCase}
								/>
							</dd>
						</>
					) : (
						<>
							<dt className="text-muted-foreground">Run</dt>
							<dd className="col-span-3 font-mono">{target.run}</dd>
							<dt className="text-muted-foreground">Stage</dt>
							<dd className="col-span-3 font-mono">{target.stage}</dd>
						</>
					)}
					<dt className="text-muted-foreground">Corpus</dt>
					<dd className="col-span-3">
						<CorpusLine />
					</dd>
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
				</dl>

				{settings.data !== undefined && ceilingUsd === undefined ? (
					<Notice
						message="No spend ceiling is stored, and nothing starts without one. Set it in a terminal with:"
						items={[settings.data.setCommand]}
					/>
				) : null}
				{settings.isError ? (
					<p role="alert" className="text-sm text-secondary-foreground">
						<span aria-hidden="true">⚠ </span>
						{settings.error.message}
					</p>
				) : null}

				<DialogDescription>
					{target.kind === "case"
						? "Runs the case against the current corpus under its declared model, and records each attempt separately."
						: `Replaying restores the checkpoint ${target.stage} starts from, runs ${target.stage} against the current corpus under the run's model, and records each attempt separately. Earlier stages are not re-run.`}
				</DialogDescription>

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
						{ceilingReading(ceilingUsd, attempts)}
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
						{`Start · ${attemptsLabel(attempts)}`}
					</Button>
				</span>
			</footer>
		</>
	);
}

/**
 * The run-launch dialog (SPEC.md:355): starts a declared case, or replays one
 * recorded stage, as one run or a group of attempts under the stored spend
 * ceiling. The ceiling is shown, not edited, because the server launches
 * under the stored one; changing it is `rehearse settings` until ACT-269.4
 * gives it a screen.
 */
export function LaunchDialog({
	target,
	triggerLabel,
}: {
	readonly target: LaunchTarget;
	readonly triggerLabel: string;
}): React.JSX.Element {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">{triggerLabel}</Button>
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
