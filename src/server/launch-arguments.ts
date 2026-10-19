import {
	CaseDeclarationError,
	caseDeclarationPath,
	isCaseId,
	readCaseDeclaration,
} from "#benchmark/case";
import { consumedCheckpointStage } from "#benchmark/checkpoint";
import { refusePipelineUnderLinkedDirectory } from "#benchmark/corpus-source";
import { loadRunManifest } from "#benchmark/manifest";
import {
	benchmarkRunPaths,
	checkpointRecorded,
	recordedRunNames,
} from "#benchmark/run-layout";
import {
	HTTP_STATUS_CONFLICT,
	HTTP_STATUS_NOT_FOUND,
} from "#server/http-status";
import { LaunchRefusalError, asLaunchRefusal } from "#server/launch-refusal";
import type { LaunchDependencies } from "#server/launches-contract";
import { redactAbsolutePaths } from "#server/redact-path";

async function caseRecorded(
	caseId: string,
	casesRoot: string,
): Promise<boolean> {
	return await (isCaseId(caseId)
		? Bun.file(caseDeclarationPath(caseId, casesRoot)).exists()
		: Promise.resolve(false));
}

async function caseArguments(
	caseId: string,
	attempts: number,
	dependencies: LaunchDependencies,
): Promise<readonly string[]> {
	const declaration = await recordedCaseDeclaration({
		caseId,
		casesRoot: dependencies.casesRoot,
	});
	if (declaration.model === undefined) {
		throw new LaunchRefusalError(
			`Case ${caseId} declares no model, and a launch from the browser has no terminal to pick one on. Declare "model" in its case.json.`,
			HTTP_STATUS_CONFLICT,
		);
	}

	if (declaration.kind === "pipeline") {
		await asLaunchRefusal(async () => {
			await refusePipelineUnderLinkedDirectory(dependencies.runsDirectory);
		});
	}

	return [
		"run",
		"--case",
		declaration.id,
		"--model",
		declaration.model,
		...confirmationArguments(attempts),
	];
}

interface CaseLaunchSelection {
	readonly caseId: string;
	readonly casesRoot: string;
}

async function recordedCaseDeclaration({
	caseId,
	casesRoot,
}: CaseLaunchSelection): ReturnType<typeof readCaseDeclaration> {
	if (!(await caseRecorded(caseId, casesRoot))) {
		throw new LaunchRefusalError(
			`Unknown case ${caseId}`,
			HTTP_STATUS_NOT_FOUND,
		);
	}

	try {
		return await readCaseDeclaration(caseId, casesRoot);
	} catch (error) {
		if (!(error instanceof CaseDeclarationError)) {
			throw error;
		}

		throw new LaunchRefusalError(
			redactAbsolutePaths(error.message),
			HTTP_STATUS_CONFLICT,
		);
	}
}

const MISSING_SEQUENCE_INDEX = -1;

interface ReplayLaunchRequest {
	readonly run: string;
	readonly stage: string;
	readonly attempts: number;
}

/**
 * A replay of a stage consumes the checkpoint the stage before it recorded,
 * or the initial checkpoint for the first stage, so that one must be on disk.
 */
async function replayArguments(
	request: ReplayLaunchRequest,
	runsDirectory: string,
): Promise<readonly string[]> {
	const { manifest, paths } = await replayRunManifest({
		run: request.run,
		runsDirectory,
	});
	const stages = manifest.pipeline.stages.map(({ name }) => name);
	const index = stages.indexOf(request.stage);
	if (index === MISSING_SEQUENCE_INDEX) {
		throw new LaunchRefusalError(
			`Run ${request.run} has no ${request.stage} stage; it declares ${stages.join(", ")}`,
			HTTP_STATUS_NOT_FOUND,
		);
	}

	const consumed = consumedCheckpointStage(stages, index);
	if (!(await checkpointRecorded(paths, consumed))) {
		throw new LaunchRefusalError(
			`Run ${request.run} recorded no ${consumed} checkpoint, which replaying ${request.stage} starts from`,
			HTTP_STATUS_CONFLICT,
		);
	}

	return [
		"replay",
		"--run",
		request.run,
		"--stage",
		request.stage,
		"--model",
		manifest.model,
		...confirmationArguments(request.attempts),
	];
}

interface ReplayRunIdentity {
	readonly run: string;
	readonly runsDirectory: string;
}

interface RecordedReplayRun {
	readonly manifest: Awaited<ReturnType<typeof loadRunManifest>>;
	readonly paths: ReturnType<typeof benchmarkRunPaths>;
}

async function replayRunManifest({
	run,
	runsDirectory,
}: ReplayRunIdentity): Promise<RecordedReplayRun> {
	const runs = await recordedRunNames(runsDirectory);
	if (!runs.includes(run)) {
		throw new LaunchRefusalError(
			`No recorded run ${run}`,
			HTTP_STATUS_NOT_FOUND,
		);
	}

	const paths = benchmarkRunPaths(runsDirectory, run);
	try {
		const manifest = await loadRunManifest(paths.manifestFile);

		return { manifest, paths };
	} catch (error) {
		throw new LaunchRefusalError(
			`Run ${run} has a manifest that cannot be read: ${redactAbsolutePaths(error instanceof Error ? error.message : String(error))}`,
			HTTP_STATUS_CONFLICT,
		);
	}
}

const SINGLE_ITEM_COUNT = 1;

/**
 * A browser click approves the spend the dialog stated, so a group is started
 * already approved: the child has no terminal to ask on.
 */
function confirmationArguments(attempts: number): readonly string[] {
	return attempts === SINGLE_ITEM_COUNT
		? []
		: [
				"--confirm",
				"--reps",
				String(attempts),
				"--yes",
				"--approved-in-browser",
			];
}

export { caseArguments, replayArguments, confirmationArguments };
