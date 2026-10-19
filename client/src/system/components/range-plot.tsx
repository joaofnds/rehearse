const MIDPOINT_DIVISOR = 2;

const MINIMUM_PLOT_ROW_COUNT = 1;

const PERCENT_SCALE = 100;

const ROW_HEIGHT = 40;

const ROW_CENTER = 20;

const END_CAP_HALF_HEIGHT = 5;

interface RangePlotRow {
	readonly id: string;
	readonly label: string;
	readonly low: number;
	readonly high: number;
	readonly value?: number;
}

interface RangePlotProps {
	readonly label: string;
	readonly minimum: number;
	readonly maximum: number;
	readonly formatValue: (value: number) => string;
	readonly rows: readonly RangePlotRow[];
	readonly valueLabel?: string;
}

function RangePlot({
	label,
	minimum,
	maximum,
	formatValue,
	rows,
	valueLabel = "mean",
}: RangePlotProps): React.JSX.Element {
	const width = 460;
	const point = (value: number): number =>
		maximum === minimum
			? width / MIDPOINT_DIVISOR
			: ((value - minimum) / (maximum - minimum)) * width;
	const ticks =
		maximum === minimum
			? [minimum]
			: [minimum, (minimum + maximum) / MIDPOINT_DIVISOR, maximum];

	return (
		<figure aria-label={label} className="min-w-0">
			<div className="flex gap-3">
				<RangeRowLabels rows={rows} />
				<div className="min-w-0 flex-1">
					<div className="relative">
						<RangePointMarkers rows={rows} point={point} width={width} />
						<RangePlotAxis
							rows={rows}
							ticks={ticks}
							width={width}
							point={point}
						/>
					</div>
					<div className="mt-2 flex justify-between gap-2 text-12 text-muted-foreground tabular-nums">
						{ticks.map((tick) => (
							<span key={tick}>{formatValue(tick)}</span>
						))}
					</div>
				</div>
			</div>
			<RangePlotCaption
				rows={rows}
				formatValue={formatValue}
				valueLabel={valueLabel}
			/>
		</figure>
	);
}

interface RangePlotCaptionProps {
	readonly rows: readonly RangePlotRow[];
	readonly formatValue: (value: number) => string;
	readonly valueLabel: string;
}

function RangePlotCaption({
	rows,
	formatValue,
	valueLabel,
}: RangePlotCaptionProps): React.JSX.Element {
	return (
		<figcaption className="mt-3 flex flex-col gap-1.5 text-12">
			{rows.map((row) => (
				<span
					key={row.id}
					className="flex flex-wrap justify-between gap-x-4 gap-y-1"
				>
					<span className="text-secondary-foreground">{row.label}</span>
					<span className="text-muted-foreground tabular-nums">
						{formatValue(row.low)} to {formatValue(row.high)}
						{row.value === undefined
							? ""
							: ` · ${formatValue(row.value)} ${valueLabel}`}
					</span>
				</span>
			))}
		</figcaption>
	);
}

interface RangePlotAxisProps {
	readonly rows: readonly RangePlotRow[];
	readonly ticks: readonly number[];
	readonly width: number;
	readonly point: (value: number) => number;
}

function RangePlotAxis({
	rows,
	ticks,
	width,
	point,
}: RangePlotAxisProps): React.JSX.Element {
	return (
		<svg
			aria-hidden="true"
			viewBox={`0 0 ${width} ${Math.max(MINIMUM_PLOT_ROW_COUNT, rows.length) * ROW_HEIGHT}`}
			preserveAspectRatio="none"
			className="absolute inset-0 h-full w-full overflow-visible"
		>
			{ticks.map((tick) => (
				<line
					key={tick}
					x1={point(tick)}
					x2={point(tick)}
					y1={0}
					y2={rows.length * ROW_HEIGHT}
					className="stroke-strong"
				/>
			))}
			{rows.map((row, index) => {
				const rowY = index * ROW_HEIGHT + ROW_CENTER;
				return <RangeMarks key={row.id} row={row} rowY={rowY} point={point} />;
			})}
		</svg>
	);
}

interface RangeMarksProps {
	readonly row: RangePlotRow;
	readonly rowY: number;
	readonly point: (value: number) => number;
}

function RangeMarks({ row, rowY, point }: RangeMarksProps): React.JSX.Element {
	return (
		<g key={row.id}>
			<line
				x1={point(row.low)}
				x2={point(row.high)}
				y1={rowY}
				y2={rowY}
				strokeWidth={3}
				className="stroke-primary"
			/>
			{[row.low, row.high].map((edge, side) => (
				<line
					key={side}
					x1={point(edge)}
					x2={point(edge)}
					y1={rowY - END_CAP_HALF_HEIGHT}
					y2={rowY + END_CAP_HALF_HEIGHT}
					className="stroke-primary"
				/>
			))}
		</g>
	);
}

interface RangePointMarkersProps {
	readonly rows: readonly RangePlotRow[];
	readonly point: (value: number) => number;
	readonly width: number;
}

function RangePointMarkers({
	rows,
	point,
	width,
}: RangePointMarkersProps): React.JSX.Element {
	return (
		<div aria-hidden="true">
			{rows.map((row) => (
				<div key={row.id} className="relative h-10">
					{row.value === undefined ? null : (
						<span
							className="absolute top-1/2 left-(--point-left) z-10 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pale"
							style={{
								"--point-left": `${(point(row.value) / width) * PERCENT_SCALE}%`,
							}}
						/>
					)}
				</div>
			))}
		</div>
	);
}

interface RangeRowLabelsProps {
	readonly rows: readonly RangePlotRow[];
}

function RangeRowLabels({ rows }: RangeRowLabelsProps): React.JSX.Element {
	return (
		<div className="flex shrink-0 flex-col">
			{rows.map((row) => (
				<span
					key={row.id}
					className="flex h-10 items-center text-12 text-secondary-foreground"
				>
					{row.label}
				</span>
			))}
		</div>
	);
}

export { RangePlot as default };
export type { RangePlotRow };
