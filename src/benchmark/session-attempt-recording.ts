import { parseClaudeEnvelope, readClaudeCallMetrics } from "./claude";
import type { AttemptOutput, SessionAttempt } from "./session-attempt-contract";
import {
	NO_TRANSCRIPT_PREFIX_ROWS,
	invocationError,
	providerFailureMessage,
} from "./session-attempt-failure";
import { completedAttempt, gradeAttemptState } from "./session-attempt-outcome";
import type { SessionAttemptRequest } from "./session-attempt-preparation-contract";
import {
	preservedTranscript,
	transcriptRecord,
} from "./session-attempt-transcript";
import { preserveStateEvidence } from "./session-state-evidence";

async function recordAttempt(
	request: SessionAttemptRequest,
	attemptDirectory: string,
	attempt: AttemptOutput,
): Promise<SessionAttempt> {
	const cut =
		request.sessionCase.declaration.transcript?.cut ??
		NO_TRANSCRIPT_PREFIX_ROWS;
	const transcript = await preservedTranscript(
		request.recordDirectory,
		attempt.writtenTranscript,
		cut,
	);
	const recorded = transcriptRecord(cut, transcript);

	const envelope = parseClaudeEnvelope(attempt.output);
	const metrics = readClaudeCallMetrics(envelope);
	if (envelope.is_error === true) {
		throw invocationError(
			providerFailureMessage(envelope, "Claude session failed"),
			{ attemptDirectory, recorded, setup: attempt.setup },
			{ contextEvidence: attempt.contextEvidence, metrics },
		);
	}

	const stateEvidenceDirectory = await preserveStateEvidence(
		attemptDirectory,
		request.recordDirectory,
	);
	const stateGrade = await gradeAttemptState(
		request.sessionCase,
		stateEvidenceDirectory,
	);

	return await completedAttempt({
		attempt,
		base: {
			attemptDirectory,
			reply: envelope.result,
			setup: attempt.setup,
			...recorded,
		},
		metrics,
		request,
		stateEvidenceDirectory,
		stateGrade,
		turn: transcript.lines.slice(cut),
	});
}

export { recordAttempt as default };
