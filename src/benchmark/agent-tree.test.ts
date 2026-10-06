import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { agentTree } from "#benchmark/agent-tree";
import type { AgentTree, SubagentEvidence } from "#benchmark/agent-tree";
import { recordedSubagents } from "#benchmark/subagent-evidence";

const FIXTURE = join(import.meta.dir, "__fixtures__", "agent-tree");
const INHERITED_PREFIX_LINES = 3;
/** The fixture transcript up to, and not including, a4's launch. */
const LINES_BEFORE_A4_LAUNCH = 16;

interface FixtureOverrides {
	readonly prefixLinesExcluded?: number | undefined;
	readonly transcript?: (lines: readonly string[]) => readonly string[];
	readonly subagents?: (
		recorded: readonly SubagentEvidence[],
	) => readonly SubagentEvidence[];
}

async function fixtureTree(
	overrides: FixtureOverrides = {},
): Promise<AgentTree> {
	const transcript = await Bun.file(join(FIXTURE, "transcript.jsonl")).text();
	const lines = transcript.split("\n");
	const recorded = await recordedSubagents(FIXTURE);

	return agentTree({
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
	});
}

describe(agentTree.name, () => {
	it("links each agent to the agent or root that launched it", async () => {
		const tree = await fixtureTree();

		expect(
			Object.fromEntries(
				tree.agents.map(({ agentId, parent }) => [agentId, parent]),
			),
		).toEqual({
			a0: { state: "root", basis: "launch call" },
			a1: { state: "root", basis: "launch call" },
			a2: { state: "root", basis: "launch call" },
			a3: { state: "agent", agentId: "a2", basis: "parent agent id" },
			a4: { state: "root", basis: "agent result" },
			a5: { state: "root", basis: "skill result" },
			a6: { state: "agent", agentId: "a0", basis: "agent result" },
		});
	});

	it("reads each agent's models from its own requests", async () => {
		const tree = await fixtureTree();

		expect(
			Object.fromEntries(
				tree.agents
					.filter((agent) => agent.evidence === "available")
					.map(({ agentId, models }) => [agentId, models]),
			),
		).toEqual({
			a0: ["claude-opus-5"],
			a1: ["claude-sonnet-5"],
			a2: ["claude-opus-5"],
			a3: ["claude-sonnet-5"],
			a5: ["claude-sonnet-5"],
		});
	});

	it("keeps every child's requests out of the root's series", async () => {
		const tree = await fixtureTree();

		expect(tree.root.series.entries.map(({ requestId }) => requestId)).toEqual([
			"req-p1",
			"req-r1",
			"req-r2",
			"req-r3",
			"req-r4",
			"req-r5",
		]);
	});

	it("gives each agent the series of its own transcript", async () => {
		const tree = await fixtureTree();

		expect(
			Object.fromEntries(
				tree.agents
					.filter((agent) => agent.evidence === "available")
					.map(({ agentId, series }) => [
						agentId,
						series.entries.map(({ requestId }) => requestId),
					]),
			),
		).toEqual({
			a0: ["req-a0-1", "req-a0-2", "req-a0-3"],
			a1: ["req-a1-1", "req-a1-2"],
			a2: ["req-a2-1", "req-a2-2", "req-a2-3"],
			a3: ["req-a3-1"],
			a5: ["req-a5-1"],
		});
	});

	it("keeps each compaction on the agent whose transcript recorded it", async () => {
		const tree = await fixtureTree();

		expect(
			Object.fromEntries(
				tree.agents
					.filter((agent) => agent.evidence === "available")
					.map(({ agentId, series }) => [agentId, series.compactions]),
			),
		).toEqual({
			a0: [],
			a1: [],
			a2: [{ line: 4, trigger: "auto", region: "attempt" }],
			a3: [],
			a5: [],
		});
		expect(tree.root.series.compactions).toEqual([]);
	});

	it("lists the sources each agent received in its own transcript", async () => {
		const tree = await fixtureTree();

		expect(
			Object.fromEntries(
				tree.agents
					.filter((agent) => agent.evidence === "available")
					.map(({ agentId, deliveries }) => [
						agentId,
						deliveries.map(({ name, observedDeliveryCount }) => ({
							name,
							observedDeliveryCount,
						})),
					]),
			),
		).toEqual({
			a0: [{ name: "CLAUDE.md", observedDeliveryCount: 1 }],
			a1: [{ name: "CLAUDE.md", observedDeliveryCount: 1 }],
			a2: [{ name: "CLAUDE.md", observedDeliveryCount: 1 }],
			a3: [],
			a5: [],
		});
	});

	it("lists the root's own deliveries and none of its children's", async () => {
		const tree = await fixtureTree();

		expect(tree.root.deliveries.map(({ name }) => name)).toEqual([
			"skills/review/SKILL.md",
			"skills/review-docs/SKILL.md",
		]);
	});

	it("shows each agent's launch mode and spawn depth as recorded", async () => {
		const tree = await fixtureTree();

		expect(
			Object.fromEntries(
				tree.agents
					.filter((agent) => agent.evidence === "available")
					.map(({ agentId, launchMode, spawnDepth, description }) => [
						agentId,
						{ launchMode, spawnDepth, description },
					]),
			),
		).toEqual({
			a0: {
				launchMode: "foreground",
				spawnDepth: 1,
				description: "Earlier review",
			},
			a1: {
				launchMode: "foreground",
				spawnDepth: 1,
				description: "Review the code",
			},
			a2: {
				launchMode: "background",
				spawnDepth: 1,
				description: "Review the docs",
			},
			a3: {
				launchMode: "foreground",
				spawnDepth: 2,
				description: "Find the docs",
			},
			a5: { launchMode: "foreground", spawnDepth: 1, description: undefined },
		});
	});

	it("marks the stopped agent stopped and no other", async () => {
		const tree = await fixtureTree();

		expect(
			tree.agents
				.filter(
					(agent) => agent.evidence === "available" && agent.stopped === true,
				)
				.map(({ agentId }) => agentId),
		).toEqual(["a1"]);
	});

	it("reads the context each agent began with where it is observed", async () => {
		const tree = await fixtureTree();

		expect(
			Object.fromEntries(
				tree.agents.map(({ agentId, context }) => [agentId, context]),
			),
		).toEqual({
			a0: "inherited",
			a1: "fresh",
			a2: "fresh",
			a3: "fresh",
			a4: "not recorded",
			a5: "fresh",
			a6: "inherited",
		});
	});

	it("keeps an inherited agent's requests out of the attempt's totals", async () => {
		const tree = await fixtureTree();

		const inherited = tree.agents.find(({ agentId }) => agentId === "a0");

		expect(
			inherited?.evidence === "available" && inherited.series.attemptTotals,
		).toMatchObject({
			state: "complete",
			requestCount: 0,
		});
	});

	it("names compaction summaries and interruptions and never a resume", async () => {
		const tree = await fixtureTree();

		expect(
			Object.fromEntries(
				tree.agents
					.filter((agent) => agent.evidence === "available")
					.map(({ agentId, laterTurns, resume }) => [
						agentId,
						{ laterTurns, resume },
					]),
			),
		).toEqual({
			a0: { laterTurns: [], resume: "not recorded" },
			a1: {
				laterTurns: [{ line: 7, kind: "interruption" }],
				resume: "not recorded",
			},
			a2: {
				laterTurns: [{ line: 5, kind: "compaction summary" }],
				resume: "not recorded",
			},
			a3: { laterTurns: [], resume: "not recorded" },
			a5: { laterTurns: [], resume: "not recorded" },
		});
	});

	it("carries each review agent's type and no harness role", async () => {
		const tree = await fixtureTree();

		const reviewers = tree.agents.filter(
			(agent) =>
				agent.evidence === "available" && agent.agentType === "reviewer",
		);

		expect(reviewers.map(({ agentId }) => agentId)).toEqual(["a0", "a1", "a2"]);
		expect(reviewers.every((agent) => !("role" in agent))).toBe(true);
	});

	it("reads a streamed child request complete from its final rows", async () => {
		const tree = await fixtureTree();

		const a1 = tree.agents.find(({ agentId }) => agentId === "a1");
		const a2 = tree.agents.find(({ agentId }) => agentId === "a2");

		expect(
			a1?.evidence === "available" &&
				a1.series.entries.map(({ usageState }) => usageState),
		).toEqual(["complete", "complete"]);
		expect(
			a2?.evidence === "available" &&
				a2.series.entries.map(({ usageState }) => usageState),
		).toEqual(["complete", "complete", "incomplete"]);
	});

	it("reads coverage incomplete for an attempt agent with no transcript", async () => {
		const tree = await fixtureTree();

		expect(tree.coverage).toEqual({
			state: "incomplete",
			unavailableAgentIds: ["a4"],
		});
	});

	describe("when an inherited agent left no transcript", () => {
		it("keeps coverage complete", async () => {
			const tree = await fixtureTree({
				transcript: (lines) => lines.slice(0, LINES_BEFORE_A4_LAUNCH),
				subagents: (recorded) =>
					recorded.filter(({ agentId }) => agentId !== "a0"),
			});

			expect(tree.coverage).toEqual({ state: "complete" });
			expect(tree.agents.find(({ agentId }) => agentId === "a0")).toMatchObject(
				{ evidence: "unavailable", context: "inherited" },
			);
		});
	});

	describe("when a kept agent names no launch and continues a conversation", () => {
		const stray: SubagentEvidence = {
			agentId: "a9",
			meta: "{}",
			transcript: `${JSON.stringify({
				type: "user",
				message: { role: "user", content: "carry on" },
				parentUuid: "u-earlier",
				isSidechain: true,
				cwd: "/work",
			})}\n`,
		};

		it("leaves it unlinked rather than guessing a parent", async () => {
			const tree = await fixtureTree({
				subagents: (recorded) => [...recorded, stray],
			});

			expect(
				tree.agents.find(({ agentId }) => agentId === "a9")?.parent,
			).toEqual({ state: "unlinked" });
		});

		it("reads its starting context as not recorded", async () => {
			const tree = await fixtureTree({
				subagents: (recorded) => [...recorded, stray],
			});

			expect(tree.agents.find(({ agentId }) => agentId === "a9")?.context).toBe(
				"not recorded",
			);
		});
	});

	describe("when an agent's meta file is missing or unreadable", () => {
		const withMeta =
			(meta: string | undefined) => (recorded: readonly SubagentEvidence[]) =>
				recorded.map((each) =>
					each.agentId === "a1" ? { ...each, meta } : each,
				);

		it("reads whether it was stopped as not recorded when the file is missing", async () => {
			const tree = await fixtureTree({ subagents: withMeta(undefined) });

			expect(tree.agents.find(({ agentId }) => agentId === "a1")).toMatchObject(
				{
					meta: "not recorded",
					stopped: "not recorded",
				},
			);
		});

		it("reads the file as unreadable rather than absent when it does not parse", async () => {
			const tree = await fixtureTree({
				subagents: withMeta(
					'{"agentType":"reviewer","spawnDepth":1.5,"stoppedByUser":true}',
				),
			});

			expect(tree.agents.find(({ agentId }) => agentId === "a1")).toMatchObject(
				{
					meta: "unreadable",
					stopped: "not recorded",
				},
			);
		});
	});

	describe("when a child's tool result names no tool call", () => {
		it("reads the row as a tool result and not a later prompt", async () => {
			const child: SubagentEvidence = {
				agentId: "a9",
				meta: "{}",
				transcript: [
					{
						type: "user",
						message: { role: "user", content: "look" },
						parentUuid: null,
					},
					{
						type: "user",
						message: {
							role: "user",
							content: [{ type: "tool_result", content: "found" }],
						},
					},
				]
					.map((row) => JSON.stringify(row))
					.join("\n"),
			};

			const tree = await fixtureTree({
				subagents: (recorded) => [...recorded, child],
			});

			expect(tree.agents.find(({ agentId }) => agentId === "a9")).toMatchObject(
				{
					laterTurns: [],
				},
			);
		});
	});

	describe("when the attempt's boundary is unknown", () => {
		it("lists the root's deliveries with their counts unknown", async () => {
			const tree = await fixtureTree({ prefixLinesExcluded: undefined });

			expect(
				tree.root.deliveries.map(({ name, observedDeliveryCount }) => ({
					name,
					observedDeliveryCount,
				})),
			).toContainEqual({
				name: "skills/review/SKILL.md",
				observedDeliveryCount: undefined,
			});
		});

		it("totals no agent's requests into the attempt", async () => {
			const tree = await fixtureTree({ prefixLinesExcluded: undefined });

			expect(
				tree.agents
					.filter((agent) => agent.evidence === "available")
					.map(({ series }) => [series.boundary, series.attemptTotals.state]),
			).toEqual(Array.from({ length: 5 }, () => ["unknown", "unavailable"]));
		});
	});
});
