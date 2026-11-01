import attemptCorpusDelivery from "./attempt-corpus-delivery";
import { parseClaudeEnvelope, readClaudeCallMetrics } from "./claude";
import type {
	AttemptOutput,
	PreservedTranscript,
	SessionAttempt,
	TranscriptRecord,
} from "./session-attempt-contract";
import {
	NO_TRANSCRIPT_PREFIX_ROWS,
	invocationError,
	providerFailureMessage,
} from "./session-attempt-failure";
import judgeCompletedAttempt from "./session-attempt-judge";
import { completedAttempt, gradeAttemptState } from "./session-attempt-outcome";
import type { SessionAttemptRequest } from "./session-attempt-preparation-contract";
import {
	preservedTranscript,
	transcriptRecord,
} from "./session-attempt-transcript";
import { preserveStateEvidence } from "./session-state-evidence";

interface RecordedTurn {
	readonly corpusDelivery: SessionAttempt["corpusDelivery"];
	readonly recorded: TranscriptRecord;
	readonly turn: PreservedTranscript["lines"];
}

/**
 * The turn the attempt recorded, read once for both its transcript record
 * and the live reads its corpus delivery reports.
 */
async function recordedTurn(
	request: SessionAttemptRequest,
	attempt: AttemptOutput,
): Promise<RecordedTurn> {
	const cut =
		request.sessionCase.declaration.transcript?.cut ??
		NO_TRANSCRIPT_PREFIX_ROWS;
	const transcript = await preservedTranscript(
		request.recordDirectory,
		attempt.writtenTranscript,
		cut,
	);
	const turn = transcript.lines.slice(cut);

	return {
		corpusDelivery: await attemptCorpusDelivery(
			attempt.corpusOverlay,
			turn,
			request.recordDirectory,
		),
		recorded: transcriptRecord(cut, transcript),
		turn,
	};
}

async function recordAttempt(
	request: SessionAttemptRequest,
	attemptDirectory: string,
	attempt: AttemptOutput,
): Promise<SessionAttempt> {
	const { corpusDelivery, recorded, turn } = await recordedTurn(
		request,
		attempt,
	);

	const envelope = parseClaudeEnvelope(attempt.output);
	const metrics = readClaudeCallMetrics(envelope);
	if (envelope.is_error === true) {
		throw invocationError(
			providerFailureMessage(envelope, "Claude session failed"),
			{ attemptDirectory, corpusDelivery, recorded, setup: attempt.setup },
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

	const completed = await completedAttempt({
		attempt,
		base: {
			attemptDirectory,
			corpusDelivery,
			reply: envelope.result,
			setup: attempt.setup,
			...recorded,
		},
		metrics,
		request,
		stateEvidenceDirectory,
		stateGrade,
		turn,
	});

	return await judgeCompletedAttempt(request, completed, {
		stateDirectory: stateEvidenceDirectory,
		workerCostUsd: envelope.total_cost_usd,
	});
}

export { recordAttempt as default };
