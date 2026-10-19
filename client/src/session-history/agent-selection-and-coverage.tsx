import plural from "#client/plural";

import { AgentDetail, SkillDetail } from "./agent-detail-readings";
import type {
	Allocation,
	ExcerptRequest,
	Selection,
	Tree,
} from "./agent-tree-model";
import { costOf } from "./agent-tree-model";
import { CostReading, costLabel } from "./request-timeline";

function coverageLabel(tree: Tree): string {
	return tree.coverage.state === "complete"
		? "✓ Complete · every agent the transcripts name has a kept transcript"
		: `◐ Incomplete · no kept transcript for ${tree.coverage.unavailableAgentIds.join(", ")} · totals that include them read incomplete`;
}

interface SelectedDetailProps {
	readonly tree: Tree;
	readonly allocation: Allocation;
	readonly selection: Selection;
	readonly onOpenExcerpt: (request: ExcerptRequest) => void;
	readonly onSelectSource: (sourceId: string) => void;
}

function SelectedDetail({
	tree,
	allocation,
	selection,
	onOpenExcerpt,
	onSelectSource,
}: SelectedDetailProps): React.JSX.Element {
	if (selection.kind === "skill") {
		const skill = costOf(allocation, selection.agentId)?.skills.find(
			({ deliveryLine }) => deliveryLine === selection.deliveryLine,
		);

		return skill === undefined ? (
			<p className="text-12 text-muted-foreground">
				This skill has no cost reading.
			</p>
		) : (
			<SkillDetail skill={skill} agentId={selection.agentId} />
		);
	}

	return (
		<AgentDetail
			tree={tree}
			allocation={allocation}
			agentId={selection.agentId}
			onOpenExcerpt={onOpenExcerpt}
			onSelectSource={onSelectSource}
		/>
	);
}

interface AgentCostDetailsProps {
	readonly tree: Tree;
	readonly cost: Allocation;
}

function AgentCostDetails({
	tree,
	cost,
}: AgentCostDetailsProps): React.JSX.Element {
	return (
		<details className="mt-1 text-12 text-secondary-foreground">
			<summary className="cursor-pointer">Coverage and cost details</summary>
			<p className="mt-2">{coverageLabel(tree)}</p>
			<p className="mt-2">
				{cost.state === "available"
					? costLabel(cost.calculated)
					: cost.reasons.join(", ")}
			</p>
			{cost.state === "available" ? (
				<ul aria-label="Cost by model" className="mt-2 flex flex-col gap-2">
					{cost.byModel.map((model) => (
						<li key={model.model} aria-label={model.model}>
							{model.model} · provider count {costLabel(model.reported)} ·
							basis: {model.reportedBasis} · calculated{" "}
							{costLabel(model.calculated)}
						</li>
					))}
				</ul>
			) : null}
		</details>
	);
}

interface AgentCoverageProps {
	readonly tree: Tree;
	readonly cost: Allocation;
}

function AgentCoverage({ tree, cost }: AgentCoverageProps): React.JSX.Element {
	return (
		<div className="flex flex-col gap-1 border-b px-3 py-2.5">
			<p
				role="status"
				aria-label="Agent coverage"
				className={`text-14 ${tree.coverage.state === "complete" ? "text-secondary-foreground" : "text-attention"}`}
			>
				{tree.coverage.state === "complete"
					? "Complete coverage · all agent transcripts saved"
					: `Incomplete coverage · ${plural(tree.coverage.unavailableAgentIds.length, "missing transcript")}`}
			</p>
			<div
				role="status"
				aria-label="Calculated attempt total"
				className="text-14 text-secondary-foreground"
			>
				Calculated attempt total, each request once:{" "}
				{cost.state === "available" ? (
					<CostReading reading={cost.calculated} difference={false} />
				) : (
					"Unavailable"
				)}
			</div>
			<AgentCostDetails tree={tree} cost={cost} />
		</div>
	);
}

export { AgentCoverage, SelectedDetail };
