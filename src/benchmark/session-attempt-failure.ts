import {
	failedCommandEnvelope,
	readClaudeCallMetrics,
	spendUsd,
	statedFailure,
} from "./claude";
import { CommandError } from "./command";
import type { ContextEvidence } from "./context-evidence";
import type { ClaudeEnvelope } from "./contracts";
import type {
	FailedInvocationEvidence,
	InvocationFailureEvidence,
	InvocationFailureUsage,
	SessionAttempt,
} from "./session-attempt-contract";
import type { SessionAttemptRequest } from "./session-attempt-preparation-contract";
import {
	preservedTranscript,
	transcriptRecord,
} from "./session-attempt-transcript";
import SessionInvocationError from "./session-invocation-error";

const NO_TRANSCRIPT_PREFIX_ROWS = 0;

async function failedInvocation(
	request: SessionAttemptRequest,
	{ attemptDirectory, writtenTranscript, error }: FailedInvocationEvidence,
	contextEvidence: ContextEvidence | undefined,
): Promise<SessionInvocationError> {
	const cut =
		request.sessionCase.declaration.transcript?.cut ??
		NO_TRANSCRIPT_PREFIX_ROWS;
	const recorded = transcriptRecord(
		cut,
		await preservedTranscript(request.recordDirectory, writtenTranscript, cut),
	);

	if (error instanceof CommandError) {
		const envelope = failedCommandEnvelope(error);
		if (envelope !== undefined) {
			return invocationError(
				providerFailureMessage(envelope, error.message, error.stderr),
				{ attemptDirectory, recorded },
				{ contextEvidence, metrics: readClaudeCallMetrics(envelope) },
			);
		}
	}

	return invocationError(
		error.message,
		{ attemptDirectory, recorded },
		{ contextEvidence, metrics: undefined },
	);
}

function providerFailureMessage(
	envelope: ClaudeEnvelope,
	fallback: string,
	stderr = "",
): string {
	const spent =
		envelope.total_cost_usd === undefined
			? ""
			: ` (spent $${spendUsd(envelope.total_cost_usd)})`;
	const stated = statedFailure(envelope);
	if (stated === undefined) {
		return `${fallback}${spent}`;
	}

	return stderr.trim() === ""
		? `${stated}${spent}`
		: `${stated}${spent}\n${stderr.trimEnd()}`;
}

function invocationError(
	message: string,
	{ attemptDirectory, recorded }: InvocationFailureEvidence,
	{ metrics, contextEvidence }: InvocationFailureUsage = {},
): SessionInvocationError {
	return new SessionInvocationError(
		message,
		preserveContextEvidence(
			{
				attemptDirectory,
				reply: undefined,
				...recorded,
				checks: [],
				contextManifest: undefined,
				metrics,
				outcome: "EXECUTION_FAILED",
			},
			contextEvidence,
		),
	);
}

function preserveContextEvidence(
	attempt: SessionAttempt,
	contextEvidence: ContextEvidence | undefined,
): SessionAttempt {
	if (contextEvidence === undefined) {
		return attempt;
	}

	return { ...attempt, contextEvidence };
}

export {
	NO_TRANSCRIPT_PREFIX_ROWS,
	failedInvocation,
	providerFailureMessage,
	invocationError,
	preserveContextEvidence,
};
