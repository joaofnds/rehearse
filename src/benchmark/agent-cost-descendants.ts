import type { DescendantTotal } from "./agent-cost-contract";
import { ROOT } from "./agent-cost-participants";
import type { Owner } from "./agent-cost-participants";
import { readingOf, summed, unavailableAgentReason } from "./agent-cost-tally";
import type { Tally } from "./agent-cost-tally";
import { ownTally } from "./agent-request-cost";
import type { Allocation } from "./agent-request-cost";
import type { SubAgent } from "./agent-tree";
import type { Immutable } from "./contracts";

const DESCENDANTS_BASIS =
	"own cost plus each descendant's total; never added into the attempt total";

function childrenOf(
	owner: Owner,
	agents: Immutable<readonly SubAgent[]>,
): readonly SubAgent[] {
	return agents.filter(({ parent, context }) => {
		if (context === "inherited") {
			return false;
		}

		return owner === ROOT
			? parent.state === "root"
			: parent.state === "agent" && parent.agentId === owner;
	});
}

function descendantTally(
	own: Immutable<Tally>,
	children: Immutable<readonly SubAgent[]>,
	totals: ReadonlyMap<Owner, Tally>,
): Tally {
	const parts: Tally[] = [own];
	const missing: string[] = [];

	for (const { agentId, evidence } of children) {
		const total = totals.get(agentId);
		if (evidence === "available" && total !== undefined) {
			parts.push(total);
		} else {
			missing.push(unavailableAgentReason(agentId));
		}
	}

	return summed(parts, missing);
}

function descendantTotal(
	total: Immutable<Tally>,
	children: Immutable<readonly SubAgent[]>,
): DescendantTotal {
	return {
		basis: DESCENDANTS_BASIS,
		childAgentIds: children.map(({ agentId }) => agentId),
		cost: readingOf(total),
	};
}

function loopsBack(
	agentId: string,
	agents: Immutable<readonly SubAgent[]>,
): boolean {
	const parents = new Map(
		agents.map(({ agentId: id, parent }) => [id, parent]),
	);
	const seen = new Set<string>();
	let parent = parents.get(agentId);
	while (parent?.state === "agent") {
		if (seen.has(parent.agentId)) {
			return true;
		}

		seen.add(parent.agentId);
		parent = parents.get(parent.agentId);
	}

	return false;
}

/**
 * Each agent's total including descendants, children before parents. An
 * agent whose parent links loop, which only a hostile meta file could
 * produce, has no descendants to sum and reads its own cost, incomplete.
 * Every descendant of an agent outside a loop is outside it too.
 */
function descendantTotals(
	agents: Immutable<readonly SubAgent[]>,
	allocations: ReadonlyMap<Owner, Allocation>,
): ReadonlyMap<Owner, Tally> {
	const totals = new Map<Owner, Tally>();
	const visit = (owner: Owner): void => {
		const allocation = allocations.get(owner);
		if (totals.has(owner) || allocation === undefined) {
			return;
		}

		if (owner !== ROOT && loopsBack(owner, agents)) {
			totals.set(
				owner,
				summed(
					[ownTally(allocation)],
					[`the parent links of sub-agent ${owner} loop back to it`],
				),
			);
			return;
		}

		const children = childrenOf(owner, agents);
		for (const child of children) {
			visit(child.agentId);
		}
		totals.set(owner, descendantTally(ownTally(allocation), children, totals));
	};
	for (const owner of allocations.keys()) {
		visit(owner);
	}

	return totals;
}
export { childrenOf, descendantTally, descendantTotal, descendantTotals };
