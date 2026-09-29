import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { CorpusDifferenceWording, HashedFile } from "./checkpoint";
import { corpusDifferences, hashedFileSchema } from "./checkpoint";
import { CommandError, runCommand } from "./command";
import type { Effort } from "./config";
import { effortSchema } from "./config";
import type { ContextFile, Immutable } from "./contracts";
import { stageLetterGradeSchema } from "./contracts";
import type { OutputWords } from "./output-words";
import { recordedFinalReplySchema, stageOutputWords } from "./output-words";
import { readReplayRecord } from "./replay";
import type { BenchmarkRunPaths } from "./run-layout";

/**
 * The inputs an attempt itself ran with. Two attempts are comparable only
 * when these agree; a difference means the two ran against different corpora
 * and their grades measure different things.
 */
export interface AttemptLineageInputs {
	readonly corpusFiles: readonly HashedFile[];
	readonly model: string;
	readonly effort?: Effort | undefined;
}

export class LineageMismatchError extends Error {
	public override name = "LineageMismatchError";
}

/**
 * One execution of a stage at a checkpoint: the original run's stage result
 * or any replay. Only what a side-by-side presentation needs is read; the
 * full evidence stays in the record on disk.
 */
export interface Attempt {
	readonly label: string;
	readonly grade: string;
	readonly verdict: "CONTINUE" | "STOP";
	readonly dimensions: readonly {
		readonly id: string;
		readonly grade: string;
	}[];
	readonly judgeCostUsd: number;
	readonly totalCostUsd?: number | undefined;
	readonly artifact?: ContextFile | undefined;
	readonly changedPaths?: readonly string[] | undefined;
	readonly diff?: string | undefined;
	readonly words: OutputWords;
	readonly lineageInputs?: AttemptLineageInputs | undefined;
}

const attemptScorecardSchema = z
	.object({
		stage: z.string().min(1),
		costUsd: z.number(),
		grade: z
			.object({
				grade: stageLetterGradeSchema,
				verdict: z.enum(["CONTINUE", "STOP"]),
				dimensions: z.array(
					z.object({ id: z.string(), grade: stageLetterGradeSchema }).loose(),
				),
			})
			.loose(),
		input: z
			.object({
				artifact: z
					.object({ path: z.string(), content: z.string() })
					.loose()
					.optional(),
				diff: z.string().optional(),
				changedPaths: z.array(z.string()).optional(),
				transcript: recordedFinalReplySchema.optional(),
			})
			.loose(),
		corpusFiles: z.array(hashedFileSchema).optional(),
		model: z.string().min(1).optional(),
		effort: effortSchema.optional(),
	})
	.loose();

type AttemptScorecard = Immutable<z.infer<typeof attemptScorecardSchema>>;

function attemptFromScorecard(
	label: string,
	scorecard: AttemptScorecard,
	totalCostUsd?: number,
	lineageInputs?: AttemptLineageInputs,
): Attempt {
	const { artifact, changedPaths, diff, transcript } = scorecard.input;

	return {
		label,
		grade: scorecard.grade.grade,
		verdict: scorecard.grade.verdict,
		dimensions: scorecard.grade.dimensions,
		judgeCostUsd: scorecard.costUsd,
		totalCostUsd,
		artifact,
		changedPaths,
		diff,
		words: stageOutputWords({ artifact, transcript }),
		lineageInputs,
	};
}

/**
 * The original run's stage file holds its scorecard only when the stage was
 * judged; a pending or failed marker is not an attempt. The stage session's
 * own cost lives in the run artifact, not the stage file, so the original
 * attempt carries no total. Older stage files also carry no lineage inputs,
 * so the comparison guard skips those attempts rather than assuming inputs.
 */
