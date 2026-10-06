import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { agentCostAllocation } from "#benchmark/agent-cost";
import type {
	AgentCost,
	AttemptCostAllocation,
	SkillInvocationCost,
	SubAgentCost,
} from "#benchmark/agent-cost";
import { agentTree } from "#benchmark/agent-tree";
import type { AgentTreeInput, SubagentEvidence } from "#benchmark/agent-tree";
import type { ClaudeCallMetrics, ClaudeModelUsage } from "#benchmark/contracts";
import { UNPRICED_REASONS } from "#benchmark/context-evidence-contract";
import { committedRateCatalog } from "#benchmark/rate-catalog";
import { sessionHistoryAttemptCost } from "#benchmark/session-history";
import type { SessionHistoryCostReading } from "#benchmark/session-history";
import { recordedSubagents } from "#benchmark/subagent-evidence";

const FIXTURE = join(import.meta.dir, "__fixtures__", "agent-tree");
const INHERITED_PREFIX_LINES = 3;
/** The fixture transcript up to, and not including, a4's launch. */
const LINES_BEFORE_A4_LAUNCH = 19;
/** The fixture transcript up to, and not including, review-docs' request. */
const LINES_BEFORE_SECOND_SKILL_REQUEST = 11;

interface FixtureOverrides {
	readonly prefixLinesExcluded?: number | undefined;
	readonly transcript?: (lines: readonly string[]) => readonly string[];
	readonly rates?: AllocationRates;
	readonly modelUsage?: ClaudeCallMetrics["modelUsage"];
	readonly subagents?: (
		recorded: readonly SubagentEvidence[],
	) => readonly SubagentEvidence[];
}

type AllocationRates = Parameters<typeof agentCostAllocation>[0]["rates"];

async function fixtureInput(
	overrides: FixtureOverrides = {},
): Promise<AgentTreeInput> {
	const transcript = await Bun.file(join(FIXTURE, "transcript.jsonl")).text();
	const lines = transcript.split("\n");
	const recorded = await recordedSubagents(FIXTURE);

	return {
		attempt: {
			kind: "session",
			caseId: "case-a",
			id: "attempt-a",
			model: "sonnet",
			outcome: "SUCCESSFUL",
			corpusFiles: [],
		},
		resolvedCorpusFiles: [],
		transcript: (overrides.transcript?.(lines) ?? lines).join("\n"),
		prefixLinesExcluded:
			"prefixLinesExcluded" in overrides
				? overrides.prefixLinesExcluded
				: INHERITED_PREFIX_LINES,
		subagents: overrides.subagents?.(recorded) ?? recorded,
	};
}

async function fixtureAllocation(
	overrides: FixtureOverrides = {},
): Promise<AttemptCostAllocation> {
	return agentCostAllocation({
		...(await fixtureInput(overrides)),
		rates: overrides.rates ?? committedRateCatalog,
		modelUsage: overrides.modelUsage,
	});
}

function available(
	allocation: AttemptCostAllocation,
): Extract<AttemptCostAllocation, { state: "available" }> {
	if (allocation.state !== "available") {
		throw new Error(`allocation is ${allocation.state}`);
	}

	return allocation;
}

function agent(
	allocation: AttemptCostAllocation,
	agentId: string,
): SubAgentCost {
	const found = available(allocation).agents.find(
		(each) => each.agentId === agentId,
	);
	if (found === undefined) {
		throw new Error(`no cost for ${agentId}`);
	}

	return found;
}

function costOf(reading: SessionHistoryCostReading): number {
	return reading.state === "unavailable" ? Number.NaN : reading.costUsd;
}

function reasonsOf(reading: SessionHistoryCostReading): readonly string[] {
	return reading.state === "complete" ? [] : reading.reasons;
}

function partsOf(each: AgentCost): number {
	return (
		each.skills.reduce((sum, skill) => sum + costOf(skill.own.cost), 0) +
		costOf(each.shared.cost) +
		costOf(each.unattributed.cost)
	);
}

