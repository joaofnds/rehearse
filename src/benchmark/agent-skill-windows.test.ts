import { describe, expect, it } from "bun:test";

import agentCostAllocation from "#benchmark/agent-cost";

import {
	available,
	fixtureAllocation,
	skillNamed,
} from "./agent-cost-test-fixtures";

const PREFIX_START_INDEX = 0;

/** The fixture transcript up to, and not including, review-docs' request. */
const LINES_BEFORE_SECOND_SKILL_REQUEST = 11;

/** The fixture transcript up to, and not including, the forked skill's request. */
const LINES_BEFORE_FORKED_SKILL_REQUEST = 17;

async function closesSkillWindowAtPrompt(): Promise<void> {
	const reviewRequestBeforePromptLine = 8;
	const requestBeforeReviewLine = 5;
	const requestAfterPromptLine = 13;

	const prompt = JSON.stringify({
		cwd: "/work",
		message: { content: "now the docs", role: "user" },
		type: "user",
	});

	const allocation = available(
		await fixtureAllocation({
			transcript: (lines) => [
				...lines.slice(PREFIX_START_INDEX, LINES_BEFORE_SECOND_SKILL_REQUEST),
				prompt,
				...lines.slice(LINES_BEFORE_SECOND_SKILL_REQUEST),
			],
		}),
	);

	expect({
		review: skillNamed(allocation.root, "review").own.requestLines,
		unattributed: allocation.root.unattributed.requestLines,
	}).toEqual({
		review: [reviewRequestBeforePromptLine],
		unattributed: [requestBeforeReviewLine, requestAfterPromptLine],
	});
}

async function closesSkillWindowAtInterruption(): Promise<void> {
	const reviewRequestBeforeInterruptionLine = 8;

	const interruption = JSON.stringify({
		cwd: "/work",
		message: {
			content: [{ text: "[Request interrupted by user]", type: "text" }],
			role: "user",
		},
		type: "user",
	});

	const allocation = available(
		await fixtureAllocation({
			transcript: (lines) => [
				...lines.slice(PREFIX_START_INDEX, LINES_BEFORE_SECOND_SKILL_REQUEST),
				interruption,
				...lines.slice(LINES_BEFORE_SECOND_SKILL_REQUEST),
			],
		}),
	);

	expect(skillNamed(allocation.root, "review").own.requestLines).toEqual([
		reviewRequestBeforeInterruptionLine,
	]);
}

async function keepsWindowForAgentNotification(): Promise<void> {
	const reviewRequestBeforeNotificationLine = 8;
	const reviewRequestAfterNotificationLine = 13;

	const notification = JSON.stringify({
		message: {
			content: "<task-notification>\n<status>completed</status>",
			role: "user",
		},
		origin: { kind: "task-notification" },
		type: "user",
	});

	const allocation = available(
		await fixtureAllocation({
			transcript: (lines) => [
				...lines.slice(PREFIX_START_INDEX, LINES_BEFORE_SECOND_SKILL_REQUEST),
				notification,
				...lines.slice(LINES_BEFORE_SECOND_SKILL_REQUEST),
			],
		}),
	);

	expect(skillNamed(allocation.root, "review").own.requestLines).toEqual([
		reviewRequestBeforeNotificationLine,
		reviewRequestAfterNotificationLine,
	]);
}

async function opensWindowForSlashCommand(): Promise<void> {
	const firstBriefRequestLine = 20;
	const middleBriefRequestLine = 22;
	const lastBriefRequestLine = 24;

	const command = [
		{
			message: {
				content:
					"<command-message>brief</command-message>\n<command-name>/brief</command-name>",
				role: "user",
			},
			type: "user",
		},
		{
			isMeta: true,
			message: {
				content: [
					{
						text: "Base directory for this skill: /skills/brief\n\n# Brief",
						type: "text",
					},
				],
				role: "user",
			},
			type: "user",
		},
	].map((row) => JSON.stringify(row));

	const allocation = available(
		await fixtureAllocation({
			transcript: (lines) => [
				...lines.slice(PREFIX_START_INDEX, LINES_BEFORE_FORKED_SKILL_REQUEST),
				...command,
				...lines.slice(LINES_BEFORE_FORKED_SKILL_REQUEST),
			],
		}),
	);

	const brief = skillNamed(allocation.root, "brief");
	expect(brief.invokedBy).toEqual({ by: "slash command" });
	expect(brief.own.requestLines).toEqual([
		firstBriefRequestLine,
		middleBriefRequestLine,
		lastBriefRequestLine,
	]);
}

async function sharesSlashCommandWindow(): Promise<void> {
	const body = JSON.stringify({
		isMeta: true,
		message: {
			content: ["brief", "plan"].map((skill) => ({
				text: `Base directory for this skill: /skills/${skill}\n\n# ${skill}`,
				type: "text",
			})),
			role: "user",
		},
		type: "user",
	});

	const allocation = available(
		await fixtureAllocation({
			transcript: (lines) => [
				...lines.slice(PREFIX_START_INDEX, LINES_BEFORE_FORKED_SKILL_REQUEST),
				body,
				...lines.slice(LINES_BEFORE_FORKED_SKILL_REQUEST),
			],
		}),
	);

	expect(allocation.root.shared.skills).toContain("brief");
	expect(allocation.root.shared.skills).toContain("plan");
}

async function keepsWindowAcrossCompaction(): Promise<void> {
	const reviewRequestBeforeCompactionLine = 8;
	const reviewRequestAfterCompactionLine = 14;

	const compaction = [
		{
			compactMetadata: { preTokens: 1870, trigger: "auto" },
			content: "Conversation compacted",
			subtype: "compact_boundary",
			type: "system",
		},
		{
			isCompactSummary: true,
			message: { content: "This session is continued.", role: "user" },
			type: "user",
		},
	].map((row) => JSON.stringify(row));

	const allocation = available(
		await fixtureAllocation({
			transcript: (lines) => [
				...lines.slice(PREFIX_START_INDEX, LINES_BEFORE_SECOND_SKILL_REQUEST),
				...compaction,
				...lines.slice(LINES_BEFORE_SECOND_SKILL_REQUEST),
			],
		}),
	);

	expect(skillNamed(allocation.root, "review").own.requestLines).toEqual([
		reviewRequestBeforeCompactionLine,
		reviewRequestAfterCompactionLine,
	]);
}

describe(agentCostAllocation.name, () => {
	describe("when a prompt follows a skill's delivery", () => {
		it("closes the skill's window at the prompt", closesSkillWindowAtPrompt);
	});
	describe("when an interruption follows a skill's delivery", () => {
		it(
			"closes the skill's window at the interruption",
			closesSkillWindowAtInterruption,
		);
	});
	describe("when a background agent's notification follows a skill's delivery", () => {
		it("keeps the skill's window open", keepsWindowForAgentNotification);
	});
	describe("when a slash command loads a skill", () => {
		it("opens the skill's window at its body", opensWindowForSlashCommand);
		it(
			"shares the window between two skill bodies one row carries",
			sharesSlashCommandWindow,
		);
	});
	describe("when a compaction follows a skill's delivery", () => {
		it("keeps the skill's window open", keepsWindowAcrossCompaction);
	});
});