async function loadOriginalAttempt(
	paths: BenchmarkRunPaths,
	stage: string,
): Promise<Attempt | undefined> {
	const file = Bun.file(paths.stageFile(stage));
	if (!(await file.exists())) {
		return undefined;
	}

	const parsed = attemptScorecardSchema.safeParse(
		JSON.parse(await file.text()),
	);
	if (!parsed.success) {
		return undefined;
	}

	const { corpusFiles, model, effort } = parsed.data;
	const lineageInputs =
		corpusFiles !== undefined && model !== undefined
			? { corpusFiles, model, effort }
			: undefined;

	return attemptFromScorecard(
		`original run ${paths.name}`,
		parsed.data,
		undefined,
		lineageInputs,
	);
}

/**
 * Every attempt at one checkpoint: the original stage result, then each
 * replay in the order it was recorded. Grouping needs no search because
 * replay records live under the consumed checkpoint's lineage.
 */
export async function loadAttempts(
	paths: BenchmarkRunPaths,
	stage: string,
	lineage: string,
): Promise<Attempt[]> {
	const attempts: Attempt[] = [];
	const original = await loadOriginalAttempt(paths, stage);
	if (original) {
		attempts.push(original);
	}

	const replaysDirectory = paths.replayDirectory(lineage);
	let entries: string[] = [];
	try {
		const replayEntries = await readdir(replaysDirectory);
		entries = replayEntries.filter((entry) => entry.endsWith(".json"));
	} catch (error) {
		if (
			!(error instanceof Error && "code" in error && error.code === "ENOENT")
		) {
			throw error;
		}
	}

	for (const entry of entries.toSorted()) {
		const record = await readReplayRecord(join(replaysDirectory, entry));
		attempts.push(
			attemptFromScorecard(
				`replay ${record.timestamp}`,
				attemptScorecardSchema.parse(record.scorecard),
				record.stageCostUsd + record.productOwnerCostUsd + record.judgeCostUsd,
				{
					corpusFiles: record.corpusFiles,
					model: record.model,
					effort: record.effort,
				},
			),
		);
	}

	return attempts;
}

export async function diffTexts(
	before: string,
	after: string,
): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-diff-"));

	try {
		await Bun.write(join(directory, "before"), before);
		await Bun.write(join(directory, "after"), after);
		await runCommand(
			[
				"git",
				"diff",
				"--no-ext-diff",
				"--no-color",
				"--no-index",
				"--",
				"before",
				"after",
			],
			directory,
		);

		return "";
	} catch (error) {
		// git diff --no-index exits 1 when the files differ; that is the diff.
		if (error instanceof CommandError && error.exitCode === 1) {
			return error.stdout;
		}

		throw error;
	} finally {
		await rm(directory, { force: true, recursive: true });
	}
}

function attemptContent(attempt: Attempt): string | undefined {
	return attempt.artifact?.content ?? attempt.diff;
}

/**
 * Neither attempt is the authority here, unlike staleness where the record
 * is compared against the present, so a file only one of them read is named
 * without saying which side lacked it.
 */
const COMPARISON_WORDING: CorpusDifferenceWording = {
	modified: (path) => `${path} differs`,
	missingFromRight: (path) => `${path} present in one attempt only`,
	missingFromLeft: (path) => `${path} present in one attempt only`,
};

/**
 * A model or effort change makes two grades measure different things; there
 * is no reading of that disagreement worth presenting, so it stays a refusal.
 */
function executionDifferences(
	reference: AttemptLineageInputs,
	other: AttemptLineageInputs,
): string[] {
	const differences: string[] = [];
	if (reference.model !== other.model) {
		differences.push(`model ${reference.model} against ${other.model}`);
	}
	if (reference.effort !== other.effort) {
		differences.push(
			`effort ${reference.effort ?? "none"} against ${other.effort ?? "none"}`,
		);
	}

	return differences.toSorted();
}

type LabelledAttempt = Attempt & { lineageInputs: AttemptLineageInputs };

interface LineagePair {
	readonly reference: LabelledAttempt;
	readonly other: LabelledAttempt;
}

