import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { launchClient } from "#client/api-client";
import { refusalReason } from "#client/refusal-reason";
import { STATUS_VOCABULARY } from "#client/system/components/status";
import { Button } from "#client/system/ui/button";
import { runHistoryQuery } from "./run-history-query";

class ControlRefusedError extends Error {
	public override name = "ControlRefusedError";
}

/**
 * A browser launch stops through its record, which notes the stop. A pipeline
 * run started anywhere else stops through the pid its target claim records.
 */
export type StopTarget =
	| { readonly kind: "launch"; readonly id: string }
	| { readonly kind: "run"; readonly run: string };

export function stopTargetOf(
	launchId: string | undefined,
	run: string,
): StopTarget {
	return launchId === undefined
		? { kind: "run", run }
		: { kind: "launch", id: launchId };
}

async function requestStop(target: StopTarget): Promise<void> {
	const response =
		target.kind === "launch"
			? await launchClient.api.launches[":id"].stop.$post({
					param: { id: target.id },
				})
			: await launchClient.api.runs[":run"].stop.$post({
					param: { run: target.run },
				});
	if (!response.ok) {
		throw new ControlRefusedError(await refusalReason(response));
	}
}

/** Refused the same way as a stop. */
async function pauseRun(run: string): Promise<void> {
	const response = await launchClient.api.runs[":run"].pause.$post({
		param: { run },
	});
	if (!response.ok) {
		throw new ControlRefusedError(await refusalReason(response));
	}
}

function useRefreshHistory(): () => Promise<void> {
	const queryClient = useQueryClient();

	return async () => {
		await queryClient.invalidateQueries({
			queryKey: runHistoryQuery.queryKey,
		});
	};
}

/** Stops a launch or a run, then reads the run history again. */
export function useStop(): UseMutationResult<void, Error, StopTarget> {
	const refresh = useRefreshHistory();

	return useMutation({ mutationFn: requestStop, onSuccess: refresh });
}

/** Pauses a pipeline run after the step in flight, then reads the run history again. */
export function usePauseRun(): UseMutationResult<void, Error, string> {
	const refresh = useRefreshHistory();

	return useMutation({ mutationFn: pauseRun, onSuccess: refresh });
}

/**
 * What the operator asked of a run in flight, acknowledged once the server
 * takes it, and the server's refusal when it does not.
 */
export function ControlRequests({
	pauseRequested,
	stopRequested,
	refusal,
}: {
	readonly pauseRequested: boolean;
	readonly stopRequested: boolean;
	readonly refusal: string | undefined;
}): React.JSX.Element {
	return (
		<>
			{pauseRequested ? (
				<span className="text-12 text-dim">
					<span aria-hidden="true">{STATUS_VOCABULARY.paused.glyph} </span>
					pause requested · ends after this step is judged
				</span>
			) : null}
			{stopRequested ? (
				<span className="text-12 text-dim">
					<span aria-hidden="true">{STATUS_VOCABULARY.stopped.glyph} </span>
					stop requested
				</span>
			) : null}
			{refusal === undefined ? null : (
				<p role="alert" className="text-12 text-attention">
					<span aria-hidden="true">⚠ </span>
					{refusal}
				</p>
			)}
		</>
	);
}

function rowStopTarget(
	launchId: string | undefined,
	run: string | undefined,
): StopTarget | undefined {
	if (launchId !== undefined) {
		return { kind: "launch", id: launchId };
	}

	return run === undefined ? undefined : { kind: "run", run };
}

/**
 * Stop reaches a launch through its record and a pipeline run started from a
 * terminal through the run, so a row with neither, such as a session attempt
 * started from a terminal, offers no Stop. Pause is a pipeline run's, keyed by
 * the run, and a launch with no record yet has no run to key it by.
 */
export function RunControls({
	launchId,
	run,
}: {
	readonly launchId: string | undefined;
	readonly run: string | undefined;
}): React.JSX.Element {
	const stop = useStop();
	const pause = usePauseRun();
	const target = rowStopTarget(launchId, run);
	return (
		<span className="flex flex-col items-start gap-1.5">
			<span className="flex flex-wrap gap-2">
				{run === undefined ? null : (
					<Button
						variant="outline"
						disabled={pause.isPending || pause.isSuccess}
						onClick={() => {
							pause.mutate(run);
						}}
					>
						Pause after this step
					</Button>
				)}
				{target === undefined ? null : (
					<Button
						variant="destructive"
						disabled={stop.isPending || stop.isSuccess}
						onClick={() => {
							stop.mutate(target);
						}}
					>
						Stop &amp; restore repo
					</Button>
				)}
			</span>
			<ControlRequests
				pauseRequested={pause.isSuccess}
				stopRequested={stop.isSuccess}
				refusal={(stop.error ?? pause.error)?.message}
			/>
		</span>
	);
}
