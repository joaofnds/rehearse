import type { LoadArmRequest } from "./comparison-evidence-files";
import { evidenceError } from "./comparison-evidence-files";
import type {
	SessionAttemptPair,
	SessionCheckDefinition,
} from "./comparison-session-attempt-contract";
import { unhandled } from "./contracts";
import type { SessionAttemptRecord } from "./session-record";

const EMPTY_COLLECTION_LENGTH = 0;

function assertSessionAttemptChecks(
	request: Readonly<LoadArmRequest>,
	evidence: SessionAttemptPair,
	definition: SessionCheckDefinition,
): void {
	const { attempt, rep } = evidence;
	const { field } = definition;
	assertSessionAttemptTiming(request, { attempt, rep }, field);
	const failedChecksStatus = sessionFailedChecksStatus(attempt.outcome);
	if (failedChecksStatus !== undefined) {
		if (attempt.checks.length > EMPTY_COLLECTION_LENGTH) {
			throw evidenceError(
				{
					arm: request.role,
					caseId: request.caseId,
					field: `${field}.checks`,
				},
				"an attempt without a checked reply must record no checks",
			);
		}
		return;
	}
	assertSessionChecksDeclaration(request, evidence, definition);
	assertSessionChecksOutcome(request, evidence, definition);
}

function sessionFailedChecksStatus(
	outcome: SessionAttemptRecord["outcome"],
): "NOT_REACHED" | "EXECUTION_FAILED" | undefined {
	switch (outcome) {
		case "NO_REPLY": {
			return "NOT_REACHED";
		}
		case "EXECUTION_FAILED": {
			return "EXECUTION_FAILED";
		}
		case "SUCCESSFUL": {
			return undefined;
		}
		case "UNSUCCESSFUL": {
			return undefined;
		}
		default: {
			return unhandled(outcome, "session attempt outcome");
		}
	}
}

function assertSessionAttemptTiming(
	request: Readonly<LoadArmRequest>,
	{ attempt, rep }: SessionAttemptPair,
	field: string,
): void {
	if (rep.elapsedMs !== attempt.elapsedMs) {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: `${field}.elapsedMs`,
			},
			"rep elapsed time disagrees with its recorded attempt",
		);
	}
	const [checks] = rep.stages;
	if (
		checks !== undefined &&
		"elapsedMs" in checks &&
		checks.elapsedMs !== undefined &&
		checks.elapsedMs !== attempt.elapsedMs
	) {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: `${field}.elapsedMs`,
			},
			"checks elapsed time disagrees with its recorded attempt",
		);
	}
}

function assertSessionChecksDeclaration(
	request: Readonly<LoadArmRequest>,
	{ attempt }: SessionAttemptPair,
	{ sessionCase, field }: SessionCheckDefinition,
): void {
	if (attempt.checks.length !== sessionCase.checks.length) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: `${field}.checks` },
			"attempt check count disagrees with the frozen session case",
		);
	}
	for (const [index, check] of attempt.checks.entries()) {
		if (check.kind !== sessionCase.checks[index]?.kind) {
			throw evidenceError(
				{
					arm: request.role,
					caseId: request.caseId,
					field: `${field}.checks[${index}].kind`,
				},
				"attempt check kind disagrees with the frozen session case",
			);
		}
	}
}

function assertSessionChecksOutcome(
	request: Readonly<LoadArmRequest>,
	{ attempt, rep }: SessionAttemptPair,
	{ field }: SessionCheckDefinition,
): void {
	const [checks] = rep.stages;
	if (attempt.metrics === undefined && checks?.status !== "METRICS_MISSING") {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: `${field}.outcome` },
			"a checked attempt without metrics must map to a metrics-missing checks outcome",
		);
	}
	if (
		attempt.metrics !== undefined &&
		(checks?.status !== "JUDGED" ||
			checks.verdict !==
				(attempt.outcome === "SUCCESSFUL" ? "CONTINUE" : "STOP") ||
			checks.grade !== (attempt.outcome === "SUCCESSFUL" ? "A" : "F"))
	) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: `${field}.outcome` },
			"checked attempt outcome disagrees with its recorded checks result",
		);
	}
}

export { assertSessionAttemptChecks, sessionFailedChecksStatus };
