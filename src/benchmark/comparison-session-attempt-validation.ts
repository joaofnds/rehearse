import type { LoadArmRequest } from "./comparison-evidence-files";
import { evidenceError } from "./comparison-evidence-files";
import { sameValue } from "./comparison-rep-validation";
import {
	assertSessionAttemptChecks,
	sessionFailedChecksStatus,
} from "./comparison-session-attempt-checks";
import type {
	SessionAttemptDefinition,
	SessionAttemptEvidence,
	SessionAttemptPair,
} from "./comparison-session-attempt-contract";
import assertSessionAttemptInputs from "./comparison-session-attempt-inputs";
import sessionProviderMetrics from "./session-provider-metrics";
import { sessionQualityReading } from "./session-quality-reading";

function assertSessionAttemptMetrics(
	request: Readonly<LoadArmRequest>,
	pair: SessionAttemptPair,
	field: string,
): void {
	const { attempt, rep } = pair;
	const expected = sessionProviderMetrics(attempt);
	if (
		!sameValue(rep.metrics, expected.metrics) ||
		rep.workerTrajectorySteps !== expected.workerTrajectorySteps
	) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: `${field}.metrics` },
			"rep metrics disagree with its recorded attempt",
		);
	}
}

function assertSessionAttemptAggregate(
	request: Readonly<LoadArmRequest>,
	{ attempt, rep }: SessionAttemptPair,
	field: string,
): void {
	const [checks] = rep.stages;
	const expectedOutcome =
		attempt.outcome === "SUCCESSFUL" &&
		sessionProviderMetrics(attempt).metrics.status === "COMPLETE"
			? "SUCCESSFUL"
			: "UNSUCCESSFUL";
	if (rep.outcome !== expectedOutcome) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: `${field}.outcome` },
			"rep outcome disagrees with its recorded attempt",
		);
	}
	assertSessionAttemptMetrics(request, { attempt, rep }, field);
	if (!sameValue(rep.judge, sessionQualityReading(attempt.judge))) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: `${field}.judge` },
			"rep Judge result disagrees with its recorded attempt",
		);
	}

	const failedChecksStatus = sessionFailedChecksStatus(attempt.outcome);
	if (
		failedChecksStatus !== undefined &&
		checks?.status !== failedChecksStatus
	) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: `${field}.outcome` },
			failedChecksStatus === "NOT_REACHED"
				? "no-reply attempt must map to a not-reached checks outcome"
				: "failed invocation must map to an execution-failed checks outcome",
		);
	}
}

function assertSessionAttempt(
	request: Readonly<LoadArmRequest>,
	{ group, rep, attempt }: SessionAttemptEvidence,
	{ sessionCase, frozenCorpus, field }: SessionAttemptDefinition,
): void {
	assertSessionAttemptInputs(
		request,
		{ attempt, group, rep },
		{ field, frozenCorpus, sessionCase },
	);
	assertSessionAttemptChecks(request, { attempt, rep }, { field, sessionCase });
	assertSessionAttemptAggregate(request, { attempt, rep }, field);
}

export { assertSessionAttempt as default };
