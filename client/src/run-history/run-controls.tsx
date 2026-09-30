import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { launchClient } from "#client/api-client";
import { Button } from "#client/system/ui/button";
import { runHistoryQuery } from "./run-history-query";

class ControlRefusedError extends Error {
	public override name = "ControlRefusedError";
}

/** The request guard refuses a write that does not say it is JSON. */
const AS_JSON = { headers: { "content-type": "application/json" } };

/**
 * A refusal the routes declare arrives as `{ error }`. Anything else, the
 * request guard's plain-text 403 included, is shown as the server sent it.
 */
async function stopLaunch(id: string): Promise<void> {
	const response = await launchClient.api.launches[":id"].stop.$post(
		{ param: { id } },
		AS_JSON,
	);
	if (response.ok) {
		return;
	}
	if (response.status === 404 || response.status === 409) {
		const refused = await response.json();
		throw new ControlRefusedError(refused.error);
	}
	throw new ControlRefusedError(await response.text());
}

/** Refused the same way as a stop. */
async function pauseRun(run: string): Promise<void> {
	const response = await launchClient.api.runs[":run"].pause.$post(
		{ param: { run } },
		AS_JSON,
	);
	if (response.ok) {
		return;
	}
	if (response.status === 404 || response.status === 409) {
		const refused = await response.json();
		throw new ControlRefusedError(refused.error);
	}
	throw new ControlRefusedError(await response.text());
}

function useRefreshHistory(): () => Promise<void> {
	const queryClient = useQueryClient();

	return async () => {
		await queryClient.invalidateQueries({
			queryKey: runHistoryQuery.queryKey,
		});
	};
}

/** Stops a launch by its id, then reads the run history again. */
export function useStopLaunch(): UseMutationResult<void, Error, string> {
	const refresh = useRefreshHistory();

	return useMutation({ mutationFn: stopLaunch, onSuccess: refresh });
}

/** Pauses a pipeline run after the step in flight, then reads the run history again. */
export function usePauseRun(): UseMutationResult<void, Error, string> {
	const refresh = useRefreshHistory();

	return useMutation({ mutationFn: pauseRun, onSuccess: refresh });
}

/**
 * Stop reaches a run only through the launch that started it. Whether a run
 * started from a terminal should be stoppable from the browser is doc-186
 * Decision 9, unsettled, so until it is answered its Stop is disabled and
 * names why.
 */
export const NO_LAUNCH_REASON =
	"Started outside the browser, so it stops only where it was started";

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
				<span className="text-11 text-dim">
					pause requested · ends after this step is judged
				</span>
			) : null}
			{stopRequested ? (
				<span className="text-11 text-dim">stop requested</span>
			) : null}
			{refusal === undefined ? null : (
				<p role="alert" className="text-11 text-secondary-foreground">
					{refusal}
				</p>
			)}
		</>
	);
}

/**
 * Stop reaches a run only through the launch that started it, since the
 * server signals the process it recorded; a run started from a terminal has
 * no launch, so it offers Pause alone. Pause is a pipeline run's, keyed by
 * the run, and a launch with no record yet has no run to key it by.
 */
export function RunControls({
	launchId,
	run,
}: {
	readonly launchId: string | undefined;
	readonly run: string | undefined;
}): React.JSX.Element {
	const stop = useStopLaunch();
	const pause = usePauseRun();
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
				{launchId === undefined ? null : (
					<Button
						disabled={stop.isPending || stop.isSuccess}
						onClick={() => {
							stop.mutate(launchId);
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
