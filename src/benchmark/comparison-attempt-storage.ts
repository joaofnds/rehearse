import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import type { ArmGroups } from "./comparison-attempt-contract";
import { loadComparisonEvidence } from "./comparison-loader";
import type {
	ComparisonArm,
	ComparisonManifestText,
} from "./comparison-record";
import {
	corpusVersionDigest,
	readCorpusVersionFile,
	writeWhole,
} from "./corpus-version";
import { confirmationGroupPaths } from "./run-layout";

const BASELINE_CORPORA_DIRECTORY = "baseline-corpora";

const MANIFESTS_DIRECTORY = "comparison-manifests";

const FINAL_CONTROL_GROUP_OFFSET = -1;

const EMPTY_COLLECTION_LENGTH = 0;

const RECORD_JSON_INDENT_SPACES = 2;

const PRIMARY_SOURCE_GROUP_INDEX = 0;

function singleCaseManifest(
	caseId: string,
	groupFiles: ComparisonManifestText["cases"][number]["arms"],
): ComparisonManifestText {
	return { cases: [{ arms: groupFiles, caseId }], schemaVersion: 1 };
}

async function assertComparableArms(
	runsDirectory: string,
	caseId: string,
	arms: { readonly armA: string; readonly armB: string },
): Promise<void> {
	const armAFile = confirmationGroupPaths(runsDirectory, arms.armA).groupFile;
	const directory = await mkdtemp(join(tmpdir(), "rehearse-compare-attempts-"));
	try {
		const manifestPath = join(directory, "manifest.json");
		const manifest = singleCaseManifest(caseId, {
			baseline: armAFile,
			candidate: confirmationGroupPaths(runsDirectory, arms.armB).groupFile,
			control: armAFile,
		});
		await Bun.write(manifestPath, JSON.stringify(manifest));
		await loadComparisonEvidence(manifestPath);
	} finally {
		await rm(directory, { force: true, recursive: true });
	}
}

async function materializeCorpus(
	runsDirectory: string,
	versionDigest: string,
	files: ReadonlyMap<string, string>,
): Promise<string> {
	const hashed = [...files].map(([path, sha256]) => ({ path, sha256 }));
	const directory = join(
		runsDirectory,
		BASELINE_CORPORA_DIRECTORY,
		corpusVersionDigest(hashed),
	);
	await Array.fromAsync(hashed, async ({ path }) => {
		const file = join(directory, path);
		await mkdir(dirname(file), { recursive: true });
		await writeWhole(
			file,
			await readCorpusVersionFile(runsDirectory, versionDigest, path),
		);
	});

	return directory;
}

async function writeManifest(
	runsDirectory: string,
	caseId: string,
	arms: ArmGroups,
): Promise<string> {
	const manifestPath = join(
		runsDirectory,
		MANIFESTS_DIRECTORY,
		`${arms.control.at(FINAL_CONTROL_GROUP_OFFSET) ?? arms.control[PRIMARY_SOURCE_GROUP_INDEX]}.json`,
	);
	const groupReference = (groupId: string): string =>
		relative(
			dirname(manifestPath),
			confirmationGroupPaths(runsDirectory, groupId).groupFile,
		);
	const armReference = ([
		first,
		...rest
	]: ArmGroups[ComparisonArm]): ComparisonManifestText["cases"][number]["arms"][ComparisonArm] =>
		rest.length === EMPTY_COLLECTION_LENGTH
			? groupReference(first)
			: [
					groupReference(first),
					...rest.map((groupId) => groupReference(groupId)),
				];
	const manifest = singleCaseManifest(caseId, {
		baseline: armReference(arms.baseline),
		candidate: armReference(arms.candidate),
		control: armReference(arms.control),
	});
	await Bun.write(
		manifestPath,
		`${JSON.stringify(manifest, null, RECORD_JSON_INDENT_SPACES)}\n`,
	);

	return manifestPath;
}

export { assertComparableArms, materializeCorpus, writeManifest };
