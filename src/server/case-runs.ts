import { withRecordReadScope } from "#benchmark/record-read-scope";
import { newestFirst } from "#benchmark/recorded-time";
import type { RunLiveness } from "#benchmark/run-liveness";
import type { CaseRunsReading, RecordedCase } from "#server/case-runs-contract";
import groupReps from "#server/case-runs-group-reps";
import pipelineRuns from "#server/case-runs-pipeline";
import { sessionAttempts } from "#server/case-runs-sessions";

/**
 * Every recorded run of every case, the runs a case's figures count, newest
 * first by its name or the start time its attempt or group recorded. A run
 * whose name names no instant follows, then attempts and groups written before
 * they recorded one, session attempts before group reps. Stage replays rerun
 * one stage of a run, not a case, so none is read.
 */
async function readCaseRuns(
	runsDirectory: string,
	liveness: RunLiveness,
): Promise<CaseRunsReading> {
	return await withRecordReadScope(
		async () => await readScopedCaseRuns(runsDirectory, liveness),
	);
}

async function readScopedCaseRuns(
	runsDirectory: string,
	liveness: RunLiveness,
): Promise<CaseRunsReading> {
	const readings = [
		await pipelineRuns(runsDirectory, liveness),
		await sessionAttempts(runsDirectory),
		await groupReps(runsDirectory),
	];
	const runs = newestFirst(
		readings.flatMap(({ found }) => found),
		({ time }) => time,
	);

	const cases = new Map<string, RecordedCase>();
	for (const [id, ofCase] of Map.groupBy(runs, ({ caseId }) => caseId)) {
		cases.set(id, {
			members: ofCase.map(({ run, label, href, time }) => ({
				href,
				label,
				run,
				startedAt: time ?? null,
			})),
			minimumGrade: ofCase.find(
				({ minimumGrade }) => minimumGrade !== undefined,
			)?.minimumGrade,
			runs: ofCase.map(({ run }) => run),
		});
	}

	return {
		cases,
		unreadable: readings.flatMap(({ unreadable }) => unreadable),
	};
}

export { readCaseRuns as default };
export type {
	RecordedCase,
	CaseRunMember,
	UnreadableCaseRecord,
	CaseRunsReading,
} from "#server/case-runs-contract";
