import { readAttemptContext } from "./session-attempt-context";
import type {
	CompletedAttemptEvidence,
	SessionAttempt,
	StateGrade,
} from "./session-attempt-contract";
import { preserveContextEvidence } from "./session-attempt-failure";
import type { SessionAttemptRequest } from "./session-attempt-preparation-contract";
import { evaluateChecks } from "./session-check";
import { gradeCaseState } from "./session-state-check";
import { toolUses } from "./transcript";

async function gradeAttemptState(
	sessionCase: SessionAttemptRequest["sessionCase"],
	evidenceDirectory: string,
): Promise<StateGrade> {
	const graded = await gradeCaseState(sessionCase, evidenceDirectory);
	if (graded === undefined) {
		return {};
	}

	return graded.kind === "results"
		? { stateResults: graded.results }
		: { stateGradingError: graded.detail };
}

async function completedAttempt({
	request,
	attempt,
	base,
	turn,
	metrics,
	stateEvidenceDirectory,
	stateGrade,
}: CompletedAttemptEvidence): Promise<SessionAttempt> {
	const { reply } = base;
	if (reply === undefined) {
		return preserveContextEvidence(
			{
				...base,
				checks: [],
				contextManifest: undefined,
				metrics,
				outcome: "NO_REPLY",
				stateEvidenceDirectory,
				...stateGrade,
			},
			attempt.contextEvidence,
		);
	}

	const result = evaluateChecks(request.sessionCase.checks, {
		reply,
		toolUses: toolUses(turn),
	});

	return preserveContextEvidence(
		{
			...base,
			checks: result.results,
			...(await readAttemptContext({
				attemptDirectory: base.attemptDirectory,
				installedCorpus: attempt.corpusOverlay.installed,
				request,
				turn,
			})),
			metrics,
			outcome: result.outcome,
			stateEvidenceDirectory,
			...stateGrade,
		},
		attempt.contextEvidence,
	);
}

export { gradeAttemptState, completedAttempt };
