export interface RangePlotRow {
	readonly id: string;
	readonly label: string;
	readonly low: number;
	readonly high: number;
	readonly value?: number;
}

export function RangePlot({
	label,
	minimum,
	maximum,
	formatValue,
	rows,
	valueLabel = "mean",
}: {
	readonly label: string;
	readonly minimum: number;
	readonly maximum: number;
	readonly formatValue: (value: number) => string;
	readonly rows: readonly RangePlotRow[];
	readonly valueLabel?: string;
}): React.JSX.Element {
	const width = 460;
	const point = (value: number): number =>
		maximum === minimum
			? width / 2
			: ((value - minimum) / (maximum - minimum)) * width;
	const ticks =
		maximum === minimum
			? [minimum]
			: [minimum, (minimum + maximum) / 2, maximum];

	return (
		<figure aria-label={label} className="min-w-0">
			<div className="flex gap-3">
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
				<div className="min-w-0 flex-1">
					<div className="relative">
						<div aria-hidden="true">
							{rows.map((row) => (
								<div key={row.id} className="relative h-10">
									{row.value === undefined ? null : (
										<span
											className="absolute top-1/2 left-(--point-left) z-10 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pale"
											style={{
												"--point-left": `${(point(row.value) / width) * 100}%`,
											}}
										/>
									)}
								</div>
							))}
						</div>
						<svg
							aria-hidden="true"
							viewBox={`0 0 ${width} ${Math.max(1, rows.length) * 40}`}
							preserveAspectRatio="none"
							className="absolute inset-0 h-full w-full overflow-visible"
						>
							{ticks.map((tick) => (
								<line
									key={tick}
									x1={point(tick)}
									x2={point(tick)}
									y1={0}
									y2={rows.length * 40}
									className="stroke-strong"
								/>
							))}
							{rows.map((row, index) => {
								const rowY = index * 40 + 20;
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
												y1={rowY - 5}
												y2={rowY + 5}
												className="stroke-primary"
											/>
										))}
									</g>
								);
							})}
						</svg>
					</div>
					<div className="mt-2 flex justify-between gap-2 text-12 text-muted-foreground tabular-nums">
						{ticks.map((tick) => (
							<span key={tick}>{formatValue(tick)}</span>
						))}
					</div>
				</div>
			</div>
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
		</figure>
	);
}
