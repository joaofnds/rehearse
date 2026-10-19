import { ContextHistory, LoadEvidence } from "./agent-context-evidence";
import { CostReadings, Reading } from "./agent-cost-readings";
import type {
	Allocation,
	AvailableSubAgent,
	ExcerptRequest,
	Readings,
	SkillCost,
	SubAgent,
	Tree,
} from "./agent-tree-model";
import {
	EMPTY_COLLECTION_LENGTH,
	ROOT_NAME,
	agentName,
	costOf,
	peakLabel,
	totalsLabel,
} from "./agent-tree-model";
import { costLabel } from "./request-timeline";

function roleLabel(agent: AvailableSubAgent): string {
	const kind = isReviewAgentType(agent.agentType)
		? "Review agent"
		: "Sub-agent";

	return `${kind} · agent type ${agent.agentType ?? "not recorded"} · not a harness role (worker, Product Owner or Judge)`;
}

function isReviewAgentType(agentType: string | undefined): boolean {
	return (
		agentType === "reviewer" || agentType?.startsWith("reviewer-") === true
	);
}

function stoppedLabel(agent: AvailableSubAgent): string {
	if (agent.stopped === "not recorded") {
		return "not recorded";
	}

	return agent.stopped ? "Stopped by the user" : "Not stopped";
}

function contextLabel(agent: AvailableSubAgent): string {
	if (agent.context === "fresh") {
		return "Context began fresh";
	}
	if (agent.context === "inherited") {
		return "Inherited: ran in the attempt's inherited prefix, before the attempt";
	}

	return "Context start not recorded";
}

function parentLabel(agent: SubAgent): string {
	if (agent.parent.state === "unlinked") {
		return "Unlinked: no record ties it to a parent";
	}

	const parent =
		agent.parent.state === "root" ? ROOT_NAME : agent.parent.agentId;

	return `${parent} · linked by ${agent.parent.basis}`;
}

interface AgentDetailProps {
	readonly tree: Tree;
	readonly allocation: Allocation;
	readonly agentId: string | undefined;
	readonly onOpenExcerpt: (request: ExcerptRequest) => void;
	readonly onSelectSource: (sourceId: string) => void;
}

function AgentDetail({
	tree,
	allocation,
	agentId,
	onOpenExcerpt,
	onSelectSource,
}: AgentDetailProps): React.JSX.Element {
	const agent = tree.agents.find((each) => each.agentId === agentId);
	if (agent?.evidence === "unavailable") {
		return (
			<dl className="flex flex-col gap-2">
				<Reading term="Agent">{agent.agentId}</Reading>
				<Reading term="Parent">{parentLabel(agent)}</Reading>
				<Reading term="Evidence">
					{agent.context === "inherited"
						? "? Unavailable · the record holds no transcript for this agent, which ran in the inherited prefix, so coverage and the attempt's totals leave it out"
						: "? Unavailable · the record holds no transcript for this agent, so coverage and every total including it read incomplete"}
				</Reading>
			</dl>
		);
	}

	const readings = agent ?? tree.root;

	return (
		<div className="flex flex-col gap-3">
			<AgentIdentityReadings
				agent={agent}
				agentId={agentId}
				readings={readings}
				allocation={allocation}
			/>
			<AgentContextHistory readings={readings} agent={agent} />
			<section className="flex flex-col gap-1.5">
				<h3>
					<span className="text-12 text-muted-foreground">Load evidence</span>
				</h3>
				<LoadEvidence
					agentId={agentId}
					readings={readings}
					onOpenExcerpt={onOpenExcerpt}
					onSelectSource={onSelectSource}
				/>
			</section>
		</div>
	);
}

interface SkillDetailProps {
	readonly skill: SkillCost;
	readonly agentId: string | undefined;
}

function SkillDetail({ skill, agentId }: SkillDetailProps): React.JSX.Element {
	return (
		<dl className="flex flex-col gap-2">
			<Reading term="Skill">{skill.skill}</Reading>
			<Reading term="Invoked">
				{skill.invokedBy.by} in {agentName(agentId)} · delivered at line{" "}
				{skill.deliveryLine}
			</Reading>
			<Reading term="Own cost">
				{costLabel(skill.own.cost)} over {skill.own.requestLines.length}{" "}
				requests · basis: {skill.own.basis}
			</Reading>
			<Reading term="Including descendants">
				{costLabel(skill.includingDescendants.cost)}
				{skill.includingDescendants.childAgentIds.length ===
				EMPTY_COLLECTION_LENGTH
					? " · no sub-agent"
					: ` · sub-agents ${skill.includingDescendants.childAgentIds.join(", ")}`}{" "}
				· basis: {skill.includingDescendants.basis}
			</Reading>
		</dl>
	);
}

interface AgentIdentityReadingsProps {
	readonly agent: AvailableSubAgent | undefined;
	readonly agentId: string | undefined;
	readonly readings: Readings;
	readonly allocation: Allocation;
}

function AgentIdentityReadings({
	agent,
	agentId,
	readings,
	allocation,
}: AgentIdentityReadingsProps): React.JSX.Element {
	return (
		<dl className="flex flex-col gap-2">
			<Reading term="Agent">{agentName(agentId)}</Reading>
			<Reading term="Role">
				{agent === undefined
					? "Session root · the attempt's own session"
					: roleLabel(agent)}
			</Reading>
			<AgentLifecycleReadings agent={agent} />
			<Reading term="Model">
				{readings.models.length === EMPTY_COLLECTION_LENGTH
					? "? Unavailable model"
					: readings.models.join(", ")}
			</Reading>
			<Reading term="Token categories">
				{agent?.context === "inherited"
					? "Not part of the attempt: this agent's requests ran in the inherited prefix"
					: totalsLabel(readings)}
			</Reading>
			<Reading term="Context peak">
				{peakLabel(readings.series.entries)}
			</Reading>
			<CostReadings
				cost={costOf(allocation, agentId)}
				allocation={allocation}
			/>
		</dl>
	);
}

interface AgentLifecycleReadingsProps {
	readonly agent: AvailableSubAgent | undefined;
}

function AgentLifecycleReadings({
	agent,
}: AgentLifecycleReadingsProps): React.JSX.Element {
	return (
		<>
			{agent === undefined ? null : (
				<>
					<Reading term="Parent">{parentLabel(agent)}</Reading>
					<Reading term="Context kind">
						{contextLabel(agent)} · resume {agent.resume}
					</Reading>
					<Reading term="Launch">
						{agent.launchMode ?? "launch mode not recorded"} · spawn depth{" "}
						{agent.spawnDepth ?? "not recorded"}
					</Reading>
					<Reading term="Stopped">{stoppedLabel(agent)}</Reading>
				</>
			)}
		</>
	);
}

interface AgentContextHistoryProps {
	readonly readings: Readings;
	readonly agent: AvailableSubAgent | undefined;
}

function AgentContextHistory({
	readings,
	agent,
}: AgentContextHistoryProps): React.JSX.Element {
	return (
		<section className="flex flex-col gap-1.5">
			<h3>
				<span className="text-12 text-muted-foreground">Context history</span>
			</h3>
			<ContextHistory
				readings={readings}
				laterTurns={agent?.laterTurns ?? []}
			/>
		</section>
	);
}

export { AgentDetail, SkillDetail };
