import { homedir } from "node:os";

import type { SessionCase } from "#benchmark/case";
import type { SessionRunConfig } from "#benchmark/config";
import type { Immutable } from "#benchmark/contracts";
import { claudeProjectsDirectory } from "#benchmark/session-capture";
import type { SessionAttemptRecord } from "#benchmark/session-record";
import type { CommandOutput } from "#cli/output";

import runClaudeCommand from "./session-claude-runner";
import type { SessionRunRequest } from "./session-run-contract";

interface SessionRunInputs {
	readonly sessionCase: SessionCase;
	readonly config: SessionRunConfig;
}

function defaultSessionRunRequest(
	{ sessionCase, config }: SessionRunInputs,
	runsDirectory: string,
	spendCeilingUsd: number,
): SessionRunRequest {
	return {
		config,
		environment: Bun.env,
		home: homedir(),
		projectsDirectory: claudeProjectsDirectory(),
		runClaude: runClaudeCommand,
		runsDirectory,
		sessionCase,
		spendCeilingUsd,
	};
}

function reportSessionChecks(
	record: Immutable<SessionAttemptRecord>,
	output: CommandOutput,
): void {
	for (const check of record.checks) {
		output.stderr(`${check.status} ${check.kind}: ${check.detail}\n`);
	}
}

export { default as runPreparedSessionAttempt } from "./prepared-session-command";
export { default as runClaudeCommand } from "./session-claude-runner";
export { default as runSessionDebugAttempt } from "./session-debug-attempt";
export type {
	SessionRunOutcome,
	SessionRunRequest,
} from "./session-run-contract";
export { defaultSessionRunRequest, reportSessionChecks };
