import { useId, useState } from "react";
import type { ReactNode } from "react";
import type { InferResponseType } from "hono/client";
import type {
	SessionHistoryCostReading,
	SessionHistoryRequestEntry,
	TextMeasurement,
} from "#benchmark/session-history";
import type { apiClient } from "#client/api-client";
import { cn } from "#client/system/cn";
import { SectionLabel } from "#client/system/components/section-label";
import { PaneHeading } from "./pane-heading";
import { categories, costLabel } from "./request-timeline";
import { selectableRow } from "./selectable-row";

export type AgentsResponse = InferResponseType<
	(typeof apiClient.api.attempts.session)[":caseId"][":uuid"]["history"]["agents"]["$get"],
	200
>;

type AvailableAgents = Extract<AgentsResponse, { state: "available" }>;
type Tree = AvailableAgents["tree"];
type SubAgent = Tree["agents"][number];
type AvailableSubAgent = Extract<SubAgent, { evidence: "available" }>;
type Allocation = AvailableAgents["cost"];
type AgentCost = Extract<Allocation, { state: "available" }>["root"];
type SkillCost = AgentCost["skills"][number];
type Readings = Tree["root"];

/** The root is the session itself; every other agent is named by its id. */
const ROOT_NAME = "Session root";

export interface ExcerptRequest {
	/** Absent for the root, whose events the attempt's own routes serve. */
	readonly agentId: string | undefined;
	readonly eventId: string;
}

type Selection =
	| { readonly kind: "agent"; readonly agentId: string | undefined }
	| {
			readonly kind: "skill";
			readonly agentId: string | undefined;
			readonly deliveryLine: number;
	  };

const tokens = new Intl.NumberFormat("en-US");

function sizeLabel(measurement: TextMeasurement): string {
	const unit = "recorded text characters, not tokens and not cost";
	if (measurement.state === "complete") {
		return `${tokens.format(measurement.characters)} ${unit}`;
	}
	if (measurement.state === "partial") {
		return `◐ Partial · ${tokens.format(measurement.observedCharacters)} observed ${unit} · ${measurement.reasons.join(", ")}`;
	}

	return `? Unavailable size · ${measurement.reasons.join(", ")}`;
}

export function agentName(agentId: string | undefined): string {
	return agentId ?? ROOT_NAME;
}

function agentLabel(agent: SubAgent): string {
	const inherited = agent.context === "inherited" ? "inherited" : undefined;
	if (agent.evidence === "unavailable") {
		return [agent.agentId, "evidence unavailable", inherited]
			.filter((part) => part !== undefined)
			.join(" · ");
	}

	return [
		agent.agentId,
		agent.agentType,
		agent.description,
		inherited,
		agent.stopped === true ? "stopped" : undefined,
	]
		.filter((part) => part !== undefined)
		.join(" · ");
}

function costOf(
	allocation: Allocation,
	agentId: string | undefined,
): AgentCost | undefined {
	if (allocation.state !== "available") {
		return undefined;
	}

	return agentId === undefined
		? allocation.root
		: allocation.agents.find((each) => each.agentId === agentId);
}

function readingOf(reading: SessionHistoryCostReading): string {
	return costLabel(reading);
}

function peakLabel(entries: readonly SessionHistoryRequestEntry[]): string {
	let peak: number | undefined;
	for (const entry of entries) {
		if (entry.usageState === "complete") {
			peak = Math.max(peak ?? 0, entry.totalInputTokens);
		}
	}

	return peak === undefined
		? "? Unavailable · no request in this agent carries settled usage"
		: `${tokens.format(peak)} total input tokens · the peak of this agent's own window, never summed with another agent's`;
}

function totalsLabel(readings: Readings): string {
	const totals = readings.series.attemptTotals;
	if (totals.state === "unavailable") {
		return `? Unavailable · ${totals.reasons.join(", ")}`;
	}
	if (totals.state === "incomplete") {
		return `◐ Incomplete · ${categories(totals.usage)} over ${totals.countedRequestCount} of ${totals.requestCount} requests`;
	}

	return categories(totals.usage);
}

function requestLabel(entry: SessionHistoryRequestEntry): string {
	const size =
		entry.usageState === "complete"
			? `${tokens.format(entry.totalInputTokens)} total input tokens`
			: `usage ${entry.usageState}`;

	return [
		`line ${entry.line}`,
		entry.requestId ?? "no request id",
		size,
		entry.model ?? "? Unavailable model",
	].join(" · ");
}

