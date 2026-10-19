import { describe, expect, it } from "bun:test";

import agentCostAllocation from "#benchmark/agent-cost";

import {
	agent,
	available,
	costOf,
	fixtureAllocation,
	reasonsOf,
	skillNamed,
} from "./agent-cost-test-fixtures";
import {
	forkedSkillDelivery,
	skillDelivery,
} from "./agent-cost-transcript-fixtures";

const INITIAL_ATTEMPT_REQUEST_LINE_OFFSET = 1;

const INITIAL_TRANSCRIPT_LINE_COUNT = 7;

const PREFIX_START_INDEX = 0;

const INHERITED_PREFIX_LINES = 3;

async function chargesSubagentSkillWindow(): Promise<void> {
	const subagentSkillRequestLine = 11;
	const firstUnscopedSubagentRequestLine = 2;
	const middleUnscopedSubagentRequestLine = 6;
	const lastUnscopedSubagentRequestLine = 8;

	const delivery = skillDelivery({
		model: "claude-opus-5",
		requestId: "req-a2-s",
		skill: "review-docs",
		toolUseId: "toolu_a2s",
	});

	const allocation = available(
		await fixtureAllocation({
			subagents: (recorded) =>
				recorded.map((each) => {
					if (each.agentId !== "a2") {
						return each;
					}

					const lines = each.transcript.split("\n");
					return {
						...each,
						transcript: [
							...lines.slice(PREFIX_START_INDEX, INITIAL_TRANSCRIPT_LINE_COUNT),
							...delivery,
							...lines.slice(INITIAL_TRANSCRIPT_LINE_COUNT),
						].join("\n"),
					};
				}),
		}),
	);

	const a2 = agent(allocation, "a2");
	expect(skillNamed(a2, "review-docs").own.requestLines).toEqual([
		subagentSkillRequestLine,
	]);
	expect(a2.unattributed.requestLines).toEqual([
		firstUnscopedSubagentRequestLine,
		middleUnscopedSubagentRequestLine,
		lastUnscopedSubagentRequestLine,
	]);
}

async function identifiesSubagentForkedSkill(): Promise<void> {
	const fork = forkedSkillDelivery();

	const allocation = await fixtureAllocation({
		subagents: (recorded) => [
			...recorded.map((each) =>
				each.agentId === "a2"
					? {
							agentId: each.agentId,
							meta: each.meta,
							transcript: [each.transcript, ...fork].join("\n"),
						}
					: each,
			),
			{
				agentId: "a7",
				meta: JSON.stringify({ parentAgentId: "a2", spawnDepth: 2 }),
				transcript:
					recorded.find(({ agentId }) => agentId === "a5")?.transcript ?? "",
			},
		],
	});

	expect(agent(allocation, "a7").forkedSkill).toBe("code-review");
}

async function marksLoopedParentTotalIncomplete(): Promise<void> {
	const allocation = await fixtureAllocation({
		subagents: (recorded) =>
			recorded.map((each) =>
				each.agentId === "a1"
					? {
							agentId: each.agentId,
							meta: JSON.stringify({ parentAgentId: "a1" }),
							transcript: each.transcript,
						}
					: each,
			),
	});

	const a1 = agent(allocation, "a1");
	expect(costOf(a1.includingDescendants.cost)).toBe(costOf(a1.own.cost));
	expect(reasonsOf(a1.includingDescendants.cost)).toEqual([
		"the parent links of sub-agent a1 loop back to it",
	]);
}

async function ignoresInheritedSkillWindow(): Promise<void> {
	const requestOutsideAttemptWindowLine = 7;

	const delivery = skillDelivery({
		model: "claude-sonnet-5",
		requestId: "req-p2",
		skill: "brief",
		toolUseId: "toolu_p9",
	});
	const linesAfterPrompt =
		INHERITED_PREFIX_LINES + INITIAL_ATTEMPT_REQUEST_LINE_OFFSET;

	const allocation = available(
		await fixtureAllocation({
			prefixLinesExcluded: INHERITED_PREFIX_LINES + delivery.length,
			transcript: (lines) => [
				...lines.slice(PREFIX_START_INDEX, INHERITED_PREFIX_LINES),
				...delivery,
				...lines.slice(linesAfterPrompt),
			],
		}),
	);

	expect(allocation.root.skills.map(({ skill }) => skill)).toEqual(["review"]);
	expect(allocation.root.unattributed.requestLines).toEqual([
		requestOutsideAttemptWindowLine,
	]);
}

describe(agentCostAllocation.name, () => {
	describe("when a sub-agent delivers a skill", () => {
		it(
			"charges the sub-agent's skill the requests inside its window",
			chargesSubagentSkillWindow,
		);
	});
	describe("when a sub-agent's Skill call forks into an agent", () => {
		it("shows that agent as the forked skill", identifiesSubagentForkedSkill);
	});
	describe("when a sub-agent's parent links loop back to it", () => {
		it(
			"reads its total including descendants as its own cost, incomplete",
			marksLoopedParentTotalIncomplete,
		);
	});
	describe("when the inherited prefix delivered a skill", () => {
		it("opens no window for it in the attempt", ignoresInheritedSkillWindow);
	});
});
