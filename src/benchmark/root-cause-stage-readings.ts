import { z } from "zod";

import { readCorpusVersion, readCorpusVersionFile } from "./corpus-version";
import type {
	BundleCorpusFile,
	BundleStage,
	StageRecord,
} from "./root-cause-bundle-contract";
import {
	stageRecordFieldOrder,
	stageRecordSchema,
} from "./root-cause-bundle-contract";
import orderedValidationIssues from "./validation-issue-order";

async function readStageRecord(
	file: ReturnType<typeof Bun.file>,
): Promise<StageRecord | undefined> {
	if (!(await file.exists())) {
		return undefined;
	}

	const parsed = stageRecordSchema.safeParse(await file.json());
	if (!parsed.success) {
		const issues = orderedValidationIssues({
			error: parsed.error,
			order: stageRecordFieldOrder,
		});
		throw new z.ZodError([...issues]);
	}

	return parsed.data;
}
/**
 * A record written before the harness kept a read manifest names only the
 * corpus files the stage was given, so those stand in for what it read.
 */
function corpusReads(record: StageRecord): readonly string[] {
	if (record.readManifest !== undefined) {
		return record.readManifest
			.filter(({ half }) => half === "corpus")
			.map(({ path }) => path);
	}

	return record.corpusFiles?.map(({ path }) => path) ?? [];
}

/**
 * A stop record keeps the Judge's findings beside its grade, which holds only
 * the letter and the verdict, so the findings are gathered back into it.
 */
function stageGrade(record: StageRecord): BundleStage["grade"] {
	if (record.grade === undefined || record.grade === null) {
		return null;
	}

	const { hardBlockers, requirements, dimensions, summary } = record;
	const fields: readonly (readonly [string, unknown])[] = [
		["hardBlockers", hardBlockers],
		["requirements", requirements],
		["dimensions", dimensions],
		["summary", summary],
	];
	const findings = Object.fromEntries<unknown>(
		fields.filter(([, value]) => value !== undefined),
	);

	return { ...findings, ...record.grade };
}

function bundleStage(stage: string, record: StageRecord): BundleStage {
	return {
		changedPaths: record.input?.changedPaths ?? [],
		commitSubjects: record.input?.commitSubjects ?? [],
		corpusReads: corpusReads(record),
		grade: stageGrade(record),
		stage,
		stopped:
			record.status === "STAGE_JUDGE_FAILED" ? (record.error ?? null) : null,
	};
}

/**
 * A record from before corpus versions were kept has no bodies to read, so
 * the bundle names its files and carries none of them. A read the version
 * does not hold, such as a built-in output style, is named the same way.
 */
async function corpusBodies(
	runsDirectory: string,
	record: StageRecord,
): Promise<readonly Omit<BundleCorpusFile, "readBy">[]> {
	if (record.corpusVersion?.kind !== "version") {
		return [];
	}

	const version = await readCorpusVersion(
		runsDirectory,
		record.corpusVersion.digest,
	);
	const held = new Set(version.map(({ path }) => path));
	const versionDigest = record.corpusVersion.digest;
	const bodies: Omit<BundleCorpusFile, "readBy">[] = [];
	await Array.fromAsync(
		corpusReads(record).filter((read) => held.has(read)),
		async (path) => {
			const bytes = await readCorpusVersionFile(
				runsDirectory,
				versionDigest,
				path,
			);
			bodies.push({
				body: new TextDecoder().decode(bytes),
				path,
				sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
			});
		},
	);

	return bodies;
}

export { readStageRecord, bundleStage, corpusBodies };