function skillNamed(each: AgentCost, skill: string): SkillInvocationCost {
	const found = each.skills.find((invocation) => invocation.skill === skill);
	if (found === undefined) {
		throw new Error(`no invocation of ${skill}`);
	}

	return found;
}

describe(agentCostAllocation.name, () => {
	it("totals the attempt as every agent's skills, shared and unattributed costs", async () => {
		const allocation = available(await fixtureAllocation());

		const parts = [allocation.root, ...allocation.agents].reduce(
			(sum, each) => sum + partsOf(each),
			0,
		);

		expect(costOf(allocation.calculated)).toBeCloseTo(parts, 2);
	});

	it("prices each attempt request once and none from the inherited prefix", async () => {
		const input = await fixtureInput();
		const tree = agentTree(input);
		const oracle = [
			tree.root.series,
			...tree.agents
				.filter((each) => each.evidence === "available")
				.filter((each) => each.context !== "inherited")
				.map(({ series }) => series),
		].reduce(
			(sum, series) =>
				sum +
				costOf(
					sessionHistoryAttemptCost({
						series,
						reportedCostUsd: undefined,
						rates: committedRateCatalog,
					}).calculated,
				),
			0,
		);

		const allocation = available(await fixtureAllocation());

		expect(allocation.agents.map(({ agentId }) => agentId)).toEqual([
			"a1",
			"a2",
			"a3",
			"a5",
		]);
		expect(costOf(allocation.calculated)).toBeCloseTo(oracle, 10);
	});

	it("totals the attempt from own costs only", async () => {
		const allocation = available(await fixtureAllocation());

		const owns = [allocation.root, ...allocation.agents].reduce(
			(sum, each) => sum + costOf(each.own.cost),
			0,
		);

		expect(costOf(allocation.calculated)).toBeCloseTo(owns, 10);
	});

	it("charges a skill the requests that start inside its window", async () => {
		const allocation = available(await fixtureAllocation());

		expect(skillNamed(allocation.root, "review").own.requestLines).toEqual([
			8, 12,
		]);
	});

	it("gives a skill its own cost plus its sub-agents' totals", async () => {
		const allocation = await fixtureAllocation();

		const review = skillNamed(available(allocation).root, "review");

		expect(review.includingDescendants.childAgentIds).toEqual(["a1", "a2"]);
		expect(costOf(review.includingDescendants.cost)).toBeCloseTo(
			costOf(review.own.cost) +
				costOf(agent(allocation, "a1").includingDescendants.cost) +
				costOf(agent(allocation, "a2").includingDescendants.cost),
			10,
		);
	});

	it("gives a sub-agent its own cost plus its descendants' totals", async () => {
		const allocation = await fixtureAllocation();

		const a2 = agent(allocation, "a2");

		expect(a2.includingDescendants.childAgentIds).toEqual(["a3"]);
		expect(costOf(a2.includingDescendants.cost)).toBeCloseTo(
			costOf(a2.own.cost) +
				costOf(agent(allocation, "a3").includingDescendants.cost),
			10,
		);
	});

	it("labels each reading with the basis of its allocation", async () => {
		const allocation = available(await fixtureAllocation());

		const review = skillNamed(allocation.root, "review");

		expect({
			skill: review.own.basis,
			includingDescendants: review.includingDescendants.basis,
			shared: allocation.root.shared.basis,
			unattributed: allocation.root.unattributed.basis,
		}).toEqual({
			skill:
				"delivery-to-next-boundary window; the transcript records no skill end.",
			includingDescendants:
				"own cost plus each descendant's total; never added into the attempt total",
			shared:
				"requests after one request delivered more than one skill; not split between them",
			unattributed: "requests outside every skill window",
		});
	});

	it("charges requests after a request that delivered two skills to the shared remainder", async () => {
		const allocation = available(await fixtureAllocation());

		expect({
			lines: allocation.root.shared.requestLines,
			skills: allocation.root.shared.skills,
		}).toEqual({ lines: [18, 20, 22], skills: ["review-docs", "verify"] });
	});

	it("leaves requests outside every skill window unattributed", async () => {
		const allocation = await fixtureAllocation();

		expect({
			root: available(allocation).root.unattributed.requestLines,
			a1: agent(allocation, "a1").unattributed.requestLines,
		}).toEqual({ root: [5], a1: [2, 5] });
	});

	it("shows a forked skill as its agent", async () => {
		const allocation = await fixtureAllocation();

		expect(agent(allocation, "a5").forkedSkill).toBe("code-review");
	});

	describe("when a prompt follows a skill's delivery", () => {
		it("closes the skill's window at the prompt", async () => {
			const prompt = JSON.stringify({
				type: "user",
				message: { role: "user", content: "now the docs" },
				cwd: "/work",
			});

			const allocation = available(
				await fixtureAllocation({
					transcript: (lines) => [
						...lines.slice(0, LINES_BEFORE_SECOND_SKILL_REQUEST),
						prompt,
						...lines.slice(LINES_BEFORE_SECOND_SKILL_REQUEST),
					],
				}),
			);

			expect({
				review: skillNamed(allocation.root, "review").own.requestLines,
				unattributed: allocation.root.unattributed.requestLines,
			}).toEqual({ review: [8], unattributed: [5, 13] });
		});
	});

	describe("when a compaction follows a skill's delivery", () => {
		it("keeps the skill's window open", async () => {
			const compaction = [
				{
					type: "system",
					subtype: "compact_boundary",
					content: "Conversation compacted",
					compactMetadata: { trigger: "auto", preTokens: 1870 },
				},
				{
					type: "user",
					message: { role: "user", content: "This session is continued." },
					isCompactSummary: true,
				},
			].map((row) => JSON.stringify(row));

			const allocation = available(
				await fixtureAllocation({
					transcript: (lines) => [
						...lines.slice(0, LINES_BEFORE_SECOND_SKILL_REQUEST),
						...compaction,
						...lines.slice(LINES_BEFORE_SECOND_SKILL_REQUEST),
					],
				}),
			);

			expect(skillNamed(allocation.root, "review").own.requestLines).toEqual([
				8, 14,
			]);
		});
	});

	describe("when a child's model has no catalogued rate", () => {
		const sonnetOnly = {
			...committedRateCatalog,
			models: committedRateCatalog.models.filter(
				({ model }) => model === "claude-sonnet-5",
			),
		};

		it("reads the child's calculated cost incomplete for the missing rate", async () => {
			const allocation = await fixtureAllocation({ rates: sonnetOnly });

			const { cost } = agent(allocation, "a2").own;

			expect(cost.state).toBe("incomplete");
			expect(reasonsOf(cost)).toContain(UNPRICED_REASONS["rates-missing"]);
		});

		it("still shows the provider's cost for that model", async () => {
			const allocation = available(
				await fixtureAllocation({
					rates: sonnetOnly,
					modelUsage: { "claude-opus-5": modelUsage(0.03) },
				}),
			);

			const opus = allocation.byModel.find(
				({ model }) => model === "claude-opus-5",
			);

			expect(opus?.reported).toEqual({ state: "complete", costUsd: 0.03 });
			expect(opus?.calculated.state).toBe("incomplete");
			expect(opus && reasonsOf(opus.calculated)).toContain(
				UNPRICED_REASONS["rates-missing"],
			);
		});
	});

	describe("when every agent's transcript was kept", () => {
		const withoutA4 = {
			transcript: (lines: readonly string[]) =>
				lines.slice(0, LINES_BEFORE_A4_LAUNCH),
			modelUsage: {
				"claude-sonnet-5": modelUsage(0.04),
				"claude-opus-5": modelUsage(0.03),
			},
		};

		it("shows the provider's cost per model beside the calculated one", async () => {
			const allocation = available(await fixtureAllocation(withoutA4));

			expect(
				allocation.byModel.map(({ model, reported, calculated }) => ({
					model,
					reported,
					calculated: calculated.state,
				})),
			).toEqual([
				{
					model: "claude-opus-5",
					reported: { state: "complete", costUsd: 0.03 },
					calculated: "incomplete",
				},
				{
					model: "claude-sonnet-5",
					reported: { state: "complete", costUsd: 0.04 },
					calculated: "complete",
				},
			]);
		});

		it("gives an agent alone on its model the provider's count for it", async () => {
			const allocation = await fixtureAllocation(withoutA4);

			expect(agent(allocation, "a2").provider).toEqual({
				state: "reported",
				costUsd: 0.03,
				models: ["claude-opus-5"],
			});
		});

		it("ignores a model that only carried requests with no usage", async () => {
			const synthetic = JSON.stringify({
				type: "assistant",
				requestId: "req-a2-synthetic",
				message: {
					model: "<synthetic>",
					role: "assistant",
					stop_reason: "stop_sequence",
					content: [{ type: "text", text: "No response requested." }],
					usage: {
						input_tokens: 0,
						output_tokens: 0,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 0,
						cache_creation: {
							ephemeral_5m_input_tokens: 0,
							ephemeral_1h_input_tokens: 0,
						},
					},
				},
			});

			const allocation = await fixtureAllocation({
				...withoutA4,
				subagents: (recorded) =>
					recorded.map((each) =>
						each.agentId === "a2"
							? { ...each, transcript: `${each.transcript}\n${synthetic}` }
							: each,
					),
			});

			expect(agent(allocation, "a2").provider).toEqual({
				state: "reported",
				costUsd: 0.03,
				models: ["claude-opus-5"],
			});
		});

		it("leaves the provider's count unseparated for agents sharing a model", async () => {
			const allocation = await fixtureAllocation(withoutA4);

			expect([
				available(allocation).root.provider.state,
				agent(allocation, "a1").provider.state,
			]).toEqual(["not separable", "not separable"]);
		});
	});

	describe("when an attempt agent left no transcript", () => {
		it("reads the attempt total incomplete", async () => {
			const allocation = available(await fixtureAllocation());

			expect(allocation.calculated.state).toBe("incomplete");
			expect(reasonsOf(allocation.calculated)).toContain(
				"no transcript was kept for sub-agent a4",
			);
		});

		it("counts every attempt request in the incomplete total", async () => {
			const allocation = available(await fixtureAllocation());

			expect(allocation.calculated).toMatchObject({
				pricedRequestCount: 12,
				requestCount: 13,
			});
		});

		it("reads its parent's total including descendants incomplete", async () => {
			const allocation = available(await fixtureAllocation());

			const { cost } = allocation.root.includingDescendants;

			expect(cost.state).toBe("incomplete");
			expect(reasonsOf(cost)).toContain(
				"no transcript was kept for sub-agent a4",
			);
		});

		it("reads every model's calculated cost incomplete", async () => {
			const allocation = available(await fixtureAllocation());

			expect(
				allocation.byModel.map(({ model, calculated }) => [
					model,
					calculated.state,
				]),
			).toEqual([
				["claude-opus-5", "incomplete"],
				["claude-sonnet-5", "incomplete"],
			]);
		});

		it("separates no agent's provider count, since a4's model is unknown", async () => {
			const allocation = await fixtureAllocation({
				modelUsage: { "claude-opus-5": modelUsage(0.03) },
			});

			expect(agent(allocation, "a2").provider.state).toBe("not separable");
		});
	});

	describe("when the attempt's boundary is unknown", () => {
		it("allocates nothing", async () => {
			const allocation = await fixtureAllocation({
				prefixLinesExcluded: undefined,
			});

			expect(allocation).toEqual({
				state: "unavailable",
				reasons: ["the transcript carries no attempt boundary"],
			});
		});
	});
});

function modelUsage(costUSD: number): ClaudeModelUsage {
	return {
		inputTokens: 0,
		outputTokens: 0,
		cacheReadInputTokens: 0,
		cacheCreationInputTokens: 0,
		costUSD,
		contextWindow: 0,
		maxOutputTokens: 0,
	};
}
