import type {
	AgentCost,
	AgentCostInput,
	AttemptCostAllocation,
	SkillInvocationCost,
	SubAgentCost,
} from "./agent-cost-contract";
import {
	childrenOf,
	descendantTally,
	descendantTotal,
	descendantTotals,
} from "./agent-cost-descendants";
import { ROOT, forkedSkillOf, participantsOf } from "./agent-cost-participants";
import type { Owner, Participant } from "./agent-cost-participants";
import {
	modelCosts,
	modelsBeforeAttempt,
	providerCost,
} from "./agent-cost-provider";
import {
	reading,
	readingOf,
	summed,
	tally,
	unavailableAgentReason,
} from "./agent-cost-tally";
import type { Tally } from "./agent-cost-tally";
import { allocate, linesWhere, ownTally } from "./agent-request-cost";
import type { Allocation } from "./agent-request-cost";
import agentTree from "./agent-tree";
import type { AgentTree, SubAgent } from "./agent-tree";
import type { ClaudeCallMetrics, Immutable } from "./contracts";
import type { SkillWindow } from "./skill-cost-windows";

const EXCLUSIVE_SKILL_INVOCATION_COUNT = 1;

const SKILL_WINDOW_BASIS =
	"from the skill's delivery until the next skill delivery, user prompt or interruption, or the transcript's end; the transcript records no skill end.";

const OWN_BASIS = "every attempt request in the agent's own transcript";

const SHARED_BASIS =
	"requests after one request delivered more than one skill; not split between them";

const UNATTRIBUTED_BASIS = "requests outside every skill window";

const BOUNDARY_ABSENT = "the transcript carries no attempt boundary";

type ReportedUsage = NonNullable<ClaudeCallMetrics["modelUsage"]>[string];

interface Ledger {
	readonly agents: readonly SubAgent[];
	readonly allocations: ReadonlyMap<Owner, Allocation>;
	/** Absent when a prefix request's model is unknown. */
	readonly modelsBeforeAttempt: ReadonlySet<string> | undefined;
	readonly unmodeled: boolean;
	readonly modelUsage: ReadonlyMap<string, ReportedUsage>;
	readonly coverageComplete: boolean;
	readonly totals: ReadonlyMap<Owner, Tally>;
}

function skillCosts(
	allocation: Readonly<Allocation>,
	children: Immutable<readonly SubAgent[]>,
	totals: ReadonlyMap<Owner, Tally>,
): readonly SkillInvocationCost[] {
	return allocation.windows
		.filter(
			({ invocations }) =>
				invocations.length === EXCLUSIVE_SKILL_INVOCATION_COUNT,
		)
		.flatMap((window) => {
			const requestLines = linesWhere(allocation, (each) => each === window);
			const own = tally(requestLines, allocation.costs);
			const launched = children.filter(({ launchCallLine }) => {
				const request =
					launchCallLine === undefined
						? undefined
						: allocation.requestOf(launchCallLine);

				return (
					request !== undefined &&
					allocation.windowByRequest.get(request) === window
				);
			});

			return window.invocations.map((invocation): SkillInvocationCost => ({
				deliveryLine: invocation.deliveryLine,
				includingDescendants: descendantTotal(
					descendantTally(own, launched, totals),
					launched,
				),
				invokedBy: invocation.invokedBy,
				own: { basis: SKILL_WINDOW_BASIS, cost: readingOf(own), requestLines },
				skill: invocation.skill,
			}));
		});
}

function isSharedSkillWindow(
	window: Immutable<SkillWindow> | undefined,
): boolean {
	return (
		window !== undefined &&
		window.invocations.length > EXCLUSIVE_SKILL_INVOCATION_COUNT
	);
}

