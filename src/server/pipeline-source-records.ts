import { parseConfirmationGroupRecord } from "#benchmark/confirmation-record";
import { loadRunManifest } from "#benchmark/manifest";
import {
	benchmarkRunPaths,
	confirmationGroupIds,
	confirmationGroupPaths,
	recordedRunNames,
} from "#benchmark/run-layout";
import type {
	Reading,
	RecordedGroup,
	RecordedRun,
	UnreadablePipelineRecord,
} from "#server/pipelines-contract";
import { redactAbsolutePaths } from "#server/redact-path";

async function recordedRuns(
	runsDirectory: string,
): Promise<Reading<RecordedRun>> {
	const found: RecordedRun[] = [];
	const unreadable: UnreadablePipelineRecord[] = [];
	const recorded = await recordedRunNames(runsDirectory);
	const names = recorded.toSorted((left, right) => right.localeCompare(left));
	await Array.fromAsync(names, async (name) => {
		const { manifestFile } = benchmarkRunPaths(runsDirectory, name);
		if (!(await Bun.file(manifestFile).exists())) {
			return;
		}

		try {
			found.push({ manifest: await loadRunManifest(manifestFile), name });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			unreadable.push({ id: name, reason: redactAbsolutePaths(message) });
		}
	});

	return { found, unreadable };
}

/** Pipeline groups in group id order; the task orders them by start time. */
async function recordedGroups(
	runsDirectory: string,
): Promise<Reading<RecordedGroup>> {
	const found: RecordedGroup[] = [];
	const unreadable: UnreadablePipelineRecord[] = [];
	const recorded = await confirmationGroupIds(runsDirectory);
	await Array.fromAsync(
		recorded.toSorted((left, right) => left.localeCompare(right)),
		async (groupId) => {
			const file = Bun.file(
				confirmationGroupPaths(runsDirectory, groupId).groupFile,
			);
			if (!(await file.exists())) {
				return;
			}

			try {
				const record = parseConfirmationGroupRecord(await file.text());
				if (record.mode !== "pipeline") {
					return;
				}

				found.push({
					caseId: record.caseId,
					corpusVersion: record.inputs.corpusVersion,
					pipelinePath: record.inputs.pipelinePath,
					reps: record.reps,
					stages: record.declaredStages,
					startedAt: record.startedAt,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				unreadable.push({ id: groupId, reason: redactAbsolutePaths(message) });
			}
		},
	);

	return { found, unreadable };
}

export { recordedRuns, recordedGroups };
