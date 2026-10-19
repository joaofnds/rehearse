import {
	USD_FRACTION_DIGITS,
	spendReading,
} from "#client/run-history/run-progress";

const NO_SPEND_USD = 0;

const MAXIMUM_SPEND_FRACTION = 1;

const PERCENT = 100;

const TOKENS_PER_THOUSAND = 1000;

const thousands = new Intl.NumberFormat("en-US");

interface FigureProps {
	readonly label: string;
	readonly alignEnd?: boolean;
	readonly children: React.ReactNode;
}

function Figure({
	label,
	alignEnd = false,
	children,
}: FigureProps): React.JSX.Element {
	return (
		<div
			className={
				alignEnd
					? "ml-auto flex flex-col items-end gap-1 text-right"
					: "flex flex-col gap-1"
			}
		>
			<span className="text-12 tracking-label text-dim uppercase">{label}</span>
			{children}
		</div>
	);
}

interface NotRecordedProps {
	readonly reading: string;
}

function NotRecorded({ reading }: NotRecordedProps): React.JSX.Element {
	return (
		<span className="font-mono text-15 text-dim">
			—<span className="sr-only"> {reading} not recorded</span>
		</span>
	);
}

function tokenReading(tokens: number): string {
	return `${thousands.format(Math.round(tokens / TOKENS_PER_THOUSAND))}k`;
}

interface CeilingMeterProps {
	readonly runSpentUsd: number;
	readonly ceilingUsd: number;
}

function CeilingMeter({
	runSpentUsd,
	ceilingUsd,
}: CeilingMeterProps): React.JSX.Element {
	const share = Math.min(MAXIMUM_SPEND_FRACTION, runSpentUsd / ceilingUsd);
	const width = { "--spend-share": `${String(share * PERCENT)}%` };

	return (
		<div className="flex flex-col gap-1.5">
			<div
				role="img"
				aria-label={`Spent ${runSpentUsd.toFixed(USD_FRACTION_DIGITS)} dollars of a ${ceilingUsd.toFixed(USD_FRACTION_DIGITS)} dollar ceiling`}
				className="relative h-2.75 rounded-tight border border-strong bg-background"
			>
				<div
					className="absolute inset-y-0 left-0 w-(--spend-share) overflow-hidden rounded-l-tight bg-meter-stripe"
					style={width}
				/>
				<div
					aria-hidden="true"
					className="absolute -inset-y-1 left-(--spend-share) w-px bg-foreground"
					style={width}
				/>
			</div>
			<div className="flex justify-between font-mono text-12 text-dim">
				<span>{spendReading(NO_SPEND_USD)}</span>
				<span>
					{String(Math.round(share * PERCENT))}% of ceiling used · stops
					mid-step at the ceiling
				</span>
				<span>{spendReading(ceilingUsd)}</span>
			</div>
		</div>
	);
}

interface RunSpendFigureProps {
	readonly runSpentUsd: number | undefined;
	readonly ceilingUsd: number | undefined;
}

function RunSpendFigure({
	runSpentUsd,
	ceilingUsd,
}: RunSpendFigureProps): React.JSX.Element {
	return (
		<Figure label="Spent this run">
			<span className="flex items-baseline gap-2.5">
				{runSpentUsd === undefined ? (
					<NotRecorded reading="run spend" />
				) : (
					<span className="font-mono text-26 font-medium tracking-figure text-foreground">
						{spendReading(runSpentUsd)}
					</span>
				)}
				{ceilingUsd === undefined ? null : (
					<span className="font-mono text-12 text-muted-foreground">
						of {spendReading(ceilingUsd)} limit
					</span>
				)}
			</span>
		</Figure>
	);
}

export { CeilingMeter, Figure, NotRecorded, RunSpendFigure, tokenReading };
