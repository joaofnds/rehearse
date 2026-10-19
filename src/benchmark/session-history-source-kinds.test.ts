import { describe, expect, it } from "bun:test";

import { sessionHistoryReport } from "#benchmark/session-history";

import { call, result, row } from "./session-history-event-test-fixtures";
import { sessionAttempt } from "./session-history-test-identities";

function classifiesSavedCorpusProjectExternalToolAndEscapingSources(): void {
	const transcript = [
		row(call("corpus", "Read", { file_path: "/work/.claude/rules.md" })),
		row(result("corpus", "corpus")),
		row(call("project", "Read", { file_path: "/work/project.md" })),
		row(result("project", "project")),
		row(call("external", "Read", { file_path: "/outside.md" })),
		row(result("external", "external")),
		row(call("escape", "Read", { file_path: "../escape.md" })),
		row(result("escape", "escape")),
		row(call("bash", "Bash", { command: "pwd" })),
		row(result("bash", "output")),
	].join("\n");
	const report = sessionHistoryReport({
		attempt: sessionAttempt,
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [],
		transcript,
	});

	expect(report.sources.map(({ kind }) => kind)).toEqual([
		"corpus",
		"project",
		"external",
		"unclassified",
		"tool-output",
	]);
}

function distinguishesFailedAndMissingReadsFromAbsentAndDeliveredSkills(): void {
	const transcript = [
		row(call("read-failed", "Read", { file_path: "/work/failure.md" })),
		row(result("read-failed", "permission denied", { error: true })),
		row(call("read-missing", "Read", { file_path: "/work/missing.md" })),
		row(call("skill-missing", "Skill", { skill: "verify" })),
		row(call("skill-done", "Skill", { skill: "build" })),
		row(result("skill-done", "loading build")),
		row({
			message: { content: "build instructions" },
			sourceToolUseID: "skill-done",
			type: "user",
		}),
	].join("\n");

	const report = sessionHistoryReport({
		attempt: sessionAttempt,
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [],
		transcript,
	});

	expect(report.attemptEvents.map(({ id, state }) => ({ id, state }))).toEqual([
		{ id: "1:1", state: "invoked" },
		{ id: "2:1", state: "failed" },
		{ id: "3:1", state: "unavailable" },
		{ id: "4:1", state: "unavailable" },
		{ id: "5:1", state: "invoked" },
		{ id: "6:1", state: "recorded" },
		{ id: "7:1", state: "delivered" },
	]);
	expect(report.sources.map(({ kind, name }) => ({ kind, name }))).toEqual([
		{ kind: "project", name: "failure.md" },
		{ kind: "project", name: "missing.md" },
		{ kind: "skill", name: "skills/verify/SKILL.md" },
		{ kind: "skill", name: "skills/build/SKILL.md" },
		{ kind: "tool-output", name: "Skill result · 5:1" },
	]);
	expect(
		report.sources
			.filter(({ name }) => name === "missing.md" || name.includes("verify"))
			.map(({ missingOccurrences, unavailableOccurrences }) => ({
				missingOccurrences,
				unavailableOccurrences,
			})),
	).toEqual([
		{ missingOccurrences: 1, unavailableOccurrences: 0 },
		{ missingOccurrences: 1, unavailableOccurrences: 0 },
	]);
}

describe(sessionHistoryReport.name, () => {
	it(
		"classifies saved corpus, project, external, tool, and escaping sources",
		classifiesSavedCorpusProjectExternalToolAndEscapingSources,
	);
	it(
		"distinguishes failed and missing Reads from absent and delivered Skills",
		distinguishesFailedAndMissingReadsFromAbsentAndDeliveredSkills,
	);
});
