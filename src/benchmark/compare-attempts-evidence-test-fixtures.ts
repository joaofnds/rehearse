import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

import { z } from "zod";

import { confirmationGroupRecordSchema } from "./confirmation-record";
import { confirmationGroupPaths } from "./run-layout";

interface RecordedGroupLocation {
	readonly runsDirectory: string;
	readonly groupId: string;
}

interface RecordedModelChange extends RecordedGroupLocation {
	readonly model: string;
}

interface RecordedRubricChange extends RecordedGroupLocation {
	readonly content: string;
}

const FIXTURE_JSON_INDENT_SPACES = 2;

const SHA256_HEX_DIGITS = 64;

/** Rewrites a recorded arm's worker model, a controlled input. */
async function useModel({
	runsDirectory,
	groupId,
	model,
}: RecordedModelChange): Promise<void> {
	const { groupFile } = confirmationGroupPaths(runsDirectory, groupId);
	const group = confirmationGroupRecordSchema.parse(
		JSON.parse(await Bun.file(groupFile).text()),
	);
	await Bun.write(
		groupFile,
		`${JSON.stringify({ ...group, inputs: { ...group.inputs, model } }, null, FIXTURE_JSON_INDENT_SPACES)}\n`,
	);
}

/** Rewrites the rubric a recorded arm froze, as a real rubric file holds it. */
async function freezeRubric({
	runsDirectory,
	groupId,
	content,
}: RecordedRubricChange): Promise<void> {
	const { groupFile } = confirmationGroupPaths(runsDirectory, groupId);
	const group = confirmationGroupRecordSchema.parse(
		JSON.parse(await Bun.file(groupFile).text()),
	);
	const files = await Promise.all(
		group.inputs.files.map(async (file) => {
			if (file.kind !== "rubric") {
				return file;
			}
			await Bun.write(join(dirname(groupFile), file.path), content);

			return {
				...file,
				sha256: createHash("sha256").update(content).digest("hex"),
			};
		}),
	);
	await Bun.write(
		groupFile,
		`${JSON.stringify({ ...group, inputs: { ...group.inputs, files } }, null, FIXTURE_JSON_INDENT_SPACES)}\n`,
	);
}

/** Points a recorded arm at a corpus version the store never recorded. */
async function useUnrecordedCorpusVersion({
	runsDirectory,
	groupId,
}: RecordedGroupLocation): Promise<void> {
	const { groupFile } = confirmationGroupPaths(runsDirectory, groupId);
	const group = confirmationGroupRecordSchema.parse(
		JSON.parse(await Bun.file(groupFile).text()),
	);
	await Bun.write(
		groupFile,
		`${JSON.stringify(
			{
				...group,
				inputs: {
					...group.inputs,
					corpusVersion: {
						digest: "0".repeat(SHA256_HEX_DIGITS),
						kind: "version",
					},
				},
			},
			null,
			FIXTURE_JSON_INDENT_SPACES,
		)}\n`,
	);
}

async function forgetInput(
	{ runsDirectory, groupId }: RecordedGroupLocation,
	field: "corpusDelivery" | "setup",
): Promise<void> {
	const { groupFile } = confirmationGroupPaths(runsDirectory, groupId);
	const { inputs, ...group } = z
		.looseObject({ inputs: z.looseObject({}) })
		.parse(JSON.parse(await Bun.file(groupFile).text()));
	const { [field]: _forgotten, ...unrecorded } = inputs;
	await Bun.write(
		groupFile,
		`${JSON.stringify({ ...group, inputs: unrecorded }, null, FIXTURE_JSON_INDENT_SPACES)}\n`,
	);
}

/**
 * Rewrites a recorded arm as a group written before groups recorded the setup
 * their reps ran under.
 */
async function forgetSetup(location: RecordedGroupLocation): Promise<void> {
	await forgetInput(location, "setup");
}

/**
 * Rewrites a recorded arm as a group written before groups recorded how their
 * corpus was delivered, when its home-path citations still read the live
 * install.
 */
async function forgetCorpusDelivery(
	location: RecordedGroupLocation,
): Promise<void> {
	await forgetInput(location, "corpusDelivery");
}

/**
 * Records that the provider reported no metrics for the arm's first
 * attempt, which a successful attempt cannot lack.
 */
async function loseFirstAttemptMetrics({
	runsDirectory,
	groupId,
}: RecordedGroupLocation): Promise<void> {
	const { recordFile } = confirmationGroupPaths(runsDirectory, groupId).rep(
		`${groupId}-rep-1`,
	);
	const rep = z
		.looseObject({})
		.parse(JSON.parse(await Bun.file(recordFile).text()));
	await Bun.write(
		recordFile,
		`${JSON.stringify(
			{
				...rep,
				metrics: {
					calls: [],
					missing: ["worker.costUsd"],
					status: "MISSING",
				},
				outcome: "UNSUCCESSFUL",
			},
			null,
			FIXTURE_JSON_INDENT_SPACES,
		)}\n`,
	);
}

/** Overwrites a recorded arm's group file with a record of another shape. */
async function corruptGroup({
	runsDirectory,
	groupId,
}: RecordedGroupLocation): Promise<void> {
	const { groupFile } = confirmationGroupPaths(runsDirectory, groupId);
	await Bun.write(groupFile, "{}\n");
}

export {
	forgetCorpusDelivery,
	corruptGroup,
	forgetSetup,
	freezeRubric,
	loseFirstAttemptMetrics,
	useModel,
	useUnrecordedCorpusVersion,
};
