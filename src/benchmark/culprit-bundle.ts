import { z } from "zod";
import type { Immutable } from "./contracts";
import { corpusMeasurementSchema } from "./corpus-measurement";
import { readCorpusVersion, readCorpusVersionFile } from "./corpus-version";
import { loadRunManifest } from "./manifest";
import { operatorStopped } from "./operator-stop";
import { readManifestSchema } from "./read-manifest";
import { benchmarkRunPaths } from "./run-layout";
import { stoppedStage } from "./run-outcome";
import { OPERATOR_STOPPED } from "./stopped-status";

const gradeSchema = z.record(z.string(), z.unknown());

/**
 * The parts of a stage record the analysis reads. The prompt, transcript and
 * diff stay out: they are the bulk of a record, and the grade already says
 * what the Judge made of them.
 */
const stageRecordSchema = z
	.object({
		status: z.string().optional(),
		error: z.string().optional(),
		grade: gradeSchema.nullable().optional(),
		hardBlockers: z.unknown().optional(),
		requirements: z.unknown().optional(),
		dimensions: z.unknown().optional(),
		summary: z.unknown().optional(),
		input: z
			.object({
				commitSubjects: z.array(z.string()).optional(),
				changedPaths: z.array(z.string()).optional(),
			})
			.loose()
			.optional(),
		corpusVersion: corpusMeasurementSchema.optional(),
		readManifest: readManifestSchema.optional(),
		corpusFiles: z
			.array(z.object({ path: z.string().min(1) }).loose())
			.optional(),
	})
	.loose();

const finalRecordSchema = z
	.object({
		status: z.string().min(1),
		grade: z
			.object({ verdict: z.string(), summary: z.string() })
			.loose()
			.nullable()
			.optional(),
	})
	.loose();

type StageRecord = Immutable<z.infer<typeof stageRecordSchema>>;

export type BundleStage = Immutable<{
	stage: string;
	grade: z.infer<typeof gradeSchema> | null;
	stopped: string | null;
	commitSubjects: string[];
	changedPaths: string[];
	corpusReads: string[];
}>;

export type BundleOutcome = Immutable<{
	status: string;
	verdict?: string;
	summary?: string;
	stage?: string;
	error?: string;
}>;

/** One version of a corpus file, with the stages that read that version. */
export type BundleCorpusFile = Immutable<{
	path: string;
	sha256: string;
	body: string;
	readBy: string[];
}>;

/** Everything the analysis session reads about one run, and nothing else. */
export type CulpritBundle = Immutable<{
	run: string;
	caseId: string;
	task: string;
	productBrief: string;
	declaredStages: string[];
	stages: BundleStage[];
	outcome: BundleOutcome;
	corpusFiles: BundleCorpusFile[];
}>;

/**
 * Assembles the run's manifest, each stage's grade or stop, the run's outcome
 * and the bodies of the corpus files each stage read, taken from the corpus
 * version the stage recorded rather than the corpus as it is now.
 */
export async function assembleCulpritBundle(
	runsDirectory: string,
	run: string,
): Promise<CulpritBundle> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	const manifest = await loadRunManifest(paths.manifestFile);
	const declaredStages = manifest.pipeline.stages.map(({ name }) => name);

	const stages: BundleStage[] = [];
	const corpusFiles = new Map<string, BundleCorpusFile>();
	for (const stage of declaredStages) {
		const file = Bun.file(paths.stageFile(stage));
		if (!(await file.exists())) {
			continue;
		}

		const record = stageRecordSchema.parse(await file.json());
		// A stage the spend ceiling refused has a stop record and no input,
		// because no session ran in it.
		if (record.input === undefined) {
			continue;
		}

		stages.push(bundleStage(stage, record));
		for (const body of await corpusBodies(runsDirectory, record)) {
			const key = `${body.path}\n${body.sha256}`;
			const readBy = corpusFiles.get(key)?.readBy ?? [];
			corpusFiles.set(key, { ...body, readBy: [...readBy, stage] });
		}
	}

	return {
		run,
		caseId: manifest.caseId,
		task: manifest.task,
		productBrief: manifest.productBrief,
		declaredStages,
		stages,
		outcome: await runOutcome(runsDirectory, run),
		corpusFiles: [...corpusFiles.values()],
	};
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
	const findings = Object.fromEntries(
		Object.entries({ hardBlockers, requirements, dimensions, summary }).filter(
			([, value]) => value !== undefined,
		),
	);

	return { ...findings, ...record.grade };
}

function bundleStage(stage: string, record: StageRecord): BundleStage {
	return {
		stage,
		grade: stageGrade(record),
		stopped:
			record.status === "STAGE_JUDGE_FAILED" ? (record.error ?? null) : null,
		commitSubjects: record.input?.commitSubjects ?? [],
		changedPaths: record.input?.changedPaths ?? [],
		corpusReads: corpusReads(record),
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
	const bodies: Omit<BundleCorpusFile, "readBy">[] = [];
	for (const path of corpusReads(record).filter((read) => held.has(read))) {
		const bytes = await readCorpusVersionFile(
			runsDirectory,
			record.corpusVersion.digest,
			path,
		);
		bodies.push({
			path,
			sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
			body: new TextDecoder().decode(bytes),
		});
	}

	return bodies;
}

async function runOutcome(
	runsDirectory: string,
	run: string,
): Promise<BundleOutcome> {
	return (
		(await recordedOutcome(runsDirectory, run)) ?? {
			status: "NO_OUTCOME_RECORDED",
		}
	);
}

/**
 * The outcome a run's records hold: its final record, a stage stop or an
 * operator stop. A run with none of them has not ended, or died first.
 */
export async function recordedOutcome(
	runsDirectory: string,
	run: string,
): Promise<BundleOutcome | undefined> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	const finalFile = Bun.file(paths.artifactFile);
	if (await finalFile.exists()) {
		const final = finalRecordSchema.parse(await finalFile.json());
		if (final.grade === undefined || final.grade === null) {
			return { status: final.status };
		}

		return {
			status: final.status,
			verdict: final.grade.verdict,
			summary: final.grade.summary,
		};
	}

	const stopped = await stoppedStage(runsDirectory, run);
	if (stopped !== undefined) {
		return {
			status: "STAGE_JUDGE_FAILED",
			stage: stopped.stage,
			error: stopped.error,
		};
	}

	if (await operatorStopped(paths)) {
		return { status: OPERATOR_STOPPED };
	}

	return undefined;
}
