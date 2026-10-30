import type {
	ComparisonArmEvidence,
	ComparisonCaseEvidence,
} from "./comparison-evidence";
import { COMPARISON_ARMS } from "./comparison-record-source-schema";
import type { Immutable } from "./contracts";
import type { LiveCorpusRead } from "./live-corpus-reads";

const NO_CALLS = 0;

const ONE_CALL = 1;

/** A session rep's reads are its attempt's; a stage rep's are its stages'. */
function repLiveReads(
	rep: Immutable<ComparisonArmEvidence["reps"][number]>,
): Immutable<LiveCorpusRead[]> {
	const stageReads = rep.record.stages.flatMap((stage) =>
		"liveReads" in stage ? (stage.liveReads ?? []) : [],
	);

	return [
		...stageReads,
		...(rep.attempt?.record.corpusDelivery?.liveReads ?? []),
	];
}

function armLiveReads(
	arm: Immutable<ComparisonArmEvidence>,
): ReadonlyMap<string, number> {
	const counts = new Map<string, number>();
	for (const { path, count } of arm.reps.flatMap(repLiveReads)) {
		counts.set(path, (counts.get(path) ?? NO_CALLS) + count);
	}

	return counts;
}

/**
 * One line for each arm whose sessions reached a file the install held through
 * its live copy, since that arm measured the live file rather than its own,
 * and its result says nothing about the file under test.
 */
function liveReadNotices(
	cases: Immutable<readonly ComparisonCaseEvidence[]>,
): readonly string[] {
	return cases.flatMap(({ caseId, arms }) =>
		COMPARISON_ARMS.flatMap((role) => {
			const reads = [...armLiveReads(arms[role])].toSorted(([left], [right]) =>
				left.localeCompare(right),
			);
			if (reads.length === NO_CALLS) {
				return [];
			}
			const files = reads.map(
				([path, count]) =>
					`${path} (${count} ${count === ONE_CALL ? "call" : "calls"})`,
			);

			return [
				`case ${caseId} arm ${role} read files under test through the live install, so it measured the live copy of: ${files.join(", ")}`,
			];
		}),
	);
}

export { liveReadNotices as default };
