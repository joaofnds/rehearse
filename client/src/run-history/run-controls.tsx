import { useMutation, useQueryClient } from "@tanstack/react-query";
import { launchClient } from "#client/api-client";
import { Button } from "#client/system/ui/button";
import { runHistoryQuery } from "./run-history-query";

class ControlRefusedError extends Error {
	public override name = "ControlRefusedError";
}

/**
 * A refusal the routes declare arrives as `{ error }`. Anything else, the
 * request guard's plain-text 403 included, is shown as the server sent it.
 */
async function stopLaunch(id: string): Promise<void> {
	const response = await launchClient.api.launches[":id"].stop.$post({
		param: { id },
	});
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
	const response = await launchClient.api.runs[":run"].pause.$post({
		param: { run },
	});
	if (response.ok) {
		return;
	}
	if (response.status === 404 || response.status === 409) {
		const refused = await response.json();
		throw new ControlRefusedError(refused.error);
	}
	throw new ControlRefusedError(await response.text());
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
	const queryClient = useQueryClient();
	const refresh = async (): Promise<void> => {
		await queryClient.invalidateQueries({
			queryKey: runHistoryQuery.queryKey,
		});
	};
	const stop = useMutation({ mutationFn: stopLaunch, onSuccess: refresh });
	const pause = useMutation({ mutationFn: pauseRun, onSuccess: refresh });
	const error = stop.error ?? pause.error;

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
			{pause.isSuccess ? (
				<span className="text-xs text-dim">
					pause requested · ends after this step is judged
				</span>
			) : null}
			{stop.isSuccess ? (
				<span className="text-xs text-dim">stop requested</span>
			) : null}
			{error === null ? null : (
				<p role="alert" className="text-xs text-secondary-foreground">
					{error.message}
				</p>
			)}
		</span>
	);
}
