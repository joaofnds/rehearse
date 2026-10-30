import { homedir } from "node:os";

import type { Immutable } from "#benchmark/contracts";
import type { SessionAttempt } from "#benchmark/session-attempt";
import { claudeProjectsDirectory } from "#benchmark/session-capture";
import type { SessionConfirmationRepPlan } from "#benchmark/session-confirmation";

import attempted from "./session-attempt-refusal";
import runClaudeCommand from "./session-claude-runner";

/**
 * Confirmation has already resolved and frozen every input shared by the
 * group. This seam runs only the provider attempt, placing its durable
 * transcript in the rep directory selected by the group adapter.
 */
async function runPreparedSessionAttempt(
	plan: Immutable<SessionConfirmationRepPlan>,
): Promise<SessionAttempt> {
	return await attempted({
		corpusSnapshot: plan.corpusSnapshot,
		home: homedir(),
		projectsDirectory: claudeProjectsDirectory(),
		recordDirectory: plan.recordDirectory,
		runClaude: runClaudeCommand,
		sessionCase: plan.sessionCase,
		settings: plan.settings,
	});
}

export { runPreparedSessionAttempt as default };
