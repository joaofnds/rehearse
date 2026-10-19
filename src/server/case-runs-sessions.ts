import type { Immutable } from "#benchmark/contracts";
import { sessionAttemptIds, sessionAttemptPaths } from "#benchmark/run-layout";
import {
	attemptStartedAt,
	parseSessionAttemptRecord,
} from "#benchmark/session-record";
import type { SessionAttemptRecord } from "#benchmark/session-record";
import type { CaseRun } from "#server/case-figures";
import type {
	CaseRunOf,
	Found,
	UnreadableCaseRecord,
} from "#server/case-runs-contract";
import { digestOf, unreadableRecord } from "#server/case-runs-contract";
import savedStateAssessment from "#server/saved-state-assessment";

const ATTEMPT_UUID_PREVIEW_CHARACTERS = 8;

const PREFIX_START_INDEX = 0;

async function sessionAttempts(runsDirectory: string): Promise<Found> {
	const found: CaseRunOf[] = [];
	const unreadable: UnreadableCaseRecord[] = [];
	await Array.fromAsync(
		await sessionAttemptIds(runsDirectory),
		async (attempt) => {
			const file = Bun.file(
				sessionAttemptPaths(runsDirectory, attempt).recordFile,
			);
			if (!(await file.exists())) {
				return;
			}

			try {
				const record = parseSessionAttemptRecord(await file.text());
				found.push({
					caseId: attempt.caseId,
					href: `/attempts/session/${encodeURIComponent(attempt.caseId)}/${encodeURIComponent(attempt.uuid)}`,
					label: `Session ${attempt.uuid.slice(PREFIX_START_INDEX, ATTEMPT_UUID_PREVIEW_CHARACTERS)}`,
					run: sessionAttemptRun(record),
					time: attemptStartedAt(record),
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				unreadable.push(
					unreadableRecord({
						id: `${attempt.caseId}/${attempt.uuid}`,
						reason: message,
					}),
				);
			}
		},
	);

	return { found, unreadable };
}

function sessionAssessment(
	record: Immutable<SessionAttemptRecord>,
): Pick<CaseRun, "savedState" | "recordedOutcome" | "replyChecks"> {
	const checksRan =
		record.outcome === "SUCCESSFUL" || record.outcome === "UNSUCCESSFUL";
	const assessment = {
		recordedOutcome: record.outcome,
		savedState: savedStateAssessment(record),
	};
	if (checksRan) {
		return {
			...assessment,
			replyChecks: {
				passed: record.checks.filter(({ status }) => status === "PASS").length,
				total: record.checks.length,
			},
		};
	}
	return assessment;
}

/** Checks ran for a reply that came back, and for nothing else. */
function sessionAttemptRun(record: Immutable<SessionAttemptRecord>): CaseRun {
	return {
		corpusDigest: digestOf(record.corpusVersion),
		costUsd: record.metrics?.costUsd,
		passed:
			record.outcome === "SUCCESSFUL" || record.outcome === "UNSUCCESSFUL"
				? record.outcome === "SUCCESSFUL"
				: undefined,
		...sessionAssessment(record),
	};
}

export { sessionAttempts, sessionAssessment, sessionAttemptRun };
