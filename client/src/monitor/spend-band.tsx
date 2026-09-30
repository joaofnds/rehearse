import {
	clockReading,
	liveElapsedMs,
	spendReading,
} from "#client/run-history/run-progress";
import { useNow } from "#client/run-history/use-now";
import type { PipelineRow } from "#client/shell/run-in-flight";

type Progress = Extract<PipelineRow["progress"], { readonly state: "running" }>;

const MS_PER_MINUTE = 60_000;

const PERCENT = 100;

const TOKENS_PER_THOUSAND = 1000;

const thousands = new Intl.NumberFormat("en-US");

function Figure({
	label,
	children,
}: {
	readonly label: string;
	readonly children: React.ReactNode;
}): React.JSX.Element {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs tracking-widest text-dim uppercase">
				{label}
			</span>
			{children}
		</div>
	);
}

function NotRecorded({
	reading,
}: {
	readonly reading: string;
}): React.JSX.Element {
	return (
		<span className="font-mono text-lg text-dim">
			—<span className="sr-only"> {reading} not recorded</span>
		</span>
	);
}

function tokenReading(tokens: number): string {
	return `${thousands.format(Math.round(tokens / TOKENS_PER_THOUSAND))}k`;
}

/**
 * Run spend over run elapsed, both as the run measured them at its latest
 * event (doc-186 Decision 5). Dividing by the ticking clock instead would
 * show the rate falling between the run's calls while nothing was spent.
 */
function burnPerMinute(runSpentUsd: number, elapsedMs: number): number {
	return elapsedMs === 0 ? 0 : runSpentUsd / (elapsedMs / MS_PER_MINUTE);
}

function CeilingMeter({
	runSpentUsd,
	ceilingUsd,
}: {
	readonly runSpentUsd: number;
	readonly ceilingUsd: number;
}): React.JSX.Element {
	const share = Math.min(1, runSpentUsd / ceilingUsd);
	const width = { "--spend-share": `${String(share * PERCENT)}%` };

	return (
		<div className="flex flex-col gap-1.5">
			<div
				role="img"
				aria-label={`Spent ${runSpentUsd.toFixed(2)} dollars of a ${ceilingUsd.toFixed(2)} dollar ceiling`}
				className="relative h-2.75 rounded-md border border-strong bg-background"
			>
				<div
					className="absolute inset-y-0 left-0 w-(--spend-share) overflow-hidden rounded-l-md bg-meter-stripe"
					style={width}
				/>
				<div
					aria-hidden="true"
					className="absolute -inset-y-1 left-(--spend-share) w-px bg-foreground"
					style={width}
				/>
			</div>
			<div className="flex justify-between font-mono text-xs text-dim">
				<span>{spendReading(0)}</span>
				<span>
					{String(Math.round(share * PERCENT))}% of ceiling used · stops
					mid-step at the ceiling
				</span>
				<span>{spendReading(ceilingUsd)}</span>
			</div>
		</div>
	);
}

/**
 * The monitor's second band (SPEC.md 2b): what the run has spent against the
 * ceiling that stops it, how fast, for how long, and the tokens it took. The remaining estimate
 * is ACT-270.5's.
 */
export function SpendBand({
	progress,
}: {
	readonly progress: Progress;
}): React.JSX.Element {
	const nowMs = useNow(true);
	const { runSpentUsd, runTokens, ceilingUsd, elapsedMs, measuredAt } =
		progress;

	return (
		<section
			aria-label="Spend"
			className="flex flex-none flex-col gap-3.5 border-b border-divider bg-card px-6 py-3.75"
		>
			<div className="flex flex-wrap items-end gap-8.5">
				<Figure label="Spent this run">
					<span className="flex items-baseline gap-2.5">
						{runSpentUsd === undefined ? (
							<NotRecorded reading="run spend" />
						) : (
							<span className="font-mono text-3xl font-medium tracking-tight text-foreground">
								{spendReading(runSpentUsd)}
							</span>
						)}
						{ceilingUsd === undefined ? null : (
							<span className="font-mono text-sm text-muted-foreground">
								of {spendReading(ceilingUsd)} limit
							</span>
						)}
					</span>
				</Figure>
				<Figure label="Burn rate">
					{runSpentUsd === undefined ? (
						<NotRecorded reading="run spend" />
					) : (
						<span className="font-mono text-lg">
							{spendReading(burnPerMinute(runSpentUsd, elapsedMs))}
							<span className="text-sm text-dim"> /min</span>
						</span>
					)}
				</Figure>
				<Figure label="Elapsed">
					<span className="font-mono text-lg">
						{clockReading(liveElapsedMs(elapsedMs, measuredAt, nowMs))}
					</span>
				</Figure>
				<Figure label="Tokens in / out">
					{runTokens === undefined ? (
						<NotRecorded reading="run tokens" />
					) : (
						<span className="font-mono text-lg text-secondary-foreground">
							{tokenReading(runTokens.input)} / {tokenReading(runTokens.output)}
						</span>
					)}
				</Figure>
			</div>
			{runSpentUsd === undefined || ceilingUsd === undefined ? null : (
				<CeilingMeter runSpentUsd={runSpentUsd} ceilingUsd={ceilingUsd} />
			)}
		</section>
	);
}
