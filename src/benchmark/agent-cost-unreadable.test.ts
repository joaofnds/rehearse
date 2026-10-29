import { describe, expect, it } from "bun:test";

import agentCostAllocation from "#benchmark/agent-cost";
import type { SubagentEvidence } from "#benchmark/agent-tree";

import {
	agent,
	available,
	fixtureAllocation,
	modelUsage,
	reasonsOf,
	skillNamed,
	withPrefix,
	withoutA4,
} from "./agent-cost-test-fixtures";

/** The third and last line withPrefix inherits, counted from zero. */
const LAST_PREFIX_LINE_INDEX = 2;

/** The second row of request req-r2b, inside the root's review skill window. */
const REVIEW_REQUEST_SECOND_ROW_INDEX = 9;

const OPUS_PROVIDER_COST_USD = 0.03;

/** The opening user row of withoutA4, inherited when the prefix holds one line. */
const FIRST_LINE_INDEX = 0;

const A1_UNREADABLE = "sub-agent a1's transcript line 1 cannot be read";

function a1Reading(
	rewrite: (lines: readonly string[]) => readonly string[],
): (recorded: readonly SubagentEvidence[]) => readonly SubagentEvidence[] {
	return (recorded) =>
		withoutA4.subagents(recorded).map((each) =>
			each.agentId === "a1"
				? {
						agentId: each.agentId,
						meta: each.meta,
						transcript: rewrite(each.transcript.split("\n")).join("\n"),
					}
				: each,
		);
}

const corruptA1 = {
	...withoutA4,
	subagents: a1Reading(() => ["not json"]),
};

const cutReviewRequestRow = {
	...withoutA4,
	transcript: (lines: readonly string[]): readonly string[] =>
		withoutA4
			.transcript(lines)
			.with(REVIEW_REQUEST_SECOND_ROW_INDEX, '{"type":"assistant","requ'),
};

async function marksAttemptTotalIncomplete(): Promise<void> {
	const allocation = available(await fixtureAllocation(corruptA1));

	expect(reasonsOf(allocation.calculated)).toContain(A1_UNREADABLE);
}

async function marksAgentOwnCostIncomplete(): Promise<void> {
	const allocation = await fixtureAllocation(corruptA1);

	const { cost } = agent(allocation, "a1").own;

	expect(cost).toEqual({
		costUsd: 0,
		pricedRequestCount: 0,
		reasons: [A1_UNREADABLE],
		requestCount: 0,
		state: "incomplete",
	});
}

async function marksMistypedRequestIncomplete(): Promise<void> {
	const allocation = await fixtureAllocation({
		...withoutA4,
		subagents: a1Reading(() => [
			'{"type":"assistant","requestId":"req-x","message":{"usage":{"input_tokens":"3"}}}',
		]),
	});

	const { cost } = agent(allocation, "a1").own;

	expect(reasonsOf(cost)).toEqual([A1_UNREADABLE]);
}

async function namesTheLineOnEveryModel(): Promise<void> {
	const allocation = available(await fixtureAllocation(corruptA1));

	expect(
		allocation.byModel.filter(
			({ calculated }) => !reasonsOf(calculated).includes(A1_UNREADABLE),
		),
	).toEqual([]);
}

async function namesTheLineOnProviderCounts(): Promise<void> {
	const allocation = await fixtureAllocation({
		...corruptA1,
		modelUsage: { "claude-opus-5": modelUsage(OPUS_PROVIDER_COST_USD) },
	});

	expect(agent(allocation, "a2").provider).toEqual({
		reason: `${A1_UNREADABLE}, so the model it ran on is unknown`,
		state: "not separable",
	});
}

async function marksTheSkillWindowIncomplete(): Promise<void> {
	const allocation = available(await fixtureAllocation(cutReviewRequestRow));

	const { own } = skillNamed(allocation.root, "review");

	expect(reasonsOf(own.cost)).toContain(
		"the attempt transcript's line 10 cannot be read",
	);
}

