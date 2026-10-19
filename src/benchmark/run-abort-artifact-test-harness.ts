import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PipelineDefinition } from "./pipeline";
import { loadPipeline } from "./pipeline";
import type { RunAbort, RunAbortDependencies } from "./run-abort";
import RunAbortBuilder from "./run-abort-test-builder";
import { buildRunArtifact } from "./run-artifact";
import RunArtifactInputsBuilder from "./run-artifact-inputs-builder";
import ControlledRunArtifactPersistence from "./run-artifact-persistence-test-fixture";
import type { TestResources } from "./test-support";
import {
	AUDIT_LOG_PIPELINE_PATH,
	AUDIT_LOG_RUBRICS_PATH,
} from "./test-support";

async function loadDefaultPipeline(): Promise<PipelineDefinition> {
	return await loadPipeline(AUDIT_LOG_PIPELINE_PATH, AUDIT_LOG_RUBRICS_PATH);
}

type RunArtifact = ReturnType<typeof buildRunArtifact>;

interface RecordedRunAbort {
	readonly abort: RunAbort;
	readonly artifact: RunArtifact;
	readonly artifactFile: string;
	readonly persistence: ControlledRunArtifactPersistence;
}

class RunAbortArtifactHarness {
	public readonly persistence = new ControlledRunArtifactPersistence();
	public readonly artifactFile = "/runs/run.json";
	public readonly abort: RunAbort;

	public constructor(
		props: Partial<Pick<RunAbortDependencies, "elapsedMs" | "runEvents">> = {},
	) {
		this.abort = new RunAbortBuilder({
			dependencies: { persistence: this.persistence, ...props },
			request: { artifactFile: this.artifactFile },
		}).build();
	}

	public async loadArtifact(): Promise<RecordedRunAbort> {
		const pipeline = await loadDefaultPipeline();
		const artifact = buildRunArtifact(
			new RunArtifactInputsBuilder()
				.withPipeline(pipeline, AUDIT_LOG_PIPELINE_PATH)
				.build(),
		);

		return {
			abort: this.abort,
			artifact,
			artifactFile: this.artifactFile,
			persistence: this.persistence,
		};
	}
}

interface FileArtifactRequest {
	readonly resources: Pick<TestResources, "track">;
	readonly prefix?: string;
	readonly dependencies?: Partial<RunAbortDependencies>;
}

interface FileArtifactRunAbort {
	readonly directory: string;
	readonly artifactFile: string;
	readonly stageFile: string;
	readonly artifact: RunArtifact;
	readonly abort: RunAbort;
}

async function openFileArtifactRunAbort({
	resources,
	prefix = "rehearse-run-abort-",
	dependencies = {},
}: FileArtifactRequest): Promise<FileArtifactRunAbort> {
	const directory = await mkdtemp(join(tmpdir(), prefix));

	resources.track(directory);

	const artifactFile = join(directory, "run.json");
	const pipeline = await loadDefaultPipeline();
	const artifact = buildRunArtifact(
		new RunArtifactInputsBuilder()
			.withPipeline(pipeline, AUDIT_LOG_PIPELINE_PATH)
			.build(),
	);
	const abort = new RunAbortBuilder({
		dependencies,
		request: {
			artifactFile,
			operatorStopFile: join(directory, "operator-stop.json"),
		},
	}).build();

	return {
		abort,
		artifact,
		artifactFile,
		directory,
		stageFile: join(directory, "shape.json"),
	};
}

export {
	RunAbortArtifactHarness,
	loadDefaultPipeline,
	openFileArtifactRunAbort,
};
