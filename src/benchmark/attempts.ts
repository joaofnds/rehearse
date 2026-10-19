import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Attempt } from "./attempt-contract";
import {
	assertComparableLineages,
	corpusLineageDifferences,
} from "./attempt-lineage";
import { CommandError, runCommand } from "./command";

const FINAL_ATTEMPT_OFFSET = -1;

const ORDINAL_BASE = 1;

const PREFIX_START_INDEX = 0;

const EMPTY_COLLECTION_LENGTH = 0;

const COST_DECIMAL_PLACES = 2;

const GIT_DIFFERENCES_EXIT_CODE = 1;

async function diffTexts(before: string, after: string): Promise<string> {
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
		// Git diff --no-index exits 1 when the files differ; that is the diff.
		if (
			error instanceof CommandError &&
			error.exitCode === GIT_DIFFERENCES_EXIT_CODE
		) {
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
 * Grades and cost line up for scanning; the latest attempt is then diffed
 * against each earlier one. For a delivery stage the comparable content is
 * the build diff itself.
 */
async function presentAttempts(
	lineage: string,
	attempts: readonly Attempt[],
	diff: typeof diffTexts = diffTexts,
): Promise<string> {
	assertComparableLineages(attempts);
	const lines = [`Attempts at checkpoint ${lineage}:`];
	for (const { label, differences } of corpusLineageDifferences(attempts)) {
		lines.push(`  ${label}: ${differences.join("; ")}`);
	}

	lines.push(...attemptRows(attempts));

	const latest = attempts.at(FINAL_ATTEMPT_OFFSET);
	const latestContent = latest ? attemptContent(latest) : undefined;
	if (latest && latestContent !== undefined) {
		await Array.fromAsync(
			attempts.slice(PREFIX_START_INDEX, FINAL_ATTEMPT_OFFSET),
			async (earlier) => {
				const earlierContent = attemptContent(earlier);
				if (earlierContent === undefined) {
					return;
				}

				const changes = await diff(earlierContent, latestContent);
				lines.push(
					"",
					`Diff, ${earlier.label} → ${latest.label}:`,
					changes || "(identical)",
				);
			},
		);
	}

	return lines.join("\n");
}
function attemptRows(attempts: readonly Attempt[]): readonly string[] {
	const lines: string[] = [];
	for (const [index, attempt] of attempts.entries()) {
		const dimensions = attempt.dimensions
			.map(({ id, grade }) => `${id} ${grade}`)
			.join(", ");
		const cost =
			attempt.totalCostUsd === undefined
				? `judge $${attempt.judgeCostUsd.toFixed(COST_DECIMAL_PLACES)}`
				: `judge $${attempt.judgeCostUsd.toFixed(COST_DECIMAL_PLACES)}, total $${attempt.totalCostUsd.toFixed(COST_DECIMAL_PLACES)}`;
		lines.push(
			`${index + ORDINAL_BASE}. ${attempt.label} — grade ${attempt.grade} (${attempt.verdict}), ${cost}${dimensions ? ` [${dimensions}]` : ""}`,
		);
		if (
			attempt.changedPaths !== undefined &&
			attempt.changedPaths.length > EMPTY_COLLECTION_LENGTH
		) {
			lines.push(`   changed paths: ${attempt.changedPaths.join(", ")}`);
		}
	}

	return lines;
}
export { diffTexts, presentAttempts };
export { default as LineageMismatchError } from "./attempt-contract";
export type { AttemptLineageInputs, Attempt } from "./attempt-contract";
export { default as loadAttempts } from "./attempt-records";