function Reading({
	term,
	children,
}: {
	readonly term: string;
	readonly children: ReactNode;
}): React.JSX.Element {
	const id = useId();

	return (
		<div className="flex flex-col gap-0.5">
			<dt id={id}>
				<SectionLabel>{term}</SectionLabel>
			</dt>
			<dd
				aria-labelledby={id}
				className="font-mono text-11-5 text-secondary-foreground"
			>
				{children}
			</dd>
		</div>
	);
}

function CostReadings({
	cost,
}: {
	readonly cost: AgentCost | undefined;
}): React.JSX.Element {
	if (cost === undefined) {
		return (
			<Reading term="Cost">
				Not part of the attempt's cost: this agent ran in the inherited prefix,
				before the attempt, or the attempt's cost is unavailable.
			</Reading>
		);
	}

	return (
		<>
			<Reading term="Own cost">
				{readingOf(cost.own.cost)} · basis: {cost.own.basis}
			</Reading>
			<Reading term="Including descendants">
				{readingOf(cost.includingDescendants.cost)} · basis:{" "}
				{cost.includingDescendants.basis}
				{cost.includingDescendants.childAgentIds.length === 0
					? ""
					: ` · children ${cost.includingDescendants.childAgentIds.join(", ")}`}
			</Reading>
			<Reading term="Shared remainder">
				{readingOf(cost.shared.cost)} · basis: {cost.shared.basis}
			</Reading>
			<Reading term="Unattributed remainder">
				{readingOf(cost.unattributed.cost)} · basis: {cost.unattributed.basis}
			</Reading>
			<Reading term="Provider count">
				{cost.provider.state === "reported"
					? `$${cost.provider.costUsd} on ${cost.provider.models.join(", ")} · basis: ${cost.provider.basis}`
					: `Not separable · ${cost.provider.reason}`}
			</Reading>
		</>
	);
}

