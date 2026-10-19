import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseConfirmationRepRecord } from "#benchmark/confirmation-record";
import { replayRecordSchema } from "#benchmark/replay-record";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import {
	RecordedRunsFixture,
	directorySource,
} from "#benchmark/run-records-test-support";
import ApiTestHarness from "#server/api-test-harness";

const systems: ApiTestHarness[] = [];

async function startEvidenceApi(
	runsDirectory: string,
): Promise<ApiTestHarness["driver"]> {
	const system = await ApiTestHarness.setup({
		runsDirectory,
		source: directorySource(runsDirectory),
	});
	systems.push(system);

	return system.driver;
}

const RESOURCE_DRAIN_START_INDEX = 0;

const roots: string[] = [];

async function fixture(recordsName?: string): Promise<RecordedRunsFixture> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-attempt-evidence-"));
	roots.push(root);
	const recordsDirectory =
		recordsName === undefined ? root : join(root, recordsName);
	await mkdir(recordsDirectory, { recursive: true });
	const saved = new RecordedRunsFixture(recordsDirectory);
	await saved.write();

	return saved;
}

async function savedReplayRecord(
	saved: Readonly<Pick<RecordedRunsFixture, "stageAttemptFile">>,
): Promise<ReturnType<typeof replayRecordSchema.parse>> {
	return replayRecordSchema.parse(
		JSON.parse(await Bun.file(saved.stageAttemptFile).text()),
	);
}

function sessionId(saved: RecordedRunsFixture): string {
	return `attempt:session:${saved.sessionAttempt.caseId}/${saved.sessionAttempt.uuid}`;
}

function replayId(saved: RecordedRunsFixture): string {
	return `attempt:stage:${saved.stageAttempt.lineage}/${saved.stageAttempt.timestamp}`;
}

async function mustJudgedStep(identity: {
	readonly runsDirectory: string;
	readonly groupId: string;
	readonly repId: string;
	readonly stage: string;
}): Promise<
	Extract<
		ReturnType<typeof parseConfirmationRepRecord>["stages"][number],
		{ readonly status: "JUDGED" }
	>
> {
	const paths = confirmationGroupPaths(
		identity.runsDirectory,
		identity.groupId,
	).rep(identity.repId);
	const outcome = parseConfirmationRepRecord(
		await Bun.file(paths.recordFile).text(),
	).stages.find((stage) => stage.stage === identity.stage);
	if (outcome?.status !== "JUDGED") {
		throw new Error("Missing judged test step");
	}

	return outcome;
}

async function clearAttemptEvidenceRoots(): Promise<void> {
	await Promise.all(
		systems.splice(RESOURCE_DRAIN_START_INDEX).map(async (system) => {
			await system.teardown();
		}),
	);
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

const REPLAY_SCORECARD = {
	grade: {
		dimensions: [],
		grade: "C",
		hardBlockers: [],
		requirements: [
			{
				evidence: [
					{
						claim: "The public field is absent",
						locator: {
							endLine: 1,
							file: "delivery.md",
							kind: "lines",
							occurrences: 1,
							startLine: 1,
						},
						path: "delivery.md",
						quote: "retained output",
						source: "artifact",
					},
				],
				id: "response",
				status: "FAIL",
			},
		],
		summary: "The response omitted hasMore.",
		verdict: "STOP",
	},
	input: {
		artifact: {
			content: "The actual retained output",
			path: "delivery.md",
		},
		diff: "The saved delivery diff",
		transcript: {
			costUsd: 0,
			exchanges: [
				{ agent: { message: "Completed reply", status: "COMPLETE" } },
				{ agent: { message: "A later question", status: "QUESTION" } },
			],
			providerCalls: [],
			sessionId: "saved",
			stage: "build",
		},
	},
};

export {
	fixture,
	mustJudgedStep,
	startEvidenceApi,
	sessionId,
	replayId,
	savedReplayRecord,
	clearAttemptEvidenceRoots,
	REPLAY_SCORECARD,
};
