import {
	clockReading,
	liveElapsedMs,
	spendReading,
} from "#client/run-history/run-progress";
import useNow from "#client/run-history/use-now";
import type { PipelineRow } from "#client/shell/run-in-flight";

import { burnPerMinute } from "./remaining-estimate";
import RemainingFigure from "./remaining-spend-reading";
import type { MonitoredStage } from "./run-record-query";
import {
	CeilingMeter,
	Figure,
	NotRecorded,
	RunSpendFigure,
	tokenReading,
} from "./spend-reading";

type Progress = Extract<PipelineRow["progress"], { readonly state: "running" }>;

/**
 * The monitor's second band (SPEC.md 2b): what the run has spent against the
 * ceiling that stops it, how fast, for how long, the tokens it took, and what
 * the steps left would take at that rate.
 */
interface SpendBandProps {
	readonly run: string;
	readonly stages: readonly MonitoredStage[];
	readonly progress: Progress;
}

function SpendBand({
	run,
	stages,
	progress,
}: SpendBandProps): React.JSX.Element {
	const nowMs = useNow(true);
	const { runSpentUsd, runTokens, ceilingUsd, elapsedMs, measuredAt } =
		progress;

	return (
		<section
			aria-label="Spend"
			className="flex flex-none flex-col gap-3.5 border-b border-divider bg-card px-6 py-3.75"
		>
			<div className="flex flex-wrap items-end gap-8.5">
				<RunSpendFigure runSpentUsd={runSpentUsd} ceilingUsd={ceilingUsd} />
				<Figure label="Burn rate">
					{runSpentUsd === undefined ? (
						<NotRecorded reading="run spend" />
					) : (
						<span className="font-mono text-15">
							{spendReading(burnPerMinute(runSpentUsd, elapsedMs))}
							<span className="text-12 text-dim"> /min</span>
						</span>
					)}
				</Figure>
				<Figure label="Elapsed">
					<span className="font-mono text-15">
						{clockReading(liveElapsedMs(elapsedMs, measuredAt, nowMs))}
					</span>
				</Figure>
				<RunTokenFigure runTokens={runTokens} />
				<RemainingFigure
					run={run}
					stages={stages}
					progress={progress}
					nowMs={nowMs}
				/>
			</div>
			{runSpentUsd === undefined || ceilingUsd === undefined ? null : (
				<CeilingMeter runSpentUsd={runSpentUsd} ceilingUsd={ceilingUsd} />
			)}
		</section>
	);
}

interface RunTokenFigureProps {
	readonly runTokens: Progress["runTokens"];
}

function RunTokenFigure({ runTokens }: RunTokenFigureProps): React.JSX.Element {
	return (
		<Figure label="Tokens in / out">
			{runTokens === undefined ? (
				<NotRecorded reading="run tokens" />
			) : (
				<span className="font-mono text-15 text-secondary-foreground">
					{tokenReading(runTokens.input)} / {tokenReading(runTokens.output)}
				</span>
			)}
		</Figure>
	);
}

export { SpendBand as default };
export type { Progress };
