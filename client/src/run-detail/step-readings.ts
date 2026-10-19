import type { MonitoredStage } from "#client/monitor/run-record-query";
import { spendReading } from "#client/run-history/run-progress";

type RecordedCost = MonitoredStage["sessionCost"];

function costPart(name: string, cost: RecordedCost): string {
	return cost.state === "available"
		? `${name} ${spendReading(cost.usd)}`
		: `${name} cost not recorded: ${cost.reasons.join("; ")}`;
}

/**
 * The stage's session and judge spend together, as its record keeps them, or
 * each part apart when the record lacks one, so a part is never read as the
 * whole.
 */
function stageCostReading(stage: MonitoredStage): string {
	const { sessionCost, judgeCost } = stage;
	if (sessionCost.state === "available" && judgeCost.state === "available") {
		return spendReading(sessionCost.usd + judgeCost.usd);
	}

	return [costPart("session", sessionCost), costPart("judge", judgeCost)].join(
		" · ",
	);
}

export { stageCostReading as default };
