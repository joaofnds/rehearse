import { describe, expect, it } from "bun:test";

import { sessionHistoryReport } from "#benchmark/session-history";

import { call, result, row } from "./session-history-event-test-fixtures";
import { sessionAttempt } from "./session-history-test-identities";

const FIRST_ATTEMPT_EVENT_INDEX = 0;

function countsASkillBodyASlashCommandLoadedAsADeliveryOfThatSkill(): void {
	const transcript = [
		row({
			isMeta: true,
			message: {
				content: [
					{
						text: "Base directory for this skill: /home/me/.claude/skills/build\n\n# Build",
						type: "text",
					},
				],
			},
			type: "user",
		}),
		row(call("skill-again", "Skill", { skill: "build" })),
		row(result("skill-again", "loading build")),
		row({
			message: { content: "build instructions" },
			sourceToolUseID: "skill-again",
			type: "user",
		}),
	].join("\n");

	const report = sessionHistoryReport({
		attempt: sessionAttempt,
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [],
		transcript,
	});

	expect(report.attemptEvents[FIRST_ATTEMPT_EVENT_INDEX]).toMatchObject({
		kind: "instruction-delivery",
		label: "Skill delivered · first",
		sourceId: "skill:skills/build/SKILL.md",
		state: "delivered",
	});
	expect(
		report.sources.find(({ name }) => name === "skills/build/SKILL.md"),
	).toMatchObject({ observedDeliveryCount: 2, repeatDeliveryCount: 1 });
}

function doesNotCountAPromptThatQuotesASkillBodySOpeningAsADelivery(): void {
	const transcript = row({
		message: {
			content: [
				{
					text: "Base directory for this skill: /home/me/.claude/skills/build\n\nwhy did this load?",
					type: "text",
				},
			],
		},
		type: "user",
	});

	const report = sessionHistoryReport({
		attempt: sessionAttempt,
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [],
		transcript,
	});

	expect(report.attemptEvents[FIRST_ATTEMPT_EVENT_INDEX]?.kind).toBe(
		"unclassified",
	);
	expect(
		report.sources.find(({ name }) => name === "skills/build/SKILL.md"),
	).toBeUndefined();
}

describe(sessionHistoryReport.name, () => {
	it(
		"counts a skill body a slash command loaded as a delivery of that skill",
		countsASkillBodyASlashCommandLoadedAsADeliveryOfThatSkill,
	);
	it(
		"does not count a prompt that quotes a skill body's opening as a delivery",
		doesNotCountAPromptThatQuotesASkillBodySOpeningAsADelivery,
	);
});
