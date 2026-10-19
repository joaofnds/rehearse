import { join } from "node:path";

import type { Immutable } from "./contracts";
import { statIfExists } from "./file-presence";
import type {
	Assessment,
	RegradedCheck,
	StateGradeProblem,
} from "./session-assessment";
import type { RegradeRequest } from "./session-regrade-evidence";
import type { StateResult } from "./session-state-check";
import { gradeCaseState } from "./session-state-check";
import { STATE_EVIDENCE_DIRECTORY } from "./session-state-evidence";

interface StateGrade {
	readonly stateCheck?: StateGradeProblem | undefined;
	readonly stateResults?: readonly StateResult[] | undefined;
}

const NO_STATE_EVIDENCE_DETAIL =
	"the attempt preserved no files or git state, so its state scorer has nothing to grade";

/**
 * The grade runs against a fresh restore of the preserved tree rather than
 * against the tree itself, which is what lets a second pass read the same
 * bytes the first did even when the scorer writes.
 *
 * An attempt saved before retention existed has no `state/` beside it. That
 * is evidence the attempt never preserved, not a scorer that failed, so it is
 * reported as unavailable rather than run against an empty directory, which
 * would grade the absence of the session's work as the session's work.
 */
async function regradeState(
	request: Immutable<RegradeRequest>,
): Promise<StateGrade> {
	if (request.sessionCase.stateCheck === undefined) {
		return {};
	}

	const evidenceDirectory = join(
		request.paths.directory,
		STATE_EVIDENCE_DIRECTORY,
	);
	const preserved = await statIfExists(evidenceDirectory);
	if (preserved === undefined) {
		return {
			stateCheck: {
				detail: NO_STATE_EVIDENCE_DETAIL,
				status: "UNAVAILABLE",
			},
		};
	}

	const graded = await gradeCaseState(request.sessionCase, evidenceDirectory);
	if (graded === undefined) {
		return {};
	}

	return graded.kind === "results"
		? { stateResults: graded.results }
		: { stateCheck: { detail: graded.detail, status: "ERROR" } };
}

/**
 * A grade over a subset of the declared checks is not a grade of the
 * definition, so the verdict is withheld entirely rather than computed over
 * whatever had evidence.
 */
function verdictOver(
	checks: readonly RegradedCheck[],
	state: Readonly<StateGrade>,
): Assessment["outcome"] {
	if (
		state.stateCheck !== undefined ||
		checks.some(({ status }) => status === "UNAVAILABLE")
	) {
		return undefined;
	}

	const passed = [...checks, ...(state.stateResults ?? [])].every(
		({ status }) => status === "PASS",
	);

	return passed ? "SUCCESSFUL" : "UNSUCCESSFUL";
}
export { regradeState, verdictOver };
