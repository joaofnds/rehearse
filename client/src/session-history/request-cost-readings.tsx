import type {
	HistoryRegion,
	SessionHistoryAttemptCost,
	SessionHistoryCostReading,
	SessionHistoryRequestCost,
} from "#benchmark/session-history";
import Metric from "#client/system/components/metric";

const NO_PRICED_REQUESTS = 0;

const usd = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 6,
	minimumFractionDigits: 2,
	style: "currency",
});

const roundedUsd = new Intl.NumberFormat("en-US", {
	currency: "USD",
	style: "currency",
});

/**
 * Only attempt-region requests are priced, so an absent cost says which region
 * the row sits in rather than a pricing failure. Saying "outside the attempt
 * region" for every row of a boundary-unknown series would name a region that
 * series never established.
 */
function requestCostLabel(
	cost: SessionHistoryRequestCost | undefined,
	region: HistoryRegion,
): string {
	if (cost === undefined) {
		return `? Unpriced · ${region} requests are not priced`;
	}

	return cost.state === "priced"
		? usd.format(cost.costUsd)
		: `? Unpriced · ${cost.reason}`;
}

function costHeadline(
	reading: SessionHistoryCostReading,
	difference: boolean,
	format: Intl.NumberFormat = usd,
): string {
	if (reading.state === "unavailable") {
		return "? Unavailable";
	}
	if (reading.state === "complete") {
		return `✓ Complete · ${format.format(reading.costUsd)}`;
	}
	if (difference) {
		return `◐ Incomplete · ${format.format(reading.costUsd)} difference`;
	}
	if (reading.pricedRequestCount === NO_PRICED_REQUESTS) {
		return `? Unpriced · 0 of ${reading.requestCount} requests priced`;
	}
	return `◐ Incomplete · ${format.format(reading.costUsd)} known subtotal over ${reading.pricedRequestCount} of ${reading.requestCount} requests`;
}

function costLabel(reading: SessionHistoryCostReading): string {
	const headline = costHeadline(reading, false);
	return reading.state === "complete"
		? headline
		: `${headline} · ${reading.reasons.join(", ")}`;
}

interface CostReadingProps {
	readonly reading: SessionHistoryCostReading;
	readonly difference: boolean;
}

function CostReading({
	reading,
	difference,
}: CostReadingProps): React.JSX.Element {
	const displayed = costHeadline(reading, difference, roundedUsd);
	const exact =
		reading.state === "unavailable"
			? undefined
			: reading.costUsd.toLocaleString("en-US", {
					currency: "USD",
					maximumFractionDigits: 20,
					style: "currency",
				});
	const rounded =
		reading.state === "unavailable"
			? undefined
			: roundedUsd.format(reading.costUsd);
	if (reading.state === "complete" && exact === rounded) {
		return <>{displayed}</>;
	}
	return (
		<>
			<span className={reading.state === "complete" ? "" : "text-attention"}>
				{displayed}
			</span>
			<details
				className={`mt-1 text-12 ${reading.state === "complete" ? "" : "text-attention"}`}
			>
				<summary className="cursor-pointer">
					{reading.state === "complete"
						? "Exact measurement"
						: `${reading.reasons.length} pricing gaps`}
					{reading.state === "incomplete"
						? ` · ${reading.pricedRequestCount}/${reading.requestCount} requests priced`
						: ""}
				</summary>
				{exact === rounded ? null : (
					<p className="mt-2 font-mono text-12">Exact amount: {exact}</p>
				)}
				<ul className="mt-2 flex flex-col gap-1 text-secondary-foreground">
					{(reading.state === "complete" ? [] : reading.reasons).map(
						(reason, index) => (
							<li key={`${index}:${reason}`}>{reason}</li>
						),
					)}
				</ul>
			</details>
		</>
	);
}

interface RequestCostReadingsProps {
	readonly cost: SessionHistoryAttemptCost;
}

function RequestCostReadings({
	cost,
}: RequestCostReadingsProps): React.JSX.Element {
	return (
		<dl
			aria-label="Session root attempt cost"
			className="grid gap-5 rounded-lg border border-divider bg-card p-4 md:grid-cols-3"
		>
			{[
				{
					difference: false,
					reading: cost.reported,
					term: "Provider reported · attempt",
				},
				{
					difference: false,
					reading: cost.calculated,
					term: "Calculated · root requests",
				},
				{
					difference: true,
					reading: cost.difference,
					term: "Remaining difference",
				},
			].map(({ term, reading, difference }) => (
				<Metric
					key={term}
					label={term}
					value={<CostReading reading={reading} difference={difference} />}
				/>
			))}
		</dl>
	);
}

export {
	costHeadline,
	costLabel,
	CostReading,
	requestCostLabel,
	RequestCostReadings,
	usd,
};
