import type { Checkpoint } from "#benchmark/compare-attempts";
import { COMPARISON_ARMS } from "#benchmark/comparison-record";
import { claimedReplaySource, readShortIds } from "#benchmark/short-id";
import type { ShortIdEntry } from "#benchmark/short-id";
import { checkpointShortId, shortIdsOf } from "#cli/short-id-column";
import type {
	AnyComparisonReport,
	ArmGroups,
	CaseGroups,
	ComparedCheckpoint,
} from "#server/comparison-provenance-contract";

import { redactAbsolutePaths } from "./redact-path";
import type { Reading } from "./run-record";

const EMPTY_COLLECTION_LENGTH = 0;

async function readCaseClaims(
	runsDirectory: string,
	caseId: string,
): Promise<Reading<{ readonly claims: readonly ShortIdEntry[] }>> {
	try {
		return {
			claims: await readShortIds(runsDirectory, caseId),
			state: "available",
		};
	} catch (error) {
		const message =
			error instanceof Error
				? redactAbsolutePaths(error.message)
				: String(error);

		return {
			reasons: [`the short ids of ${caseId} could not be read: ${message}`],
			state: "unavailable",
		};
	}
}

function checkpointKey(checkpoint: Checkpoint): string {
	return `${checkpoint.stage} ${checkpoint.run}`;
}

interface CheckpointClaims {
	readonly checkpoints: Map<string, Checkpoint>;
	readonly claimed: ShortIdEntry[];
	readonly reasons: string[];
}

interface CheckpointSources {
	readonly checkpoints: readonly Checkpoint[];
	readonly reasons: readonly string[];
}

function armCheckpointSources(
	groups: ArmGroups,
	claims: readonly ShortIdEntry[],
): CheckpointSources {
	if (groups.state === "unavailable") {
		return { checkpoints: [], reasons: groups.reasons };
	}

	const checkpoints: Checkpoint[] = [];
	const reasons: string[] = [];
	for (const group of groups.groups) {
		const source = claimedReplaySource(claims, group.groupId);
		if (source === undefined) {
			reasons.push(`group ${group.groupId} records no checkpoint it replayed`);
		} else {
			checkpoints.push({ run: source.run, stage: source.stage });
		}
	}

	return { checkpoints, reasons };
}

async function recordedCheckpointClaims(
	runsDirectory: string,
	cases: readonly CaseGroups[],
): Promise<CheckpointClaims> {
	const reading: CheckpointClaims = {
		checkpoints: new Map(),
		claimed: [],
		reasons: [],
	};
	await Array.fromAsync(cases, async ({ caseId, arms }) => {
		const registry = await readCaseClaims(runsDirectory, caseId);
		if (registry.state === "unavailable") {
			reading.reasons.push(...registry.reasons);
			return;
		}

		reading.claimed.push(...registry.claims);
		const armSources = COMPARISON_ARMS.map((arm) =>
			armCheckpointSources(arms[arm], registry.claims),
		);
		reading.reasons.push(...armSources.flatMap((each) => each.reasons));
		for (const checkpoint of armSources.flatMap((each) => each.checkpoints)) {
			reading.checkpoints.set(checkpointKey(checkpoint), checkpoint);
		}
	});

	return reading;
}

async function comparedCheckpoint(
	runsDirectory: string,
	report: AnyComparisonReport,
	cases: readonly CaseGroups[],
): Promise<Reading<ComparedCheckpoint>> {
	if (report.mode !== "stage") {
		return {
			reasons: [`a ${report.mode} comparison replays no single checkpoint`],
			state: "unavailable",
		};
	}

	const { checkpoints, claimed, reasons } = await recordedCheckpointClaims(
		runsDirectory,
		cases,
	);

	if (reasons.length > EMPTY_COLLECTION_LENGTH) {
		return { reasons, state: "unavailable" };
	}
	const [only, ...others] = [...checkpoints.values()];
	if (only === undefined || others.length > EMPTY_COLLECTION_LENGTH) {
		return {
			reasons: [`the arms replayed ${String(checkpoints.size)} checkpoints`],
			state: "unavailable",
		};
	}

	const shortId = await checkpointShortId(runsDirectory, shortIdsOf(claimed), {
		run: only.run,
		stage: only.stage,
	});

	return shortId === undefined
		? { state: "available", ...only }
		: { state: "available", ...only, shortId };
}

export { comparedCheckpoint as default };
