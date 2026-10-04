import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postLaunch } from "#client/launch/post-launch";
import { runHistoryQuery } from "#client/run-history/run-history-query";
import { spendReading } from "#client/run-history/run-progress";
import { Button } from "#client/system/ui/button";
import type { AnalysisReadingResponse } from "./analysis-query";
import { analysesQuery } from "./analysis-query";

const ANALYSIS_IN_FLIGHT = "An analysis of this run is in flight.";

const RUN_NOT_ENDED =
	"An analysis reads an ended run, and this one has not ended.";

/**
 * Why the run's own state holds a request back: the server refuses a run in
 * flight or paused, and a second analysis while one runs would spend twice.
 */
export function analysisWait({
	runEnded,
	analysisInFlight,
}: {
	readonly runEnded: boolean;
	readonly analysisInFlight: boolean;
}): string | null {
	if (!runEnded) {
		return RUN_NOT_ENDED;
	}

	return analysisInFlight ? ANALYSIS_IN_FLIGHT : null;
}

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
	wait: string | null,
): string | null {
	return request.capUsd === null ? request.refusal : wait;
}

/**
 * Requests one root-cause analysis of `run`, stating the cap it posts on the
 * button itself: the server refuses a stated figure other than its cap, so
 * the click is the operator's agreement to that figure.
 */
export function RequestAnalysisButton({
	run,
	request,
	wait,
	label,
}: {
	readonly run: string;
	readonly request: AnalysisReadingResponse["request"];
	readonly wait: string | null;
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
	const refused = refusalOf(request, wait);

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