async function keepsTheLineOutOfOtherWindows(): Promise<void> {
	const allocation = available(await fixtureAllocation(cutReviewRequestRow));

	expect([
		...reasonsOf(allocation.root.shared.cost),
		...reasonsOf(allocation.root.unattributed.cost),
	]).not.toContain("the attempt transcript's line 10 cannot be read");
}

async function countsNoExtraRequest(): Promise<void> {
	const intact = available(await fixtureAllocation(withoutA4));
	const allocation = available(await fixtureAllocation(cutReviewRequestRow));

	expect(allocation.calculated).toMatchObject({
		requestCount:
			intact.calculated.state === "incomplete"
				? intact.calculated.requestCount
				: Number.NaN,
	});
}

async function marksRootAttemptLineIncomplete(): Promise<void> {
	const allocation = available(
		await fixtureAllocation({
			...withoutA4,
			transcript: (lines) => [
				...withoutA4.transcript(lines),
				'{"type":"assistant","requestId":"req-cut',
			],
		}),
	);

	expect(reasonsOf(allocation.calculated)).toContain(
		"the attempt transcript's line 17 cannot be read",
	);
}

async function ignoresUnreadablePrefixLine(): Promise<void> {
	const intact = available(await fixtureAllocation(withPrefix));
	const allocation = available(
		await fixtureAllocation({
			...withPrefix,
			transcript: (lines) =>
				withPrefix.transcript(lines).with(LAST_PREFIX_LINE_INDEX, "not json"),
		}),
	);

	expect(allocation.calculated).toEqual(intact.calculated);
}

async function separatesNoProviderCountAfterUnreadablePrefix(): Promise<void> {
	const allocation = await fixtureAllocation({
		...withoutA4,
		modelUsage: { "claude-opus-5": modelUsage(OPUS_PROVIDER_COST_USD) },
		prefixLinesExcluded: 1,
		transcript: (lines) =>
			withoutA4.transcript(lines).with(FIRST_LINE_INDEX, "not json"),
	});

	expect(agent(allocation, "a2").provider).toEqual({
		reason: "the inherited prefix holds a request on an unknown model",
		state: "not separable",
	});
}

async function readsRequestlessTranscriptComplete(): Promise<void> {
	const allocation = await fixtureAllocation({
		...withoutA4,
		subagents: a1Reading((lines) =>
			lines.filter((row) => !row.includes('"type":"assistant"')),
		),
	});

	expect(agent(allocation, "a1").own.cost).toEqual({
		costUsd: 0,
		state: "complete",
	});
}

describe(agentCostAllocation.name, () => {
	describe("when a kept sub-agent transcript holds an unreadable line", () => {
		it(
			"reads the attempt total incomplete, naming the agent and line",
			marksAttemptTotalIncomplete,
		);
		it(
			"reads that agent's own cost incomplete over its readable requests",
			marksAgentOwnCostIncomplete,
		);
		it(
			"names the line on every model's calculated cost",
			namesTheLineOnEveryModel,
		);
		it(
			"names the line where it leaves a provider count unseparated",
			namesTheLineOnProviderCounts,
		);
	});
	describe("when an assistant row's usage has the wrong type", () => {
		it(
			"reads that agent's own cost incomplete, naming the row",
			marksMistypedRequestIncomplete,
		);
	});
	describe("when a row of a read request cannot be read", () => {
		it(
			"reads the skill window holding it incomplete",
			marksTheSkillWindowIncomplete,
		);
		it(
			"leaves the line out of the shared and unattributed remainders",
			keepsTheLineOutOfOtherWindows,
		);
		it("counts no extra request", countsNoExtraRequest);
	});
	describe("when the root transcript holds an unreadable line", rootLines);
	describe("when a kept sub-agent transcript holds no request", () => {
		it(
			"reads that agent's own cost complete at zero",
			readsRequestlessTranscriptComplete,
		);
	});
});

function rootLines(): void {
	it(
		"reads the attempt total incomplete in the attempt region",
		marksRootAttemptLineIncomplete,
	);
	it(
		"leaves the total as it reads without the line in the inherited prefix",
		ignoresUnreadablePrefixLine,
	);
	it(
		"separates no provider count, since a prefix model is unknown",
		separatesNoProviderCountAfterUnreadablePrefix,
	);
}
