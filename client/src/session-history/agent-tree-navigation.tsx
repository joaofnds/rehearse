import cn from "#client/system/cn";

import type { Allocation, Selection, SubAgent, Tree } from "./agent-tree-model";
import {
	EMPTY_COLLECTION_LENGTH,
	ROOT_NAME,
	agentLabel,
	agentName,
	costOf,
	forkedSkillOf,
} from "./agent-tree-model";
import { costLabel } from "./request-timeline";
import selectableRow from "./selectable-row";

interface TreeButtonProps {
	readonly label: string;
	readonly pressed: boolean;
	readonly onSelect: () => void;
}

function TreeButton({
	label,
	pressed,
	onSelect,
}: TreeButtonProps): React.JSX.Element {
	return (
		<button
			type="button"
			aria-pressed={pressed}
			className={cn(
				selectableRow({ markedBy: "pressed" }),
				"font-mono text-14",
			)}
			onClick={onSelect}
		>
			{label}
		</button>
	);
}

interface SkillButtonsProps {
	readonly allocation: Allocation;
	readonly agentId: string | undefined;
	readonly selection: Selection;
	readonly onSelect: (selection: Selection) => void;
}

function SkillButtons({
	allocation,
	agentId,
	selection,
	onSelect,
}: SkillButtonsProps): React.JSX.Element | null {
	const skills = costOf(allocation, agentId)?.skills ?? [];
	if (skills.length === EMPTY_COLLECTION_LENGTH) {
		return null;
	}

	return (
		<ul className="pl-4">
			{skills.map((skill) => (
				<li key={skill.deliveryLine}>
					<TreeButton
						label={`Skill ${skill.skill} · own ${costLabel(skill.own.cost)}`}
						pressed={
							selection.kind === "skill" &&
							selection.agentId === agentId &&
							selection.deliveryLine === skill.deliveryLine
						}
						onSelect={() => {
							onSelect({
								agentId,
								deliveryLine: skill.deliveryLine,
								kind: "skill",
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

/**
 * The agents no chain of parents links to the root: unlinked ones, and ones
 * whose recorded parent is missing from the tree or loops back on itself.
 */
function detachedAgents(tree: Tree): readonly SubAgent[] {
	const reached = new Set<string | undefined>([undefined]);
	let grew = true;
	while (grew) {
		const next = tree.agents.filter(
			(agent) =>
				!reached.has(agent.agentId) &&
				agent.parent.state !== "unlinked" &&
				reached.has(parentIdOf(agent)),
		);
		for (const agent of next) {
			reached.add(agent.agentId);
		}
		grew = next.length > EMPTY_COLLECTION_LENGTH;
	}

	return tree.agents.filter((agent) => !reached.has(agent.agentId));
}

function detachedLabel(agent: SubAgent): string {
	const parentId = parentIdOf(agent);

	return parentId === undefined
		? `${agentLabel(agent)} · unlinked`
		: `${agentLabel(agent)} · parent ${parentId} not linked to the root`;
}

interface AgentBranchProps {
	readonly tree: Tree;
	readonly allocation: Allocation;
	readonly agentId: string | undefined;
	readonly selection: Selection;
	readonly onSelect: (selection: Selection) => void;
}

function AgentBranch({
	tree,
	allocation,
	agentId,
	selection,
	onSelect,
}: AgentBranchProps): React.JSX.Element {
	const children = tree.agents.filter(
		(agent) =>
			agent.parent.state !== "unlinked" && parentIdOf(agent) === agentId,
	);
	const agent = tree.agents.find((each) => each.agentId === agentId);
	const label =
		agent === undefined
			? `${ROOT_NAME} · ${tree.root.models.join(", ")}`
			: agentLabel(agent, forkedSkillOf(allocation, agent.agentId));

	return (
		<li aria-label={agentName(agentId)}>
			<TreeButton
				label={label}
				pressed={selection.kind === "agent" && selection.agentId === agentId}
				onSelect={() => {
					onSelect({ agentId, kind: "agent" });
				}}
			/>
			<SkillButtons
				allocation={allocation}
				agentId={agentId}
				selection={selection}
				onSelect={onSelect}
			/>
			{children.length === EMPTY_COLLECTION_LENGTH ? null : (
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

interface AgentTreeNavigationProps {
	readonly tree: Tree;
	readonly cost: Allocation;
	readonly selection: Selection;
	readonly setSelection: (selection: Selection) => void;
	readonly detached: readonly SubAgent[];
}

function AgentTreeNavigation({
	tree,
	cost,
	selection,
	setSelection,
	detached,
}: AgentTreeNavigationProps): React.JSX.Element {
	return (
		<nav aria-label="Agent tree" className="max-h-48 overflow-auto border-b">
			<ul>
				<AgentBranch
					tree={tree}
					allocation={cost}
					agentId={undefined}
					selection={selection}
					onSelect={setSelection}
				/>
				{detached.map((agent) => (
					<li key={agent.agentId} aria-label={agent.agentId}>
						<TreeButton
							label={detachedLabel(agent)}
							pressed={
								selection.kind === "agent" &&
								selection.agentId === agent.agentId
							}
							onSelect={() => {
								setSelection({ agentId: agent.agentId, kind: "agent" });
							}}
						/>
					</li>
				))}
			</ul>
		</nav>
	);
}

export { AgentTreeNavigation, detachedAgents };
