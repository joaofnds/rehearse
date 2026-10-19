import type { ReactNode } from "react";
import { useId } from "react";

import type { AgentCost, Allocation } from "./agent-tree-model";
import { EMPTY_COLLECTION_LENGTH } from "./agent-tree-model";
import { costLabel, usd } from "./request-timeline";

interface ReadingProps {
	readonly term: string;
	readonly children: ReactNode;
}

function Reading({ term, children }: ReadingProps): React.JSX.Element {
	const id = useId();

	return (
		<div className="flex flex-col gap-0.5">
			<dt id={id}>
				<span className="text-12 text-muted-foreground">{term}</span>
			</dt>
			<dd aria-labelledby={id} className="text-14 text-secondary-foreground">
				{children}
			</dd>
		</div>
	);
}

interface CostReadingsProps {
	readonly cost: AgentCost | undefined;
	readonly allocation: Allocation;
}

function CostReadings({
	cost,
	allocation,
}: CostReadingsProps): React.JSX.Element {
	if (cost === undefined) {
		return (
			<Reading term="Cost">
				{allocation.state === "available"
					? "Not part of the attempt's cost: this agent ran in the inherited prefix, before the attempt."
					: `? Unavailable · ${allocation.reasons.join(", ")}`}
			</Reading>
		);
	}

	return (
		<>
			<Reading term="Own cost">
				{costLabel(cost.own.cost)} · basis: {cost.own.basis}
			</Reading>
			<Reading term="Including descendants">
				{costLabel(cost.includingDescendants.cost)} · basis:{" "}
				{cost.includingDescendants.basis}
				{cost.includingDescendants.childAgentIds.length ===
				EMPTY_COLLECTION_LENGTH
					? ""
					: ` · children ${cost.includingDescendants.childAgentIds.join(", ")}`}
			</Reading>
			<Reading term="Shared remainder">
				{costLabel(cost.shared.cost)}
				{cost.shared.skills.length === EMPTY_COLLECTION_LENGTH
					? ""
					: ` · skills ${cost.shared.skills.join(", ")}`}{" "}
				· basis: {cost.shared.basis}
			</Reading>
			<Reading term="Unattributed remainder">
				{costLabel(cost.unattributed.cost)} · basis: {cost.unattributed.basis}
			</Reading>
			<Reading term="Provider count">
				{cost.provider.state === "reported"
					? `${usd.format(cost.provider.costUsd)} on ${cost.provider.models.join(", ")} · basis: ${cost.provider.basis}`
					: `Not separable · ${cost.provider.reason}`}
			</Reading>
		</>
	);
}

export { CostReadings, Reading };
