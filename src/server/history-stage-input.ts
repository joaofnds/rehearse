import { parseCheckpointRecord } from "#benchmark/checkpoint";
import { checkpointsEntryForRun } from "#benchmark/run-layout";
import type { HistoryUnavailableReason } from "#benchmark/session-history";
import type { ResolvedHistoryInput } from "#server/history-input-contract";
import {
	SessionHistoryReaderError,
	parseIdentity,
} from "#server/history-read-identity";
import type { StageHistoryIdentityInput } from "#server/history-read-identity";
import runManifest from "#server/history-run-manifest";
import checkpointlessStageInput from "#server/history-terminal-stage-input";
import { readVerifiedFile } from "#server/history-verified-file";
import {
	canonicalRunsRoot,
	verifiedDirectory,
	verifiedDirectoryWhenPresent,
	verifiedFile,
} from "#server/history-verified-path";

/**
 * A checkpoint records no case id and no run name, so the case is read from
 * the run's own manifest, which sits inside the checkpoints directory. That
 * only confirms the directory agrees with itself; the ownership check a stage
 * permits is its checkpoint's own stage field against the requested one.
 */
async function stageInput(
	identity: Readonly<StageHistoryIdentityInput>,
): Promise<ResolvedHistoryInput> {
	const { root, checkpointsDirectory, directory } =
		await stageDirectories(identity);
	if (directory === undefined) {
		return await checkpointlessStageInput(root, checkpointsDirectory, identity);
	}

	const checkpoint = parseCheckpointRecord(
		await readVerifiedFile(
			root,
			await verifiedFile(root, {
				directory,
				name: "checkpoint.json",
				required: true,
			}),
		),
	);
	if (checkpoint.stage !== identity.stage) {
		throw new SessionHistoryReaderError(
			"refused",
			"Saved checkpoint does not own this stage identity",
		);
	}

	const manifest = await runManifest(root, checkpointsDirectory);
	const transcriptFile =
		checkpoint.transcript?.status === "AVAILABLE"
			? await verifiedFile(root, {
					directory,
					name: checkpoint.transcript.file,
					required: false,
				})
			: undefined;

	return checkpointInput({
		checkpoint,
		identity,
		manifest,
		root,
		transcriptFile,
	});
}

/**
 * A stage session resumes no earlier session, so a transcript it has is the
 * whole of its own history. Which fact left it without one is what these states
 * distinguish, the last of them a checkpoint whose own record disagrees with
 * what is beside it.
 */
interface CheckpointInput {
	readonly root: string;
	readonly checkpoint: ReturnType<typeof parseCheckpointRecord>;
	readonly manifest: Awaited<ReturnType<typeof runManifest>>;
	readonly identity: Readonly<StageHistoryIdentityInput>;
	readonly transcriptFile: string | undefined;
}

function checkpointInput({
	root,
	checkpoint,
	manifest,
	identity,
	transcriptFile,
}: CheckpointInput): ResolvedHistoryInput {
	return {
		metadata: {
			attempt: {
				caseId: manifest.caseId,
				corpusFiles: checkpoint.corpusFiles.map(({ path, sha256 }) => ({
					path,
					sha256,
				})),
				effort: checkpoint.effort,
				kind: "stage",
				lineage: checkpoint.lineage,
				model: checkpoint.model,
				run: identity.run,
				stage: checkpoint.stage,
				upstream: checkpoint.upstream,
			},
			prefixLinesExcluded: 0,
			resolvedCorpusFiles: [],
			unavailableReason: stageUnavailableReason(
				checkpoint.transcript?.status,
				transcriptFile !== undefined,
			),
		},
		reportedCostUsd: undefined,
		root,
		transcriptFile,
	};
}

interface StageDirectories {
	readonly root: string;
	readonly checkpointsDirectory: string;
	readonly directory: string | undefined;
}

async function stageDirectories(
	identity: Readonly<StageHistoryIdentityInput>,
): Promise<StageDirectories> {
	const root = await canonicalRunsRoot(identity.runsDirectory);
	const checkpointsEntry = checkpointsEntryForRun(parseIdentity(identity.run));
	const checkpointsDirectory = await verifiedDirectory(root, [
		checkpointsEntry,
	]);
	const directory = await verifiedDirectoryWhenPresent(root, [
		checkpointsEntry,
		identity.stage,
	]);

	return { checkpointsDirectory, directory, root };
}

function stageUnavailableReason(
	status: "AVAILABLE" | "UNAVAILABLE" | undefined,
	filePresent: boolean,
): HistoryUnavailableReason | undefined {
	if (status === "AVAILABLE") {
		return filePresent ? undefined : "recorded-transcript-missing";
	}

	return status === "UNAVAILABLE"
		? "provider-wrote-none"
		: "no-capture-recorded";
}

export { stageInput as default };