/**
 * Every other labelled attempt paired with the reference it is compared
 * against. Attempts recorded before lineage inputs existed carry none and
 * are excluded, because refusing or annotating them would break reading of
 * every earlier run. There is nothing to pair when fewer than two attempts
 * carry lineage inputs.
 */
function lineagePairs(attempts: readonly Attempt[]): readonly LineagePair[] {
	const labelled = attempts.filter(
		(attempt): attempt is LabelledAttempt =>
			attempt.lineageInputs !== undefined,
	);
	const [reference] = labelled;
	if (!reference) {
		return [];
	}

	return labelled.slice(1).map((other) => ({ reference, other }));
}

/**
 * A model or effort change still voids the comparison, unchanged from
 * before.
 */
function assertComparableLineages(attempts: readonly Attempt[]): void {
	for (const { reference, other } of lineagePairs(attempts)) {
		const differences = executionDifferences(
			reference.lineageInputs,
			other.lineageInputs,
		);
		if (differences.length > 0) {
			throw new LineageMismatchError(
				`Cannot compare ${reference.label} with ${other.label}: they consumed different inputs (${differences.join("; ")})`,
			);
		}
	}
}

interface AttributedCorpusDifference {
	readonly label: string;
	readonly differences: readonly string[];
}

/**
 * A corpus edit between two attempts is the comparison's subject, not a
 * reason to refuse it; the differing files are named in the presentation,
 * against the attempt that carries them, so two replays editing the same
 * file are not collapsed into one indistinguishable line.
 */
function corpusLineageDifferences(
	attempts: readonly Attempt[],
): readonly AttributedCorpusDifference[] {
	const lines: AttributedCorpusDifference[] = [];
	for (const { reference, other } of lineagePairs(attempts)) {
		const differences = corpusDifferences(
			reference.lineageInputs.corpusFiles,
			other.lineageInputs.corpusFiles,
			COMPARISON_WORDING,
		);
		if (differences.length > 0) {
			lines.push({ label: other.label, differences });
		}
	}

	return lines;
}

/**
 * Grades and cost line up for scanning; the latest attempt is then diffed
 * against each earlier one. For a delivery stage the comparable content is
 * the build diff itself.
 */
export async function presentAttempts(
	lineage: string,
	attempts: readonly Attempt[],
	diff: typeof diffTexts = diffTexts,
): Promise<string> {
	assertComparableLineages(attempts);
	const lines = [`Attempts at checkpoint ${lineage}:`];
	for (const { label, differences } of corpusLineageDifferences(attempts)) {
		lines.push(`  ${label}: ${differences.join("; ")}`);
	}

	for (const [index, attempt] of attempts.entries()) {
		const dimensions = attempt.dimensions
			.map(({ id, grade }) => `${id} ${grade}`)
			.join(", ");
		const cost =
			attempt.totalCostUsd === undefined
				? `judge $${attempt.judgeCostUsd.toFixed(2)}`
				: `judge $${attempt.judgeCostUsd.toFixed(2)}, total $${attempt.totalCostUsd.toFixed(2)}`;
		lines.push(
			`${index + 1}. ${attempt.label} — grade ${attempt.grade} (${attempt.verdict}), ${cost}${dimensions ? ` [${dimensions}]` : ""}`,
		);
		if (attempt.changedPaths !== undefined && attempt.changedPaths.length > 0) {
			lines.push(`   changed paths: ${attempt.changedPaths.join(", ")}`);
		}
	}

	const latest = attempts.at(-1);
	const latestContent = latest ? attemptContent(latest) : undefined;
	if (latest && latestContent !== undefined) {
		for (const earlier of attempts.slice(0, -1)) {
			const earlierContent = attemptContent(earlier);
			if (earlierContent === undefined) {
				continue;
			}

			const changes = await diff(earlierContent, latestContent);
			lines.push(
				"",
				`Diff, ${earlier.label} → ${latest.label}:`,
				changes || "(identical)",
			);
		}
	}

	return lines.join("\n");
}
