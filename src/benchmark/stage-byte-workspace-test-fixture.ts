import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { StageJudgeRecord, StageScorecard } from "./contracts";
import { stageScorecardSchema } from "./contracts";
import type { PendingStage, RunAbort } from "./run-abort";
import { createRunAbort, fileRunArtifactPersistence } from "./run-abort";
import type { TestResources } from "./test-support";
import { fakeRunAbortSignals } from "./test-support";

function unexpectedAbort(): never {
	throw new Error("Stage persistence must not abort the run");
}

const SHA256_HEX_CHARACTER_COUNT = 64;
interface StageByteSession {
	readonly file: string;
	readonly pending: PendingStage;
	readonly record: StageJudgeRecord;
	readonly abort: RunAbort;
	readonly scorecard: StageScorecard;
}
function pendingStage(scorecard: StageScorecard, file: string): PendingStage {
	return {
		file,
		input: scorecard.input,
		judgeModel: "sonnet",
		model: "sonnet",
		sessionBudgetUsd: 5,
		stage: "shape",
	};
}
function completedStageRecord(scorecard: StageScorecard): StageJudgeRecord {
	return {
		...scorecard,
		corpusFiles: [],
		corpusVersion: {
			digest: "a".repeat(SHA256_HEX_CHARACTER_COUNT),
			kind: "version",
		},
		elapsedMs: 10,
		judgeModel: "sonnet",
		model: "sonnet",
		readManifest: [],
		sessionBudgetUsd: 5,
	};
}
class StageByteWorkspace {
	readonly #resources: Readonly<Pick<TestResources, "track">>;
	public constructor(resources: Readonly<Pick<TestResources, "track">>) {
		this.#resources = resources;
	}
	public async prepare(): Promise<StageByteSession> {
		const fixture: unknown = await Bun.file(
			new URL("__fixtures__/stage-record-scorecard.json", import.meta.url),
		).json();
		const scorecard = stageScorecardSchema.parse(fixture);
		const directory = await mkdtemp(join(tmpdir(), "rehearse-stage-bytes-"));
		this.#resources.track(directory);
		const file = join(directory, "stage.json");
		const pending = pendingStage(scorecard, file);
		const record = completedStageRecord(scorecard);
		const abort = createRunAbort(
			{
				...fakeRunAbortSignals(),
				killActiveCommands: unexpectedAbort,
				persistence: fileRunArtifactPersistence,
				reportError: unexpectedAbort,
			},
			{
				artifactFile: join(directory, "artifact.json"),
				operatorStopFile: join(directory, "operator-stop.json"),
				teardown: unexpectedAbort,
			},
		);

		return { abort, file, pending, record, scorecard };
	}
}
export { StageByteWorkspace as default };
