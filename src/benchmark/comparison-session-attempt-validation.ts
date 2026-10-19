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

const SINGLE_ITEM_COUNT = 1;

const EMPTY_COLLECTION_LENGTH = 0;

const NO_WORKER_TRAJECTORY_STEPS = 0;

function assertSessionAttemptMetrics(
	request: Readonly<LoadArmRequest>,
	pair: SessionAttemptPair,
	field: string,
): void {
	const { attempt, rep } = pair;
	if (attempt.metrics === undefined) {
		assertSessionMissingMetrics(request, pair, field);
		return;
	}
	if (rep.metrics.status !== "COMPLETE") {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: `${field}.metrics` },
			"rep records missing metrics for an attempt with metrics",
		);
	}
	const [workerCall] = rep.metrics.calls;
	if (
		rep.metrics.calls.length !== SINGLE_ITEM_COUNT ||
		workerCall?.role !== "worker" ||
		!sameValue(workerCall.metrics, attempt.metrics) ||
		rep.workerTrajectorySteps !== attempt.metrics.turns
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
		attempt.outcome === "SUCCESSFUL" && attempt.metrics !== undefined
			? "SUCCESSFUL"
			: "UNSUCCESSFUL";
	if (rep.outcome !== expectedOutcome) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: `${field}.outcome` },
			"rep outcome disagrees with its recorded attempt",
		);
	}
	assertSessionAttemptMetrics(request, { attempt, rep }, field);
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

function assertSessionMissingMetrics(
	request: Readonly<LoadArmRequest>,
	{ rep }: SessionAttemptPair,
	field: string,
): void {
	if (rep.metrics.status !== "MISSING") {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: `${field}.metrics`,
			},
			"rep records complete metrics for an attempt with missing metrics",
		);
	}
	if (
		rep.metrics.calls.length > EMPTY_COLLECTION_LENGTH ||
		rep.workerTrajectorySteps !== NO_WORKER_TRAJECTORY_STEPS
	) {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: `${field}.metrics`,
			},
			"rep metrics disagree with its attempt's missing metrics",
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