function agentCost(owner: Owner, ledger: Readonly<Ledger>): AgentCost {
	const allocation = ledger.allocations.get(owner);
	const total = ledger.totals.get(owner);
	if (allocation === undefined || total === undefined) {
		throw new Error(
			"every agent with a transcript has an allocation and a total",
		);
	}

	const children = childrenOf(owner, ledger.agents);
	const own = ownTally(allocation);
	const sharedLines = linesWhere(allocation, isSharedSkillWindow);
	const unattributedLines = linesWhere(
		allocation,
		(window) => window === undefined,
	);

	return {
		includingDescendants: descendantTotal(total, children),
		own: {
			basis: OWN_BASIS,
			cost: readingOf(own),
			requestLines: [...allocation.windowByRequest.keys()],
		},
		provider: providerCost(owner, allocation, ledger),
		shared: {
			basis: SHARED_BASIS,
			cost: reading(sharedLines, allocation.costs),
			requestLines: sharedLines,
			skills: allocation.windows
				.filter(isSharedSkillWindow)
				.flatMap(({ invocations }) => invocations.map(({ skill }) => skill)),
		},
		skills: skillCosts(allocation, children, ledger.totals),
		unattributed: {
			basis: UNATTRIBUTED_BASIS,
			cost: reading(unattributedLines, allocation.costs),
			requestLines: unattributedLines,
		},
	};
}

function subagentCosts(
	participants: ReadonlyMap<Owner, Participant>,
	ledger: Readonly<Ledger>,
): SubAgentCost[] {
	const agents: SubAgentCost[] = [];
	for (const { owner, agent } of participants.values()) {
		if (owner !== ROOT && agent !== undefined) {
			agents.push({
				agentId: agent.agentId,
				forkedSkill: forkedSkillOf(agent, participants),
				...agentCost(owner, ledger),
			});
		}
	}

	return agents;
}

/**
 * Allocates each attempt request's calculated cost to one agent and, within
 * it, to one skill window, the shared remainder or the unattributed remainder,
 * and gives each skill and agent a total including its descendants. The
 * provider's per-model count is shown beside the calculated one, and reaches
 * an agent only where it ran alone on its models. A caller that already
 * built the input's tree passes it, so the tree is not built twice.
 */
function agentCostAllocation(
	input: Immutable<AgentCostInput>,
	tree: Immutable<AgentTree> = agentTree(input),
): AttemptCostAllocation {
	if (tree.root.series.boundary === "unknown") {
		return { reasons: [BOUNDARY_ABSENT], state: "unavailable" };
	}

	const participants = participantsOf(input, tree);
	const allocations = new Map<Owner, Allocation>(
		[...participants].map(([owner, participant]) => [
			owner,
			allocate(participant, input.rates),
		]),
	);
	const ledger: Ledger = {
		agents: tree.agents,
		allocations,
		coverageComplete: tree.coverage.state === "complete",
		modelUsage: new Map(Object.entries(input.modelUsage ?? {})),
		modelsBeforeAttempt: modelsBeforeAttempt(tree),
		totals: descendantTotals(tree.agents, allocations),
		unmodeled: [...allocations.values()].some(({ models }) =>
			models.has(undefined),
		),
	};
	const missing =
		tree.coverage.state === "incomplete"
			? tree.coverage.unavailableAgentIds.map(unavailableAgentReason)
			: [];

	const agents = subagentCosts(participants, ledger);

	return {
		agents,
		byModel: modelCosts(ledger, missing),
		calculated: readingOf(
			summed(
				[...allocations.values()].map((allocation) => ownTally(allocation)),
				missing,
			),
		),
		root: agentCost(ROOT, ledger),
		state: "available",
	};
}
export { agentCostAllocation as default };
export type { Ledger };
export type {
	CostScope,
	DescendantTotal,
	SkillInvoker,
	SkillInvocationCost,
	ProviderAgentCost,
	AgentCost,
	SubAgentCost,
	ModelCost,
	AttemptCostAllocation,
	AgentCostInput,
} from "./agent-cost-contract";