function roleLabel(agent: AvailableSubAgent): string {
	const kind = agent.agentType === "reviewer" ? "Review agent" : "Sub-agent";

	return `${kind} · agent type ${agent.agentType ?? "not recorded"} · not a harness role (worker, Product Owner or Judge)`;
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

function ContextHistory({
	readings,
	laterTurns,
}: {
	readonly readings: Readings;
	readonly laterTurns: AvailableSubAgent["laterTurns"];
}): React.JSX.Element {
	const rows = [
		...readings.series.entries.map((entry) => ({
			line: entry.line,
			label: requestLabel(entry),
		})),
		...readings.series.compactions.map(({ line }) => ({
			line,
			label: `line ${line} · compaction`,
		})),
		...laterTurns.map(({ line, kind }) => ({
			line,
			label: `line ${line} · ${kind}`,
		})),
	].toSorted((left, right) => left.line - right.line);

	return (
		<ul aria-label="Context history" className="flex flex-col gap-1">
			{rows.map(({ line, label }) => (
				<li key={`${line}:${label}`} className="font-mono text-11-5">
					{label}
				</li>
			))}
			{rows.length === 0 ? (
				<li className="text-11-5 text-dim">No request recorded.</li>
			) : null}
		</ul>
	);
}

function LoadEvidence({
	agentId,
	readings,
	onOpenExcerpt,
}: {
	readonly agentId: string | undefined;
	readonly readings: Readings;
	readonly onOpenExcerpt: (request: ExcerptRequest) => void;
}): React.JSX.Element {
	const names = new Map(
		readings.deliveries.map(({ id, name }) => [id, name] as const),
	);

	return (
		<ul aria-label="Load evidence" className="flex flex-col gap-1.5">
			{readings.deliveryEvents.map(
				({ sourceId, eventId, ordinal, measurement }) => (
					<li key={eventId} className="flex flex-col gap-0.5">
						<span className="text-12">
							{names.get(sourceId) ?? sourceId} · delivery {ordinal} · event{" "}
							{eventId}
						</span>
						<small className="text-11-5 text-dim">
							{sizeLabel(measurement)}
						</small>
						<ExcerptButton
							onOpen={() => {
								onOpenExcerpt({ agentId, eventId });
							}}
						/>
					</li>
				),
			)}
			{readings.deliveryEvents.length === 0 ? (
				<li className="text-11-5 text-dim">No observed delivery.</li>
			) : null}
		</ul>
	);
}

function ExcerptButton({
	onOpen,
}: {
	readonly onOpen: () => void;
}): React.JSX.Element {
	return (
		<button
			type="button"
			className="self-start text-11-5 text-accent-foreground underline hover:text-foreground"
			onClick={onOpen}
		>
			Open excerpt
		</button>
	);
}

function AgentDetail({
	tree,
	allocation,
	agentId,
	onOpenExcerpt,
}: {
	readonly tree: Tree;
	readonly allocation: Allocation;
	readonly agentId: string | undefined;
	readonly onOpenExcerpt: (request: ExcerptRequest) => void;
}): React.JSX.Element {
	const agent = tree.agents.find((each) => each.agentId === agentId);
	if (agent?.evidence === "unavailable") {
		return (
			<dl className="flex flex-col gap-2">
				<Reading term="Agent">{agent.agentId}</Reading>
				<Reading term="Parent">{parentLabel(agent)}</Reading>
				<Reading term="Evidence">
					? Unavailable · the record holds no transcript for this agent, so
					coverage and every total including it read incomplete
				</Reading>
			</dl>
		);
	}

	const readings = agent ?? tree.root;

	return (
		<div className="flex flex-col gap-3">
			<dl className="flex flex-col gap-2">
				<Reading term="Agent">{agentName(agentId)}</Reading>
				<Reading term="Role">
					{agent === undefined
						? "Session root · the attempt's own session"
						: roleLabel(agent)}
				</Reading>
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
				<Reading term="Model">
					{readings.models.length === 0
						? "? Unavailable model"
						: readings.models.join(", ")}
				</Reading>
				<Reading term="Token categories">{totalsLabel(readings)}</Reading>
				<Reading term="Context peak">
					{peakLabel(readings.series.entries)}
				</Reading>
				<CostReadings cost={costOf(allocation, agentId)} />
			</dl>
			<section className="flex flex-col gap-1.5">
				<h3>
					<SectionLabel>Context history</SectionLabel>
				</h3>
				<ContextHistory
					readings={readings}
					laterTurns={agent?.laterTurns ?? []}
				/>
			</section>
			<section className="flex flex-col gap-1.5">
				<h3>
					<SectionLabel>Load evidence</SectionLabel>
				</h3>
				<LoadEvidence
					agentId={agentId}
					readings={readings}
					onOpenExcerpt={onOpenExcerpt}
				/>
			</section>
		</div>
	);
}

function SkillDetail({
	skill,
	agentId,
}: {
	readonly skill: SkillCost;
	readonly agentId: string | undefined;
}): React.JSX.Element {
	return (
		<dl className="flex flex-col gap-2">
			<Reading term="Skill">{skill.skill}</Reading>
			<Reading term="Invoked">
				{skill.invokedBy.by} in {agentName(agentId)} · delivered at line{" "}
				{skill.deliveryLine}
			</Reading>
			<Reading term="Own cost">
				{readingOf(skill.own.cost)} over {skill.own.requestLines.length}{" "}
				requests · basis: {skill.own.basis}
			</Reading>
			<Reading term="Including descendants">
				{readingOf(skill.includingDescendants.cost)}
				{skill.includingDescendants.childAgentIds.length === 0
					? " · no sub-agent"
					: ` · sub-agents ${skill.includingDescendants.childAgentIds.join(", ")}`}{" "}
				· basis: {skill.includingDescendants.basis}
			</Reading>
		</dl>
	);
}

function TreeButton({
	label,
	pressed,
	onSelect,
}: {
	readonly label: string;
	readonly pressed: boolean;
	readonly onSelect: () => void;
}): React.JSX.Element {
	return (
		<button
			type="button"
			aria-pressed={pressed}
			className={cn(selectableRow({ markedBy: "pressed" }), "text-12")}
			onClick={onSelect}
		>
			{label}
		</button>
	);
}

function SkillButtons({
	allocation,
	agentId,
	selection,
	onSelect,
}: {
	readonly allocation: Allocation;
	readonly agentId: string | undefined;
	readonly selection: Selection;
	readonly onSelect: (selection: Selection) => void;
}): React.JSX.Element | null {
	const skills = costOf(allocation, agentId)?.skills ?? [];
	if (skills.length === 0) {
		return null;
	}

	return (
		<ul className="pl-4">
			{skills.map((skill) => (
				<li key={skill.deliveryLine}>
					<TreeButton
						label={`Skill ${skill.skill} · own ${readingOf(skill.own.cost)}`}
						pressed={
							selection.kind === "skill" &&
							selection.agentId === agentId &&
							selection.deliveryLine === skill.deliveryLine
						}
						onSelect={() => {
							onSelect({
								kind: "skill",
								agentId,
								deliveryLine: skill.deliveryLine,
							});
						}}
					/>
				</li>
			))}
		</ul>
	);
}

function parentIdOf(agent: SubAgent): string | undefined {
	return agent.parent.state === "agent" ? agent.parent.agentId : undefined;
}

function AgentBranch({
	tree,
	allocation,
	agentId,
	selection,
	onSelect,
}: {
	readonly tree: Tree;
	readonly allocation: Allocation;
	readonly agentId: string | undefined;
	readonly selection: Selection;
	readonly onSelect: (selection: Selection) => void;
}): React.JSX.Element {
	const children = tree.agents.filter(
		(agent) =>
			agent.parent.state !== "unlinked" && parentIdOf(agent) === agentId,
	);
	const agent = tree.agents.find((each) => each.agentId === agentId);
	const label =
		agent === undefined
			? `${ROOT_NAME} · ${tree.root.models.join(", ")}`
			: agentLabel(agent);

	return (
		<li aria-label={agentName(agentId)}>
			<TreeButton
				label={label}
				pressed={selection.kind === "agent" && selection.agentId === agentId}
				onSelect={() => {
					onSelect({ kind: "agent", agentId });
				}}
			/>
			<SkillButtons
				allocation={allocation}
				agentId={agentId}
				selection={selection}
				onSelect={onSelect}
			/>
			{children.length === 0 ? null : (
				<ul className="pl-4">
					{children.map((child) => (
						<AgentBranch
							key={child.agentId}
							tree={tree}
							allocation={allocation}
							agentId={child.agentId}
							selection={selection}
							onSelect={onSelect}
						/>
					))}
				</ul>
			)}
		</li>
	);
}

function coverageLabel(tree: Tree): string {
	return tree.coverage.state === "complete"
		? "✓ Complete · every agent the transcripts name has a kept transcript"
		: `◐ Incomplete · no kept transcript for ${tree.coverage.unavailableAgentIds.join(", ")} · totals that include them read incomplete`;
}

function ReceivingAgents({
	tree,
	sourceId,
	onOpenExcerpt,
}: {
	readonly tree: Tree;
	readonly sourceId: string;
	readonly onOpenExcerpt: (request: ExcerptRequest) => void;
}): React.JSX.Element {
	const receivers = [
		{ agentId: undefined, readings: tree.root },
		...tree.agents.flatMap((agent) =>
			agent.evidence === "available"
				? [{ agentId: agent.agentId, readings: agent }]
				: [],
		),
	]
		.map(({ agentId, readings }) => ({
			agentId,
			deliveries: readings.deliveryEvents.filter(
				(delivery) => delivery.sourceId === sourceId,
			),
		}))
		.filter(({ deliveries }) => deliveries.length > 0);

	return (
		<section
			aria-label="Receiving agents"
			className="flex flex-col gap-2 border-b px-3 py-3"
		>
			<h3>
				<SectionLabel>Receiving agents</SectionLabel>
			</h3>
			<p className="text-11-5 text-dim">
				Sizes are recorded text characters, not tokens and not cost. Cost is
				read per agent and skill below.
			</p>
			<ul className="flex flex-col gap-2">
				{receivers.map(({ agentId, deliveries }) => (
					<li
						key={agentName(agentId)}
						aria-label={agentName(agentId)}
						className="flex flex-col gap-1"
					>
						<span className="text-12">
							{agentName(agentId)} · {deliveries.length}{" "}
							{deliveries.length === 1 ? "delivery" : "deliveries"}
							{deliveries.length > 1 ? " · repeated" : ""}
						</span>
						<ul className="flex flex-col gap-1 pl-4">
							{deliveries.map(({ eventId, ordinal, measurement }) => (
								<li key={eventId} className="flex flex-col gap-0.5">
									<small className="text-11-5 text-dim">
										delivery {ordinal} · event {eventId} ·{" "}
										{sizeLabel(measurement)}
									</small>
									<ExcerptButton
										onOpen={() => {
											onOpenExcerpt({ agentId, eventId });
										}}
									/>
								</li>
							))}
						</ul>
					</li>
				))}
				{receivers.length === 0 ? (
					<li className="text-11-5 text-dim">
						No agent's transcript records a delivery of this source.
					</li>
				) : null}
			</ul>
		</section>
	);
}

function SelectedDetail({
	tree,
	allocation,
	selection,
	onOpenExcerpt,
}: {
	readonly tree: Tree;
	readonly allocation: Allocation;
	readonly selection: Selection;
	readonly onOpenExcerpt: (request: ExcerptRequest) => void;
}): React.JSX.Element {
	if (selection.kind === "skill") {
		const skill = costOf(allocation, selection.agentId)?.skills.find(
			({ deliveryLine }) => deliveryLine === selection.deliveryLine,
		);

		return skill === undefined ? (
			<p className="text-11-5 text-dim">This skill has no cost reading.</p>
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
		/>
	);
}

/**
 * The agents a saved attempt ran, each with its own context and cost, and,
 * for a selected source, the agents it reached. Every agent's readings stay
 * in its own lane: agents running at once held separate windows.
 */
export function AgentTreePane({
	agents,
	sourceId,
	excerpt,
	onOpenExcerpt,
}: {
	readonly agents: AvailableAgents;
	readonly sourceId: string | undefined;
	readonly excerpt: ReactNode;
	readonly onOpenExcerpt: (request: ExcerptRequest) => void;
}): React.JSX.Element {
	const [selection, setSelection] = useState<Selection>({
		kind: "agent",
		agentId: undefined,
	});
	const { tree, cost } = agents;
	const unlinked = tree.agents.filter(
		(agent) => agent.parent.state === "unlinked",
	);

	return (
		<section
			aria-label="Agents"
			className="flex flex-col rounded-lg border bg-card"
		>
			<PaneHeading>Agents</PaneHeading>
			<div className="flex flex-col gap-1 border-b px-3 py-2.5">
				<p
					role="status"
					aria-label="Agent coverage"
					className="font-mono text-11-5 text-secondary-foreground"
				>
					Coverage {coverageLabel(tree)}
				</p>
				<p
					role="status"
					aria-label="Calculated attempt total"
					className="font-mono text-11-5 text-secondary-foreground"
				>
					Calculated attempt total, each request once:{" "}
					{cost.state === "available"
						? readingOf(cost.calculated)
						: `? Unavailable · ${cost.reasons.join(", ")}`}
				</p>
			</div>
			{sourceId === undefined ? null : (
				<ReceivingAgents
					tree={tree}
					sourceId={sourceId}
					onOpenExcerpt={onOpenExcerpt}
				/>
			)}
			<div className="flex min-h-96 overflow-x-auto">
				<nav aria-label="Agent tree" className="min-w-72 flex-5 border-r">
					<ul>
						<AgentBranch
							tree={tree}
							allocation={cost}
							agentId={undefined}
							selection={selection}
							onSelect={setSelection}
						/>
						{unlinked.map((agent) => (
							<li key={agent.agentId} aria-label={agent.agentId}>
								<TreeButton
									label={`${agentLabel(agent)} · unlinked`}
									pressed={
										selection.kind === "agent" &&
										selection.agentId === agent.agentId
									}
									onSelect={() => {
										setSelection({ kind: "agent", agentId: agent.agentId });
									}}
								/>
							</li>
						))}
					</ul>
				</nav>
				<section
					aria-label="Selected in the agent tree"
					className="min-w-92 flex-8 border-r px-3 py-3"
				>
					<SelectedDetail
						tree={tree}
						allocation={cost}
						selection={selection}
						onOpenExcerpt={onOpenExcerpt}
					/>
				</section>
				<section aria-label="Delivery excerpt" className="min-w-80 flex-7">
					<PaneHeading>Delivery excerpt</PaneHeading>
					{excerpt}
				</section>
			</div>
		</section>
	);
}
