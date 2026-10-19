import { createHash } from "node:crypto";

import type { SessionCase } from "./case";
import type { Immutable } from "./contracts";
import { jsonValueSchema } from "./json-value";
import type { Assessment } from "./session-assessment";
import { evaluateChecks } from "./session-check";
import { orderedForHashing } from "./session-lineage";
import type { RegradeRequest } from "./session-regrade-evidence";
import {
	evidenceNeededBy,
	recordedBoundary,
	savedEvidence,
	unavailable,
} from "./session-regrade-evidence";
import { regradeState, verdictOver } from "./session-regrade-state";
/**
 * The identity of the definition that produced an assessment, which nothing
 * else on a record carries. `sessionUpstreamDigest` hashes the transcript,
 * fixture, prompt, tools, settings, agents, project files and state scorer,
 * but not `checks`, so two cases differing only in a reply check share a
 * lineage and lineage cannot say which definition graded an attempt.
 *
 * The scorer's own bytes are deliberately not a component: they live inside
 * the fixture, which lineage already hashes whole, and every record carries a
 * lineage. `checks` is the one grading input nothing pins. Corpus, model and
 * effort stay out because they name the arm rather than the grader.
 */
function gradingDefinitionDigest(sessionCase: Immutable<SessionCase>): string {
	const definition = jsonValueSchema.parse({
		checks: sessionCase.checks,
		stateCheck: sessionCase.stateCheck ?? null,
	});

	return createHash("sha256")
		.update(JSON.stringify(orderedForHashing(definition)))
		.digest("hex");
}

/**
 * A check whose evidence the attempt does not hold is set aside before
 * grading rather than graded and overwritten, so `evaluateChecks` is handed
 * only checks the evidence can answer and the algorithm that graded the
 * original attempt is the one that regrades it. The two lists are re-joined
 * on the position each check holds in the case's declaration, which is what
 * keeps a case declaring the same check twice from collapsing into one.
 */
async function regradeAttempt(
	request: Immutable<RegradeRequest>,
): Promise<Assessment> {
	const boundary = recordedBoundary(request.record);
	const { evidence, digests, held } = await savedEvidence(request, boundary);
	const gradable = request.sessionCase.checks
		.map((check, position) => ({ check, position }))
		.filter(({ check }) => held[evidenceNeededBy(check)]);

	const graded = evaluateChecks(
		gradable.map(({ check }) => check),
		evidence,
	);
	const byPosition = new Map(
		gradable.map(({ position }, index) => [position, graded.results[index]]),
	);

	const checks = request.sessionCase.checks.map(
		(check, position) => byPosition.get(position) ?? unavailable(check),
	);
	const state = await regradeState(request);

	return {
		checks,
		evidence: digests,
		gradingDefinition: gradingDefinitionDigest(request.sessionCase),
		sourceAttempt: request.attemptId,
		...state,
		outcome: verdictOver(checks, state),
	};
}
export { gradingDefinitionDigest, regradeAttempt };
export {
	assessmentSchema,
	parseAssessment,
	writeAssessment,
} from "./session-assessment";
export type {
	Assessment,
	RegradedCheck,
	EvidenceDigests,
	StateGradeProblem,
} from "./session-assessment";
export type { RegradeRequest } from "./session-regrade-evidence";
