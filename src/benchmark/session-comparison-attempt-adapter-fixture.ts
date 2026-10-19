import { join } from "node:path";

import type { Immutable } from "./contracts";
import type { SessionAttempt } from "./session-attempt";
import {
	attemptChecks,
	attemptMetrics,
	attemptStateResults,
	unavailableTranscriptDiagnostics,
} from "./session-comparison-attempt-test-fixture";
import type {
	ComparisonGroupIdentity,
	ManifestCases,
} from "./session-comparison-test-contract";
import { FIRST_REP_ORDINAL } from "./session-comparison-test-contract";
import type {
	SessionConfirmationDependencies,
	SessionConfirmationRepPlan,
} from "./session-confirmation";
import SessionInvocationError from "./session-invocation-error";

interface AttemptScenario extends ComparisonGroupIdentity, ManifestCases {}

class SessionComparisonAttemptAdapter implements SessionConfirmationDependencies {
	public constructor(private readonly scenario: AttemptScenario) {}

	public async executeAttempt(
		plan: Immutable<SessionConfirmationRepPlan>,
	): Promise<SessionAttempt> {
		const checkedAttempt = await this.checkedAttempt(plan);
		const replyless = { ...checkedAttempt, checks: [], reply: undefined };

		switch (
			this.scenario.selectVariant?.(
				this.scenario.caseId,
				this.scenario.role,
				plan.ordinal,
			)
		) {
			case "execution-failed": {
				throw new SessionInvocationError("provider rejected the session", {
					...replyless,
					outcome: "EXECUTION_FAILED",
				});
			}
			case "no-reply": {
				return { ...replyless, outcome: "NO_REPLY" };
			}
			case "missing-metrics": {
				return { ...checkedAttempt, metrics: undefined };
			}
			case "pass": {
				return { ...checkedAttempt, outcome: "SUCCESSFUL" };
			}
			case "fail": {
				return { ...checkedAttempt, outcome: "UNSUCCESSFUL" };
			}
			case undefined: {
				return checkedAttempt;
			}
			default: {
				throw new Error("Unhandled session attempt variant");
			}
		}
	}

	private async checkedAttempt(
		plan: Immutable<SessionConfirmationRepPlan>,
	): Promise<SessionAttempt> {
		const { caseId, role, stateCheck } = this.scenario;
		const transcriptFile = join(plan.recordDirectory, "transcript.jsonl");

		await Bun.write(transcriptFile, `rep ${plan.ordinal}\n`);

		const pass =
			role === "candidate" ||
			(role === "baseline" &&
				(caseId === "case-two" || plan.ordinal === FIRST_REP_ORDINAL));

		return {
			attemptDirectory: join(plan.recordDirectory, "execution"),
			checks: attemptChecks(caseId, pass, plan.ordinal),
			contextManifest: undefined,
			metrics: attemptMetrics(caseId, plan.ordinal),
			outcome: pass ? "SUCCESSFUL" : "UNSUCCESSFUL",
			reply: pass ? "OK" : "too many words",
			stateResults:
				stateCheck === undefined
					? undefined
					: attemptStateResults(stateCheck, pass),
			transcriptDiagnostics: unavailableTranscriptDiagnostics,
			transcriptFile,
		};
	}
}

export { SessionComparisonAttemptAdapter as default };
