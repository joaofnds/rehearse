import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeComparisonReport } from "#benchmark/comparison-command";
import { ComparisonEvidenceFixture } from "#benchmark/comparison-evidence-test-support";
import { parseComparisonReport } from "#benchmark/comparison-record";
import { buildComparisonReport } from "#benchmark/comparison-report";
import { comparisonEvidenceFixture } from "#benchmark/comparison-test-fixtures";
import { comparisonAttempts } from "./comparison-attempts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

async function oneCheckpointReportText(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-attempts-"));
	roots.push(root);
	const fixture = new ComparisonEvidenceFixture(root, ["build-checkpoint"]);
	await fixture.write();
	const runsDirectory = join(root, "runs");
	await mkdir(runsDirectory);
	const reportFile = await writeComparisonReport({
		manifestPath: fixture.manifestFile,
		runsDirectory,
	});

	return Bun.file(reportFile).text();
}

function onlyCase(
	report: ReturnType<typeof parseComparisonReport>,
): ReturnType<typeof parseComparisonReport>["cases"][number] {
	const [benchmarkCase] = report.cases;
	if (benchmarkCase === undefined) {
		throw new Error("the report holds no case");
	}

	return benchmarkCase;
}

describe(comparisonAttempts.name, () => {
	it("lists each arm's attempts by ordinal with the grade, blockers fired and words each recorded", async () => {
		const report = parseComparisonReport(await oneCheckpointReportText());

		const attempts = comparisonAttempts(onlyCase(report));

		expect(attempts.baseline).toEqual([
			{
				repId: "build-checkpoint-baseline-rep-1",
				ordinal: 1,
				outcomes: {
					state: "available",
					outcomes: [
						{ name: "build", status: "JUDGED", grade: "A", successful: true },
					],
				},
				blockersFired: {
					state: "available",
					blockers: [{ stage: "build", id: "scope-declared" }],
				},
				words: { state: "available", words: 7 },
			},
			{
				repId: "build-checkpoint-baseline-rep-2",
				ordinal: 2,
				outcomes: {
					state: "available",
					outcomes: [
						{ name: "build", status: "JUDGED", grade: "A", successful: true },
					],
				},
				blockersFired: {
					state: "available",
					blockers: [{ stage: "build", id: "scope-declared" }],
				},
				words: { state: "available", words: 8 },
			},
		]);
		expect(attempts.candidate[0]?.blockersFired).toEqual({
			state: "available",
			blockers: [],
		});
	});

	it("reads unavailable, never an attempt nothing fired on, for reps their report recorded no grading or words for", () => {
		const report = buildComparisonReport(comparisonEvidenceFixture(), {
			skippedCalibrations: 0,
			baselines: [],
		});

		const [attempt] = comparisonAttempts(onlyCase(report)).control;

		expect(attempt?.blockersFired.state).toBe("unavailable");
		expect(attempt?.words.state).toBe("unavailable");
	});
});
