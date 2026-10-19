import { benchmarkRunPaths, recordedRunNames } from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import type {
	CaseRunOf,
	Found,
	UnreadableCaseRecord,
} from "#server/case-runs-contract";
import { digestOf, unreadableRecord } from "#server/case-runs-contract";
import { readRunRecord } from "#server/run-record";
import type { RunRecord } from "#server/run-record";

const EMPTY_COLLECTION_LENGTH = 0;

function pipelineRun(name: string, record: RunRecord): CaseRunOf {
	const {
		finalOutcome,
		totals: { cost },
	} = record;

	return {
		caseId: record.caseId,
		href: `/runs/${encodeURIComponent(name)}?view=results`,
		label: name,
		minimumGrade: record.minimumGrade,
		run: {
			corpusDigest: digestOf(record.identity.corpusVersion),
			costUsd:
				cost.state === "available" &&
				cost.missing.length === EMPTY_COLLECTION_LENGTH
					? cost.usd
					: undefined,
			passed:
				finalOutcome.status === "JUDGED"
					? finalOutcome.verdict === "PASS"
					: undefined,
		},
		time: name,
	};
}

async function pipelineRuns(
	runsDirectory: string,
	liveness: RunLiveness,
): Promise<Found> {
	const found: CaseRunOf[] = [];
	const unreadable: UnreadableCaseRecord[] = [];
	const recorded = await recordedRunNames(runsDirectory);
	const names = recorded.toSorted((left, right) => right.localeCompare(left));
	await Array.fromAsync(names, async (name) => {
		const { manifestFile } = benchmarkRunPaths(runsDirectory, name);
		if (!(await Bun.file(manifestFile).exists())) {
			return;
		}

		try {
			found.push(
				pipelineRun(
					name,
					await readRunRecord({ run: name, runsDirectory }, liveness),
				),
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			unreadable.push(unreadableRecord({ id: name, reason: message }));
		}
	});

	return { found, unreadable };
}

export { pipelineRuns as default };
