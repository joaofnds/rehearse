import { homedir } from "node:os";

import { sessionCitationMap } from "#benchmark/attempt-corpus-overlay";
import type { Immutable } from "#benchmark/contracts";
import type { HomePathCitationMap } from "#benchmark/home-path-citation";
import type {
	AttemptsInFlight,
	SessionAttempt,
	SessionAttemptRequest,
} from "#benchmark/session-attempt";
import { claudeProjectsDirectory } from "#benchmark/session-capture";
import type { SessionConfirmationRepPlan } from "#benchmark/session-confirmation";
import { createSpendCeiling } from "#benchmark/spend-ceiling";

import attempted from "./session-attempt-refusal";
import runClaudeCommand from "./session-claude-runner";

interface PreparedSessionBoundary {
	readonly readCitations: () => Promise<HomePathCitationMap>;
	readonly runAttempt: (
		request: SessionAttemptRequest,
	) => Promise<SessionAttempt>;
}

const userBoundary: PreparedSessionBoundary = {
	readCitations: async () => await sessionCitationMap(homedir(), Bun.env),
	runAttempt: attempted,
};

/**
 * Confirmation has already resolved and frozen every input shared by the
 * group. The runner this returns runs only the provider attempt, placing its
 * durable transcript in the rep directory selected by the group adapter. It
 * maps the live install's citations at its first attempt and delivers every
 * later one against that map, so one run's attempts cannot install
 * differently when the live install changes while it runs.
 */
function preparedSessionAttempts(
	inFlight: AttemptsInFlight,
	boundary: PreparedSessionBoundary = userBoundary,
): (plan: Immutable<SessionConfirmationRepPlan>) => Promise<SessionAttempt> {
	let liveCitations: Promise<HomePathCitationMap> | undefined = undefined;

	return async (plan) => {
		liveCitations ??= boundary.readCitations();

		return await boundary.runAttempt({
			corpusSnapshot: plan.corpusSnapshot,
			environment: Bun.env,
			home: homedir(),
			inFlight,
			liveCitations: await liveCitations,
			projectsDirectory: claudeProjectsDirectory(),
			recordDirectory: plan.recordDirectory,
			runClaude: runClaudeCommand,
			sessionCase: plan.sessionCase,
			settings: plan.settings,
			spendCeiling: createSpendCeiling({
				ceilingUsd: plan.spendCeilingUsd ?? plan.settings.budgetUsd,
			}),
		});
	};
}

export { preparedSessionAttempts as default };
export type { PreparedSessionBoundary };
