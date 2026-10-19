import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { comparisonRep } from "./comparison-test-fixtures";
import type { RepFixtureOutcomes } from "./comparison-test-fixtures";
import {
	confirmationGroupRecordSchema,
	confirmationRepRecordSchema,
} from "./confirmation-record";
import AttemptRecordData from "./recorded-runs-fixture-attempt-data";
import type {
	RecordedRunsContext,
	RecordedRunsFixtureProps,
} from "./recorded-runs-fixture-context";
import GroupRecordData from "./recorded-runs-fixture-group-data";
import {
	DEFAULT_RECORDED_REP_COUNT,
	FIXTURE_PER_REP_MAXIMUM_USD,
	ORDINAL_BASE,
	PREFIX_START_INDEX,
} from "./recorded-runs-fixture-readings";
import { serialize } from "./recorded-runs-fixture-record-io";
import { confirmationGroupPaths } from "./run-layout";

interface RepRecordFileRequest {
	readonly groupId: string;
	readonly repId: string;
}
interface WriteSessionRepRequest {
	readonly groupId: string;
	readonly repId: string;
	readonly ordinal: number;
}

class ConfirmationGroupWriters {
	private readonly context: RecordedRunsContext;
	public constructor(props: RecordedRunsFixtureProps) {
		this.context = props.context;
	}

	public readonly writeGroupReport = async (groupId: string): Promise<void> => {
		const paths = confirmationGroupPaths(this.context.runsDirectory, groupId);

		await mkdir(paths.directory, { recursive: true });

		await Bun.write(paths.reportFile, serialize(GroupRecordData.groupReport()));
	};

	public readonly writeGroupWithoutCaseId = async (
		groupId: string,
	): Promise<void> => {
		const paths = confirmationGroupPaths(this.context.runsDirectory, groupId);

		await mkdir(paths.directory, { recursive: true });

		await Bun.write(
			paths.groupFile,
			serialize(GroupRecordData.groupFieldsWithoutCaseId(groupId)),
		);
	};

	public readonly writeSessionGroup = async (
		groupId: string,
		recordedReps = DEFAULT_RECORDED_REP_COUNT,
		preflightCostUsd?: number,
	): Promise<readonly [string, string]> => {
		const repIds = [`${groupId}-rep-1`, `${groupId}-rep-2`] as const;
		const paths = confirmationGroupPaths(this.context.runsDirectory, groupId);
		const { caseId } = this.context.sessionAttempt;

		await mkdir(paths.directory, { recursive: true });

		const { groupFile } = paths;
		const sessionGroup = GroupRecordData.sessionGroup({
			caseId,
			groupId,
			preflightCostUsd,
			repIds,
		});

		await Bun.write(groupFile, serialize(sessionGroup));

		await Array.fromAsync(
			repIds.slice(PREFIX_START_INDEX, recordedReps).entries(),
			async ([index, repId]) => {
				await this.writeSessionRep({
					groupId,
					ordinal: index + ORDINAL_BASE,
					repId,
				});
			},
		);

		return repIds;
	};

	public readonly writeSessionRep = async ({
		groupId,
		repId,
		ordinal,
	}: WriteSessionRepRequest): Promise<void> => {
		const { caseId } = this.context.sessionAttempt;
		const rep = confirmationGroupPaths(this.context.runsDirectory, groupId).rep(
			repId,
		);

		await Bun.write(
			rep.recordFile,
			serialize(
				GroupRecordData.sessionRep({ caseId, groupId, ordinal, repId }),
			),
		);

		await Bun.write(
			rep.attemptFile,
			serialize(AttemptRecordData.session(caseId)),
		);
	};

	public readonly writeStageGroupWithReps = async (
		groupId: string,
	): Promise<void> => {
		const paths = confirmationGroupPaths(this.context.runsDirectory, groupId);

		await mkdir(paths.directory, { recursive: true });

		await Bun.write(paths.groupFile, serialize(GroupRecordData.group(groupId)));

		await Array.fromAsync(
			[
				{ build: "pass", ordinal: 1 },
				{ build: "error", ordinal: 2 },
			] as const,
			async ({ ordinal, build }) => {
				const rep = comparisonRep(groupId, ordinal, {
					outcomes: {
						build,
						discussion: "pass",
						final: "pass",
					},
				});
				const { recordFile } = paths.rep(rep.repId);

				await mkdir(dirname(recordFile), { recursive: true });

				const stageRep = confirmationRepRecordSchema.parse({
					...rep,
					finalOutcome: { status: "NOT_APPLICABLE" },
					mode: "stage",
					outcome: "UNSUCCESSFUL",
					stages: rep.stages.filter(({ stage }) => stage === "build"),
				});

				await Bun.write(recordFile, serialize(stageRep));
			},
		);
	};

	public readonly writePipelineGroup = async (
		groupId: string,
		outcomes: readonly (RepFixtureOutcomes | undefined)[],
	): Promise<void> => {
		const paths = confirmationGroupPaths(this.context.runsDirectory, groupId);
		const reps = outcomes.length;

		await mkdir(paths.directory, { recursive: true });

		const { groupFile } = paths;
		const pipelineGroup = confirmationGroupRecordSchema.parse({
			...GroupRecordData.group(groupId),
			declaredStages: ["discuss", "build"],
			mode: "pipeline",
			projectedCost: {
				perRepMaximumUsd: FIXTURE_PER_REP_MAXIMUM_USD,
				reps,
				totalMaximumUsd: FIXTURE_PER_REP_MAXIMUM_USD * reps,
			},
			repRecords: outcomes.map((_outcome, index) => ({
				ordinal: index + ORDINAL_BASE,
				path: `reps/${groupId}-rep-${index + ORDINAL_BASE}/rep.json`,
				repId: `${groupId}-rep-${index + ORDINAL_BASE}`,
			})),
			reps,
		});

		await Bun.write(groupFile, serialize(pipelineGroup));

		await Array.fromAsync(outcomes.entries(), async ([index, outcome]) => {
			if (outcome !== undefined) {
				const rep = comparisonRep(groupId, index + ORDINAL_BASE, {
					outcomes: outcome,
				});
				const { recordFile } = paths.rep(rep.repId);

				await mkdir(dirname(recordFile), { recursive: true });

				await Bun.write(recordFile, serialize(rep));
			}
		});
	};

	public readonly repRecordFile = ({
		groupId,
		repId,
	}: RepRecordFileRequest): string =>
		confirmationGroupPaths(this.context.runsDirectory, groupId).rep(repId)
			.recordFile;

	public readonly writeUnreadableGroup = async (
		groupId: string,
	): Promise<void> => {
		const paths = confirmationGroupPaths(this.context.runsDirectory, groupId);

		await mkdir(paths.directory, { recursive: true });

		await Bun.write(paths.groupFile, "{ not json\n");
	};

	public readonly writeGroup = async (): Promise<void> => {
		const paths = confirmationGroupPaths(
			this.context.runsDirectory,
			this.context.groupId,
		);

		await mkdir(paths.directory, { recursive: true });

		await Bun.write(
			paths.groupFile,
			serialize(GroupRecordData.group(this.context.groupId)),
		);
	};
}
export { ConfirmationGroupWriters as default };
