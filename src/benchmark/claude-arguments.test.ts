import { describe, expect, it } from "bun:test";

import { claudeArgs } from "./claude";
import { STREAM_OUTPUT_ARGUMENT_COUNT } from "./claude-test-fixtures";
import {
	claudeJsonSchema,
	judgeGradeSchema,
	stageTurnSchema,
} from "./contracts";

function grantsAWorkflowSessionNativeCustomizationsWithoutPermissionPrompts(): void {
	const command = claudeArgs({
		access: "unrestricted",
		schema: stageTurnSchema,
		session: { id: "session-1", resume: false },
		settings: { budgetUsd: 5, effort: "high", model: "sonnet" },
	});

	expect(command).toEqual([
		"claude",
		"-p",
		"--model",
		"sonnet",
		"--effort",
		"high",
		"--max-budget-usd",
		"5",
		"--output-format",
		"json",
		"--json-schema",
		claudeJsonSchema(stageTurnSchema),
		"--dangerously-skip-permissions",
		"--session-id",
		"session-1",
	]);
}

function sealsAJudgeSessionAwayFromToolsSkillsAndPersistence(): void {
	const command = claudeArgs({
		access: "sealed",
		schema: judgeGradeSchema,
		settings: { budgetUsd: 5, model: "sonnet" },
		systemPrompt: "You are a judge.",
	});

	expect(command).toEqual([
		"claude",
		"-p",
		"--safe-mode",
		"--disable-slash-commands",
		"--strict-mcp-config",
		"--model",
		"sonnet",
		"--max-budget-usd",
		"5",
		"--output-format",
		"json",
		"--json-schema",
		claudeJsonSchema(judgeGradeSchema),
		"--tools",
		"",
		"--system-prompt",
		"You are a judge.",
		"--no-session-persistence",
	]);
}

function streamsASessionSOutputAsItIsWrittenWhenAskedTo(): void {
	const command = claudeArgs({
		access: "sealed",
		output: "stream",
		schema: judgeGradeSchema,
		settings: { budgetUsd: 5, model: "sonnet" },
	});

	const format = command.indexOf("--output-format");

	expect(command.slice(format, format + STREAM_OUTPUT_ARGUMENT_COUNT)).toEqual([
		"--output-format",
		"stream-json",
		"--verbose",
		"--include-partial-messages",
		"--json-schema",
	]);
}

function resumesAnExistingSession(): void {
	const command = claudeArgs({
		access: "unrestricted",
		schema: stageTurnSchema,
		session: { id: "session-1", resume: true },
		settings: { budgetUsd: 5, model: "sonnet" },
	});

	expect(command).toContain("--resume");
	expect(command).not.toContain("--session-id");
}

describe(claudeArgs.name, () => {
	it(
		"grants a workflow session native customizations without permission prompts",
		grantsAWorkflowSessionNativeCustomizationsWithoutPermissionPrompts,
	);
	it(
		"seals a judge session away from tools, skills, and persistence",
		sealsAJudgeSessionAwayFromToolsSkillsAndPersistence,
	);
	it(
		"streams a session's output as it is written when asked to",
		streamsASessionSOutputAsItIsWrittenWhenAskedTo,
	);
	it("resumes an existing session", resumesAnExistingSession);
	it(
		"grants a workflow session native customizations without permission prompts",
		grantsAWorkflowSessionNativeCustomizationsWithoutPermissionPrompts,
	);
	it(
		"seals a judge session away from tools, skills, and persistence",
		sealsAJudgeSessionAwayFromToolsSkillsAndPersistence,
	);
	it("resumes an existing session", resumesAnExistingSession);
});
