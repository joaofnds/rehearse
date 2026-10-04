import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postLaunch } from "#client/launch/post-launch";
import { runHistoryQuery } from "#client/run-history/run-history-query";
import { spendReading } from "#client/run-history/run-progress";
import { Button } from "#client/system/ui/button";
import type { AnalysisReadingResponse } from "./analysis-query";
import { analysesQuery } from "./analysis-query";

export const ANALYSIS_IN_FLIGHT = "An analysis of this run is in flight.";

/** The words a request states before the click: the call and its cap. */
export function requestWords(
	request: AnalysisReadingResponse["request"],
): string | undefined {
	return request.capUsd === null
		? undefined
		: `A request makes one ${request.model} call that can spend at most ${spendReading(request.capUsd)}.`;
}

/** Why a request cannot be made now, or null when it can. */
function refusalOf(
	request: AnalysisReadingResponse["request"],
	inFlight: boolean,
): string | null {
	if (request.capUsd === null) {
		return request.refusal;
	}

	return inFlight ? ANALYSIS_IN_FLIGHT : null;
}

/**
 * Requests one culprit analysis of `run`, stating the cap it posts on the
 * button itself: the server refuses a stated figure other than its cap, so
 * the click is the operator's agreement to that figure.
 */
export function RequestAnalysisButton({
	run,
	request,
	inFlight,
	label,
}: {
	readonly run: string;
	readonly request: AnalysisReadingResponse["request"];
	readonly inFlight: boolean;
	readonly label: string;
}): React.JSX.Element {
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: postLaunch,
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: runHistoryQuery.queryKey }),
				queryClient.invalidateQueries({
					queryKey: analysesQuery(run).queryKey,
				}),
			]);
		},
	});
	const { capUsd } = request;
	const refused = refusalOf(request, inFlight);

	return (
		<span className="flex flex-col gap-1.5">
			{capUsd === null || refused !== null ? (
				<Button variant="outline" size="compact" aria-disabled="true">
					{label}
				</Button>
			) : (
				<Button
					variant="outline"
					size="compact"
					disabled={mutation.isPending}
					onClick={() => {
						mutation.mutate({ kind: "analysis", run, statedUsd: capUsd });
					}}
				>
					{`${label} · at most ${spendReading(capUsd)}`}
				</Button>
			)}
			{refused === null ? null : (
				<span className="text-11-5 text-dim">{refused}</span>
			)}
			{mutation.isError ? (
				<span role="alert" className="text-11-5 text-bright">
					<span aria-hidden="true">⚠ </span>
					{mutation.error.message}
				</span>
			) : null}
		</span>
	);
}
