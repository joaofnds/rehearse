import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { agentTree } from "#benchmark/agent-tree";
import type { AgentTree, SubagentEvidence } from "#benchmark/agent-tree";

const FIXTURE = join(import.meta.dir, "__fixtures__", "agent-tree");

async function fixtureSubagents(): Promise<readonly SubagentEvidence[]> {
	const directory = join(FIXTURE, "subagents");
	const names = await readdir(directory);
	const ids = names
		.filter((name) => name.endsWith(".jsonl"))
		.map((name) => name.replace(/^agent-/u, "").replace(/\.jsonl$/u, ""));

	return Promise.all(
		ids.map(async (agentId) => ({
			agentId,
			transcript: await Bun.file(
				join(directory, `agent-${agentId}.jsonl`),
			).text(),
			meta: await Bun.file(
				join(directory, `agent-${agentId}.meta.json`),
			).text(),
		})),
	);
}

async function fixtureTree(): Promise<AgentTree> {
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
		transcript: await Bun.file(join(FIXTURE, "transcript.jsonl")).text(),
		prefixLinesExcluded: 3,
		subagents: await fixtureSubagents(),
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

	it("marks the stopped agent stopped and no other", async () => {
		const tree = await fixtureTree();

		expect(
			tree.agents
				.filter((agent) => agent.evidence === "available" && agent.stopped)
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

	it("offers no reading that sums agents into one active context", async () => {
		const tree = await fixtureTree();

		expect(Object.keys(tree).toSorted()).toEqual([
			"agents",
			"coverage",
			"root",
		]);
		expect(
			tree.agents.every(
				(agent) =>
					agent.evidence === "unavailable" ||
					!agent.series.measuresActiveContextWindow,
			),
		).toBe(true);
	});

	it("prices a streamed child request at its final rows", async () => {
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
			const allSubagents = await fixtureSubagents();
			const subagents = allSubagents.filter(({ agentId }) => agentId !== "a0");
			const fullTranscript = await Bun.file(
				join(FIXTURE, "transcript.jsonl"),
			).text();
			const transcript = fullTranscript.split("\n").slice(0, 16).join("\n");

			const tree = agentTree({
				attempt: {
					kind: "session",
					caseId: "case-a",
					id: "attempt-a",
					model: "sonnet",
					outcome: "SUCCESSFUL",
					corpusFiles: [],
				},
				resolvedCorpusFiles: [],
				transcript,
				prefixLinesExcluded: 3,
				subagents,
			});

			expect(tree.coverage).toEqual({ state: "complete" });
			expect(tree.agents.find(({ agentId }) => agentId === "a0")).toMatchObject(
				{ evidence: "unavailable", context: "inherited" },
			);
		});
	});
});
