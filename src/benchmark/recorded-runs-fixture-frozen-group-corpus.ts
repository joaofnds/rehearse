import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
	snapshotStageCorpus,
	snapshotStageCorpusWithoutSkill,
	stageCorpusRoots,
} from "./checkpoint";
import { frozenDirectoryFiles, writeFrozenFile } from "./confirmation-evidence";
import type { FrozenFile } from "./confirmation-evidence";
import { resolveCorpusFile } from "./corpus-file";
import type { CorpusRoot } from "./corpus-file";
import type { CorpusMeasurement } from "./corpus-measurement";
import { measureCorpusVersion } from "./corpus-version";
import type {
	RecordedRunsContext,
	RecordedRunsFixtureProps,
} from "./recorded-runs-fixture-context";
import PipelineRecordData from "./recorded-runs-fixture-pipeline-data";
import { confirmationGroupPaths } from "./run-layout";

interface FrozenGroupInputs {
	readonly files: readonly FrozenFile[];
	readonly corpusVersion: CorpusMeasurement;
}
interface FrozenStageCorpusRequest {
	readonly source: CorpusRoot;
	readonly withoutSkillOf: string | undefined;
}
interface FrozenSessionCorpusRequest {
	readonly groupId: string;
	readonly corpusRoot: string;
	readonly layoutPaths: readonly string[];
}

class FrozenGroupCorpus {
	private readonly context: RecordedRunsContext;
	public constructor(props: RecordedRunsFixtureProps) {
		this.context = props.context;
	}
	public readonly stage = async (
		props: FrozenStageCorpusRequest,
	): Promise<FrozenGroupInputs> => {
		const paths = confirmationGroupPaths(
			this.context.runsDirectory,
			this.context.groupId,
		);
		const { pipeline } = PipelineRecordData.manifest({
			sourceRoot: this.context.sourceRoot,
			timestamp: this.context.replayableRun,
		});
		const instructions = await Bun.file(
			resolveCorpusFile(props.source, "CLAUDE.md"),
		).text();
		const corpusDirectory = join(paths.inputsDirectory, "corpus");

		await Array.fromAsync(pipeline.stages, async (stage) => {
			const snapshot =
				stage.name === props.withoutSkillOf
					? snapshotStageCorpusWithoutSkill
					: snapshotStageCorpus;
			await snapshot(
				{ instructions, skill: stage.skill },
				stageCorpusRoots(props.source, this.context.sourceRoot),
				join(corpusDirectory, stage.name),
			);
		});

		const files = [
			...(await frozenDirectoryFiles(
				paths.directory,
				corpusDirectory,
				"corpus",
			)),
			await writeFrozenFile(paths.directory, {
				content: PipelineRecordData.pipelineJson(pipeline),
				kind: "pipeline",
				path: join(paths.inputsDirectory, "pipeline.json"),
			}),
		];
		const corpusVersion = await measureCorpusVersion(
			this.context.runsDirectory,
			props.source,
		);

		return { corpusVersion, files };
	};
	public readonly session = async (
		props: FrozenSessionCorpusRequest,
	): Promise<FrozenGroupInputs> => {
		const paths = confirmationGroupPaths(
			this.context.runsDirectory,
			props.groupId,
		);
		const corpusDirectory = join(paths.inputsDirectory, "corpus");

		await Array.fromAsync(props.layoutPaths, async (layoutPath) => {
			await mkdir(dirname(join(corpusDirectory, layoutPath)), {
				recursive: true,
			});
			await Bun.write(
				join(corpusDirectory, layoutPath),
				Bun.file(join(props.corpusRoot, layoutPath)),
			);
		});

		const files = [
			...(await frozenDirectoryFiles(
				paths.directory,
				corpusDirectory,
				"corpus",
			)),
		];
		const corpusVersion = await measureCorpusVersion(
			this.context.runsDirectory,
			{ kind: "directory", root: props.corpusRoot },
		);

		return { corpusVersion, files };
	};
}
export { FrozenGroupCorpus as default };
