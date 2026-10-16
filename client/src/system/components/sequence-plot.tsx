import { cn } from "#client/system/cn";

export interface SequencePlotPoint {
	readonly id: string;
	readonly label: string;
	readonly value: number | undefined;
}

const LEFT = 55;
const RIGHT = 600;
const TOP = 15;
const BOTTOM = 145;

function position(index: number, count: number): number {
	return count <= 1
		? (LEFT + RIGHT) / 2
		: LEFT + (index / (count - 1)) * (RIGHT - LEFT);
}

function height(value: number, maximum: number): number {
	return maximum === 0 ? BOTTOM : BOTTOM - (value / maximum) * (BOTTOM - TOP);
}

function segments(
	points: readonly SequencePlotPoint[],
	maximum: number,
): readonly string[] {
	const paths: string[] = [];
	let current = "";
	for (const [index, point] of points.entries()) {
		if (point.value === undefined) {
			if (current !== "") {
				paths.push(current);
				current = "";
			}
			continue;
		}
		current += `${current === "" ? "M" : "L"}${position(index, points.length)} ${height(point.value, maximum)} `;
	}
	if (current !== "") {
		paths.push(current);
	}

	return paths;
}

export function SequencePlot({
	label,
	unit,
	points,
	selected,
	onSelect,
	formatValue,
}: {
	readonly label: string;
	readonly unit: string;
	readonly points: readonly SequencePlotPoint[];
	readonly selected: string | undefined;
	readonly onSelect: (id: string) => void;
	readonly formatValue: (value: number) => string;
}): React.JSX.Element {
	const maximum = Math.max(
		0,
		...points.flatMap(({ value }) => (value === undefined ? [] : [value])),
	);
	const missing = points.filter(({ value }) => value === undefined).length;
	const selectedIndex = points.findIndex(({ id }) => id === selected);
	const activeIndex = Math.max(0, selectedIndex);
	const active = points[activeIndex];
	const ticks = maximum === 0 ? [0] : [0, maximum / 2, maximum];

	return (
		<figure aria-label={label} className="min-w-0">
			<figcaption className="flex flex-wrap justify-between gap-2 text-12 text-muted-foreground">
				<span>{unit}</span>
				<span>Request order · click a point or use ← / →</span>
			</figcaption>
			<button
				type="button"
				aria-label={`${label}. Use left and right arrows to select a request.`}
				className="block w-full rounded-md text-left focus-visible:outline-2 focus-visible:outline-primary"
				disabled={points.length === 0}
				onClick={(event) => {
					const rect = event.currentTarget.getBoundingClientRect();
					const plotX = ((event.clientX - rect.left) / rect.width) * 640;
					const index =
						event.detail === 0
							? activeIndex
							: Math.round(
									((plotX - LEFT) / (RIGHT - LEFT)) * (points.length - 1),
								);
					const point = points[Math.max(0, Math.min(points.length - 1, index))];
					if (point !== undefined) {
						onSelect(point.id);
					}
				}}
				onKeyDown={(event) => {
					let index = activeIndex;
					if (event.key === "ArrowLeft") {
						index -= 1;
					} else if (event.key === "ArrowRight") {
						index += 1;
					} else if (event.key === "Home") {
						index = 0;
					} else if (event.key === "End") {
						index = points.length - 1;
					} else {
						return;
					}
					event.preventDefault();
					const point = points[Math.max(0, Math.min(points.length - 1, index))];
					if (point !== undefined) {
						onSelect(point.id);
					}
				}}
			>
				<svg aria-hidden="true" viewBox="0 0 640 180" className="w-full">
					{ticks.map((tick) => (
						<g key={tick}>
							<line
								x1={LEFT}
								x2={RIGHT}
								y1={height(tick, maximum)}
								y2={height(tick, maximum)}
								className="stroke-strong"
							/>
							<text
								x={LEFT - 8}
								y={height(tick, maximum) + 4}
								textAnchor="end"
								className="fill-muted-foreground font-sans text-11"
							>
								{formatValue(tick)}
							</text>
						</g>
					))}
					{segments(points, maximum).map((path, index) => (
						<path
							key={index}
							d={path}
							fill="none"
							strokeWidth={2}
							className="stroke-primary"
						/>
					))}
					{points.map((point, index) =>
						point.value === undefined ? null : (
							<circle
								key={point.id}
								cx={position(index, points.length)}
								cy={height(point.value, maximum)}
								r={point.id === selected ? 6 : 3}
								className={cn(
									"fill-primary",
									point.id === selected && "fill-pale stroke-pale",
								)}
							/>
						),
					)}
					<text
						x={LEFT}
						y={169}
						textAnchor="middle"
						className="fill-muted-foreground font-sans text-12"
					>
						{points.length === 0 ? "" : "1"}
					</text>
					{points.length <= 1 ? null : (
						<text
							x={RIGHT}
							y={169}
							textAnchor="middle"
							className="fill-muted-foreground font-sans text-12"
						>
							{points.length}
						</text>
					)}
				</svg>
			</button>
			<p aria-live="polite" className="text-12 text-secondary-foreground">
				{active === undefined
					? "No requests in this scope."
					: `${active.label} · ${active.value === undefined ? "usage unavailable" : `${formatValue(active.value)} ${unit}`}`}
			</p>
			{missing === 0 ? null : (
				<p className="mt-1 text-12 text-muted-foreground">
					{missing} {missing === 1 ? "request" : "requests"} without settled
					usage; gaps are not zero.
				</p>
			)}
		</figure>
	);
}
