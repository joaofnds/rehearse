import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CalibrationIncompleteError } from "#benchmark/calibration";
import { CONTROL_DIR } from "#benchmark/config";
import { calibratableArtifactSchema } from "#benchmark/calibration-record";
import { loadJudgeAgreementReport } from "#benchmark/judge-agreement";
import { SymlinkedEntryError } from "#benchmark/file-presence";
import type {
	CalibrateDependencies,
	CurrentControlSources,
	JudgeKnobs,
} from "#cli/calibrate-command";
import { readControlSources, runCalibrate } from "#cli/calibrate-command";
import type { RunFixture } from "#cli/calibrate-test-support";
import {
	FINAL_RUBRIC,
	RUN_NAME,
	stageRubricText,
	stageScorecard,
	writeReview,
	writeRunFixture,
	writeStoppedStageFixture,
} from "#cli/calibrate-test-support";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { UsageError } from "#cli/commands";
import { RefusedPreconditionError } from "#cli/interactive-stdin";

const passingProbe = (): Promise<void> => Promise.resolve();
const storedCeiling = (): Promise<number> => Promise.resolve(100);

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true })),
	);
});

/**
 * The instructions and the case's final rubric as the run froze them, so a
 * test that means to change only the stage rubric changes only that. Every
 * observation here is over a fixture, and the control repository's own
 * CLAUDE.md and rubric.md are not what the fixture recorded.
 */
const unchangedControlSources = (): Promise<CurrentControlSources> =>
	Promise.resolve({ instructions: "Instructions", finalRubric: FINAL_RUBRIC });

const MISSED_SCOPE = {
	description: "The stage never fixed the scope.",
	paths: ["backlog/docs/spec.md"],
	stage: "discuss",
	judgeAssessment: "MISSED",
	rubricId: "scope",
};

const artifactSchema = z
	.object({
		status: z.string(),
		calibration: z
			.object({
				rejudgeConfirmedByHuman: z.boolean().optional(),
				stageRubricsChanged: z.array(z.string()),
			})
			.optional(),
		judgeAgreement: z.object({ skippedCalibrations: z.number() }).optional(),
	})
	.loose();

async function fixtureWithEditedStageRubric(): Promise<
	Awaited<ReturnType<typeof writeRunFixture>>
> {
	const fixture = await writeRunFixture();
	directories.push(fixture.runsDirectory);
	await Bun.write(
		fixture.stageRubricPath,
		stageRubricText("Scope is explicit and observable"),
	);
	await writeReview(fixture.reviewFile, [MISSED_SCOPE]);

	return fixture;
}

function rejudgingStage(): CalibrateDependencies["buildJudges"] {
	return () => ({
		stageJudge: (_scorecard, source) =>
			Promise.resolve({
				...stageScorecard(source.rubricPath, "FAIL"),
				rubric: source.rubric,
			}),
		finalJudge: () =>
			Promise.reject(new Error("no final rejudge in this test")),
	});
}

describe(readControlSources.name, () => {
	it("reads the final rubric the case declares", async () => {
		const sources = await readControlSources("audit-log", "the frozen rubric");

		expect(sources.finalRubric).toBe(
			await Bun.file(join(CONTROL_DIR, "cases/audit-log/rubric.md")).text(),
		);
	});

	it("reads the frozen rubric for a run that recorded no case", async () => {
		const sources = await readControlSources(undefined, "the frozen rubric");

		expect(sources.finalRubric).toBe("the frozen rubric");
	});

	/**
	 * An unreadable case is refused rather than answered with the frozen
	 * rubric, which by construction reads as "the rubric did not change" and
	 * would discard the reviewer's edit with no rejudge and exit 0.
	 */
	it("refuses a case that is not there", async () => {
		const failure = await failureOf(
			readControlSources("no-such-case", "the frozen rubric"),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure?.message).toContain("no-such-case");
	});

	it("refuses a case that declares no final rubric", async () => {
		const failure = await failureOf(
			readControlSources("smoke", "the frozen rubric"),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure?.message).toContain("smoke");
	});
});

describe(runCalibrate.name, () => {
	it("rejects an escaping revised instruction before rejudging", async () => {
		const fixture = await writeRunFixture();
		directories.push(fixture.runsDirectory);
		await writeReview(fixture.reviewFile, []);
		let providerCalls = 0;

		const failure = await failureOf(
			runCalibrate(
				{
					id: RUN_NAME,
					runsDirectory: fixture.runsDirectory,
					json: false,
					confirmRejudge: false,
					readCurrentSources: () =>
						Promise.reject(
							new SymlinkedEntryError(
								"Corpus file CLAUDE.md resolves outside the live corpus extent",
							),
						),
				},
				{
					buildJudges: () => {
						providerCalls += 1;
						return {
							stageJudge: () => Promise.reject(new Error("no stage rejudge")),
							finalJudge: () => Promise.reject(new Error("no final rejudge")),
						};
					},
					output: recordOutput().output,
					requireSpendCeiling: storedCeiling,
					probeModel: () => {
						providerCalls += 1;
						return Promise.resolve();
					},
				},
			),
		);

		expect(failure).toBeInstanceOf(SymlinkedEntryError);
		expect(failure.message).toContain("CLAUDE.md");
		expect(providerCalls).toBe(0);
	});

	it("refuses a rejudge without a stored spend ceiling before any provider call", async () => {
		const fixture = await writeRunFixture();
		directories.push(fixture.runsDirectory);
		await writeReview(fixture.reviewFile, []);
		let providerCalls = 0;

		const failure = await failureOf(
			runCalibrate(
				{
					id: RUN_NAME,
					runsDirectory: fixture.runsDirectory,
					json: false,
					confirmRejudge: false,
					readCurrentSources: unchangedControlSources,
				},
				{
					buildJudges: () => {
						providerCalls += 1;
						return {
							stageJudge: () => Promise.reject(new Error("no stage rejudge")),
							finalJudge: () => Promise.reject(new Error("no final rejudge")),
						};
					},
					output: recordOutput().output,
					requireSpendCeiling: () =>
						Promise.reject(new RefusedPreconditionError("No spend ceiling")),
					probeModel: () => {
						providerCalls += 1;
						return Promise.resolve();
					},
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(providerCalls).toBe(0);
	});

	it("halts before rejudging when the recorded Judge model is not available", async () => {
		const fixture = await writeRunFixture();
		directories.push(fixture.runsDirectory);
		await writeReview(fixture.reviewFile, []);
		const { output } = recordOutput();
		const built: unknown[] = [];

		const failure = await failureOf(
			runCalibrate(
				{
					id: RUN_NAME,
					runsDirectory: fixture.runsDirectory,
					json: false,
					confirmRejudge: false,
					readCurrentSources: unchangedControlSources,
				},
				{
					buildJudges: (knobs) => {
						built.push(knobs);

						return {
							stageJudge: () => Promise.reject(new Error("no provider call")),
							finalJudge: () => Promise.reject(new Error("no provider call")),
						};
					},
					output,
					requireSpendCeiling: storedCeiling,
					probeModel: () =>
						Promise.reject(
							new RefusedPreconditionError("Model sonnet is not available"),
						),
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(built).toEqual([]);
	});

	it("refuses a rejudge without --confirm-rejudge and writes nothing", async () => {
		const fixture = await fixtureWithEditedStageRubric();
		const before = await Bun.file(fixture.artifactFile).text();
		const { output, stdout, stderr } = recordOutput();

		const failure = await failureOf(
			runCalibrate(
				{
					id: RUN_NAME,
					runsDirectory: fixture.runsDirectory,
					json: false,
					confirmRejudge: false,
					readCurrentSources: unchangedControlSources,
				},
				{
					buildJudges: rejudgingStage(),
					output,
					requireSpendCeiling: storedCeiling,
					probeModel: passingProbe,
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(stdout).toEqual([]);
		expect(stderr.join("")).toContain("scope");
		expect(await Bun.file(fixture.artifactFile).text()).toBe(before);
	});

	it("completes the artifact with --confirm-rejudge", async () => {
		const fixture = await fixtureWithEditedStageRubric();
		const { output, stdout } = recordOutput();

		await runCalibrate(
			{
				id: RUN_NAME,
				runsDirectory: fixture.runsDirectory,
				json: false,
				confirmRejudge: true,
				readCurrentSources: unchangedControlSources,
			},
			{
				buildJudges: rejudgingStage(),
				output,
				requireSpendCeiling: storedCeiling,
				probeModel: passingProbe,
			},
		);

		const artifact = artifactSchema.parse(
			JSON.parse(await Bun.file(fixture.artifactFile).text()),
		);
		expect(artifact.status).toBe("COMPLETE");
		expect(artifact.calibration?.rejudgeConfirmedByHuman).toBe(true);
		expect(artifact.calibration?.stageRubricsChanged).toEqual(["discuss"]);
		expect(artifact.judgeAgreement?.skippedCalibrations).toBe(0);
		expect(stdout).toEqual([`${fixture.artifactFile}\n`]);
	});

	it("completes without --confirm-rejudge when nothing changed", async () => {
		const fixture = await writeRunFixture();
		directories.push(fixture.runsDirectory);
		await writeReview(fixture.reviewFile, []);
		const { output } = recordOutput();

		await runCalibrate(
			{
				id: RUN_NAME,
				runsDirectory: fixture.runsDirectory,
				json: false,
				confirmRejudge: false,
				readCurrentSources: unchangedControlSources,
			},
			{
				buildJudges: () => ({
					stageJudge: () =>
						Promise.reject(new Error("no stage rejudge was needed")),
					finalJudge: () =>
						Promise.reject(new Error("no final rejudge was needed")),
				}),
				output,
				requireSpendCeiling: storedCeiling,
				probeModel: passingProbe,
			},
		);

		const artifact = artifactSchema.parse(
			JSON.parse(await Bun.file(fixture.artifactFile).text()),
		);
		expect(artifact.status).toBe("COMPLETE");
		expect(artifact.calibration?.rejudgeConfirmedByHuman).toBeUndefined();
		expect(artifact.calibration?.stageRubricsChanged).toEqual([]);
	});

	it("refuses a review inconsistent with the grades and leaves the artifact", async () => {
		const fixture = await writeRunFixture();
		directories.push(fixture.runsDirectory);
		await writeReview(fixture.reviewFile, [
			{ ...MISSED_SCOPE, judgeAssessment: "CAUGHT" },
		]);
		const { output, stderr } = recordOutput();

		const failure = await failureOf(
			runCalibrate(
				{
					id: RUN_NAME,
					runsDirectory: fixture.runsDirectory,
					json: false,
					confirmRejudge: true,
					readCurrentSources: unchangedControlSources,
				},
				{
					buildJudges: rejudgingStage(),
					output,
					requireSpendCeiling: storedCeiling,
					probeModel: passingProbe,
				},
			),
		);

		expect(failure).toBeInstanceOf(CalibrationIncompleteError);
		expect(stderr.join("")).toContain("did not catch");
		const artifact = artifactSchema.parse(
			JSON.parse(await Bun.file(fixture.artifactFile).text()),
		);
		expect(artifact.status).toBe("AWAITING_HUMAN_REVIEW");
	});

	it("refuses a run with no review file and makes no provider call", async () => {
		const fixture = await writeRunFixture();
		directories.push(fixture.runsDirectory);
		const { output } = recordOutput();

		const failure = await failureOf(
			runCalibrate(
				{
					id: RUN_NAME,
					runsDirectory: fixture.runsDirectory,
					json: false,
					confirmRejudge: true,
					readCurrentSources: unchangedControlSources,
				},
				{
					buildJudges: () => ({
						stageJudge: () => Promise.reject(new Error("no provider call")),
						finalJudge: () => Promise.reject(new Error("no provider call")),
					}),
					output,
					requireSpendCeiling: storedCeiling,
					probeModel: passingProbe,
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain(".review.json");
	});

	it("refuses a run already COMPLETE without rejudging", async () => {
		const fixture = await writeRunFixture({ status: "COMPLETE" });
		directories.push(fixture.runsDirectory);
		await writeReview(fixture.reviewFile, []);
		const { output } = recordOutput();

		const failure = await failureOf(
			runCalibrate(
				{
					id: RUN_NAME,
					runsDirectory: fixture.runsDirectory,
					json: false,
					confirmRejudge: true,
					readCurrentSources: unchangedControlSources,
				},
				{
					buildJudges: () => ({
						stageJudge: () => Promise.reject(new Error("no provider call")),
						finalJudge: () => Promise.reject(new Error("no provider call")),
					}),
					output,
					requireSpendCeiling: storedCeiling,
					probeModel: passingProbe,
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain("COMPLETE");
	});

	it("records the final rubric edit and its revised grade", async () => {
		const fixture = await writeRunFixture();
		directories.push(fixture.runsDirectory);
		await writeReview(fixture.reviewFile, [
			{
				description: "The final Judge missed the worker defect.",
				paths: ["src/audit/worker.ts"],
				stage: "final",
				judgeAssessment: "MISSED",
				rubricId: "worker-metadata",
			},
		]);
		const controlRubric = `${FINAL_RUBRIC}4. \`worker-metadata\`: The row keeps request metadata.\n`;
		const { output } = recordOutput();

		await runCalibrate(
			{
				id: RUN_NAME,
				runsDirectory: fixture.runsDirectory,
				json: false,
				confirmRejudge: true,
				readCurrentSources: () =>
					Promise.resolve({
						instructions: "Instructions",
						finalRubric: controlRubric,
					}),
			},
			{
				buildJudges: () => ({
					stageJudge: () => Promise.reject(new Error("no stage rejudge")),
					finalJudge: () =>
						Promise.resolve({
							prompt: "revised prompt",
							attempts: [],
							costUsd: 0,
							grade: {
								requirements: [
									{
										id: "worker-metadata",
										status: "FAIL",
										evidence: [
											{
												source: "diff",
												path: "src/audit/worker.ts",
												claim: "metadata missing",
											},
										],
									},
								],
								verdict: "FAIL",
								summary: "revised",
							},
						}),
				}),
				output,
				requireSpendCeiling: storedCeiling,
				probeModel: passingProbe,
			},
		);

		const artifact = artifactSchema.parse(
			JSON.parse(await Bun.file(fixture.artifactFile).text()),
		);
		expect(artifact.status).toBe("COMPLETE");
		expect(artifact.calibration?.rejudgeConfirmedByHuman).toBe(true);
	});

	it("completes a stopped stage's record when no artifact was written", async () => {
		const fixture = await writeStoppedStageFixture();
		directories.push(fixture.runsDirectory);
		await Bun.write(
			fixture.stageRubricPath,
			stageRubricText("Scope is explicit and observable"),
		);
		await writeReview(fixture.reviewFile, [MISSED_SCOPE]);
		const { output, stdout } = recordOutput();

		await runCalibrate(
			{
				id: RUN_NAME,
				runsDirectory: fixture.runsDirectory,
				json: false,
				confirmRejudge: true,
				readCurrentSources: unchangedControlSources,
			},
			{
				buildJudges: rejudgingStage(),
				output,
				requireSpendCeiling: storedCeiling,
				probeModel: passingProbe,
			},
		);

		const record = z
			.object({
				calibration: z.object({
					stageRubricsChanged: z.array(z.string()),
				}),
				judgeAgreement: z.object({ skippedCalibrations: z.number() }),
			})
			.loose()
			.parse(JSON.parse(await Bun.file(fixture.stageFile).text()));
		expect(record.calibration.stageRubricsChanged).toEqual(["discuss"]);
		expect(record.judgeAgreement.skippedCalibrations).toBe(0);
		expect(stdout).toEqual([`${fixture.stageFile}\n`]);
	});

	it("rejudges a stopped stage under the Judge knobs the record froze", async () => {
		const fixture = await writeStoppedStageFixture();
		directories.push(fixture.runsDirectory);
		await Bun.write(
			fixture.stageRubricPath,
			stageRubricText("Scope is explicit and observable"),
		);
		await writeReview(fixture.reviewFile, [MISSED_SCOPE]);
		const { output } = recordOutput();
		const knobs: JudgeKnobs[] = [];

		await runCalibrate(
			{
				id: RUN_NAME,
				runsDirectory: fixture.runsDirectory,
				json: false,
				confirmRejudge: true,
				readCurrentSources: unchangedControlSources,
			},
			{
				buildJudges: (recorded, spendCeiling) => {
					knobs.push(recorded);

					return rejudgingStage()(recorded, spendCeiling);
				},
				output,
				requireSpendCeiling: storedCeiling,
				probeModel: passingProbe,
			},
		);

		expect(knobs).toEqual([
			{ judgeModel: "sonnet", judgeEffort: "medium", sessionBudgetUsd: 5 },
		]);
	});

	/**
	 * A stage record written before this card carries the Judge's model but
	 * neither its effort nor the session budget. It still calibrates: a record
	 * the command cannot parse is a record it reports as absent, and the
	 * evidence in it was paid for.
	 */
	it("calibrates a stage record written without the Judge knobs", async () => {
		const fixture = await writeStoppedStageFixture({ judgeModel: "sonnet" });
		directories.push(fixture.runsDirectory);
		await writeReview(fixture.reviewFile, []);
		const { output } = recordOutput();

		await runCalibrate(
			{
				id: RUN_NAME,
				runsDirectory: fixture.runsDirectory,
				json: false,
				confirmRejudge: false,
				readCurrentSources: unchangedControlSources,
			},
			{
				buildJudges: () => ({
					stageJudge: () => Promise.reject(new Error("no provider call")),
					finalJudge: () => Promise.reject(new Error("no provider call")),
				}),
				output,
				requireSpendCeiling: storedCeiling,
				probeModel: passingProbe,
			},
		);

		const record = z
			.object({
				calibration: z.object({ stageRubricsChanged: z.array(z.string()) }),
				judgeAgreement: z.object({ skippedCalibrations: z.number() }),
			})
			.loose()
			.parse(JSON.parse(await Bun.file(fixture.stageFile).text()));
		expect(record.calibration.stageRubricsChanged).toEqual([]);
		expect(record.judgeAgreement.skippedCalibrations).toBe(0);
	});

	/**
	 * This card adds no field a reader must have, so an artifact written before
	 * it reads the same way as one written after. The pre-card shape is the one
	 * `buildRunArtifact` wrote without a retention ref; the post-card shape is
	 * what `calibrate` leaves behind. One reader parses both.
	 */
	it("reads a pre-card artifact and the one it writes through the same parser", async () => {
		const fixture = await writeRunFixture();
		directories.push(fixture.runsDirectory);
		const preCard = calibratableArtifactSchema.parse(
			JSON.parse(await Bun.file(fixture.artifactFile).text()),
		);
		await writeReview(fixture.reviewFile, []);
		const { output } = recordOutput();

		await runCalibrate(
			{
				id: RUN_NAME,
				runsDirectory: fixture.runsDirectory,
				json: false,
				confirmRejudge: false,
				readCurrentSources: unchangedControlSources,
			},
			{
				buildJudges: () => ({
					stageJudge: () => Promise.reject(new Error("no provider call")),
					finalJudge: () => Promise.reject(new Error("no provider call")),
				}),
				output,
				requireSpendCeiling: storedCeiling,
				probeModel: passingProbe,
			},
		);

		const postCard = calibratableArtifactSchema.parse(
			JSON.parse(await Bun.file(fixture.artifactFile).text()),
		);
		expect(preCard.status).toBe("AWAITING_HUMAN_REVIEW");
		expect(postCard.status).toBe("COMPLETE");
		expect(postCard.resultSha).toBe(preCard.resultSha);
		const agreement = await loadJudgeAgreementReport(fixture.runsDirectory);
		expect(agreement.skippedCalibrations).toBe(0);
	});

	/**
	 * Same rule as the final rubric: a rubric the scorecard recorded a path
	 * for and the command cannot read is refused, not recorded as one that
	 * did not change. The paused loop re-prompts for the same read, so the
	 * two paths would otherwise disagree about the recorded result.
	 */
	it("refuses a stage rubric it cannot read", async () => {
		const fixture = await writeRunFixture();
		directories.push(fixture.runsDirectory);
		await rm(fixture.stageRubricPath);
		await writeReview(fixture.reviewFile, []);
		const { output } = recordOutput();

		const failure = await failureOf(
			runCalibrate(
				{
					id: RUN_NAME,
					runsDirectory: fixture.runsDirectory,
					json: false,
					confirmRejudge: false,
					readCurrentSources: unchangedControlSources,
				},
				{
					buildJudges: () => ({
						stageJudge: () => Promise.reject(new Error("no provider call")),
						finalJudge: () => Promise.reject(new Error("no provider call")),
					}),
					output,
					requireSpendCeiling: storedCeiling,
					probeModel: passingProbe,
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure?.message).toContain(fixture.stageRubricPath);
		const artifact = artifactSchema.parse(
			JSON.parse(await Bun.file(fixture.artifactFile).text()),
		);
		expect(artifact.status).toBe("AWAITING_HUMAN_REVIEW");
	});

	/**
	 * The review file is the one a human hand-edits under `--pause`, so a
	 * trailing comma in it must say which file and what is wrong rather than
	 * a bare parser message at exit 1. The schema-invalid case is already a
	 * usage error; only the JSON layer was unguarded.
	 */
	it.each([
		[
			"artifact",
			writeRunFixture,
			(fixture: RunFixture): string => fixture.artifactFile,
		],
		[
			"review",
			writeRunFixture,
			(fixture: RunFixture): string => fixture.reviewFile,
		],
		[
			"stage",
			writeStoppedStageFixture,
			(fixture: RunFixture): string => fixture.stageFile,
		],
	] as const)(
		"names the %s file it could not parse as JSON",
		async (_kind, writeFixture, fileOf) => {
			const fixture = await writeFixture();
			directories.push(fixture.runsDirectory);
			await writeReview(fixture.reviewFile, []);
			const file = fileOf(fixture);
			await Bun.write(file, '{ "verdict": "ACCEPT",, }');
			const { output } = recordOutput();

			const failure = await failureOf(
				runCalibrate(
					{
						id: RUN_NAME,
						runsDirectory: fixture.runsDirectory,
						json: false,
						confirmRejudge: false,
						readCurrentSources: unchangedControlSources,
					},
					{
						buildJudges: () => ({
							stageJudge: () => Promise.reject(new Error("no provider call")),
							finalJudge: () => Promise.reject(new Error("no provider call")),
						}),
						output,
						requireSpendCeiling: storedCeiling,
						probeModel: passingProbe,
					},
				),
			);

			expect(failure).toBeInstanceOf(UsageError);
			expect(failure?.message).toContain(file);
		},
	);

	it("names an empty review file rather than failing on its bytes", async () => {
		const fixture = await writeRunFixture();
		directories.push(fixture.runsDirectory);
		await Bun.write(fixture.reviewFile, "");
		const { output } = recordOutput();

		const failure = await failureOf(
			runCalibrate(
				{
					id: RUN_NAME,
					runsDirectory: fixture.runsDirectory,
					json: false,
					confirmRejudge: false,
					readCurrentSources: unchangedControlSources,
				},
				{
					buildJudges: () => ({
						stageJudge: () => Promise.reject(new Error("no provider call")),
						finalJudge: () => Promise.reject(new Error("no provider call")),
					}),
					output,
					requireSpendCeiling: storedCeiling,
					probeModel: passingProbe,
				},
			),
		);

		expect(failure).toBeInstanceOf(UsageError);
		expect(failure?.message).toContain(fixture.reviewFile);
	});

	/**
	 * Through the production reader, not the seam: an artifact naming a case
	 * that is not there is refused, rather than recorded COMPLETE with the
	 * reviewer's rubric edit discarded as "unchanged".
	 */
	it("refuses a run whose case cannot be read", async () => {
		const fixture = await writeRunFixture({ caseId: "no-such-case" });
		directories.push(fixture.runsDirectory);
		await writeReview(fixture.reviewFile, []);
		const { output } = recordOutput();

		const failure = await failureOf(
			runCalibrate(
				{
					id: RUN_NAME,
					runsDirectory: fixture.runsDirectory,
					json: false,
					confirmRejudge: false,
				},
				{
					buildJudges: () => ({
						stageJudge: () => Promise.reject(new Error("no provider call")),
						finalJudge: () => Promise.reject(new Error("no provider call")),
					}),
					output,
					requireSpendCeiling: storedCeiling,
					probeModel: passingProbe,
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure?.message).toContain("no-such-case");
		const artifact = artifactSchema.parse(
			JSON.parse(await Bun.file(fixture.artifactFile).text()),
		);
		expect(artifact.status).toBe("AWAITING_HUMAN_REVIEW");
	});

	/**
	 * `runCalibrate` writes back the value it parsed, so any schema that strips
	 * deletes the stripped field from every artifact it completes. The top
	 * level is loose for that reason and the nested shapes must be too: the
	 * loss is latent until the first field is added to one of them, and then
	 * it is silent.
	 */
	it("keeps a field it does not know about when it completes the artifact", async () => {
		const fixture = await writeRunFixture();
		directories.push(fixture.runsDirectory);
		const original = z
			.looseObject({ stageScorecards: z.tuple([z.looseObject({})]) })
			.parse(JSON.parse(await Bun.file(fixture.artifactFile).text()));
		await Bun.write(
			fixture.artifactFile,
			JSON.stringify({
				...original,
				laterCardTopLevel: "kept",
				stageScorecards: [
					{ ...original.stageScorecards[0], laterCardNested: "kept" },
				],
			}),
		);
		await writeReview(fixture.reviewFile, []);
		const { output } = recordOutput();

		await runCalibrate(
			{
				id: RUN_NAME,
				runsDirectory: fixture.runsDirectory,
				json: false,
				confirmRejudge: false,
				readCurrentSources: unchangedControlSources,
			},
			{
				buildJudges: () => ({
					stageJudge: () => Promise.reject(new Error("no provider call")),
					finalJudge: () => Promise.reject(new Error("no provider call")),
				}),
				output,
				requireSpendCeiling: storedCeiling,
				probeModel: passingProbe,
			},
		);

		const completed = z
			.looseObject({
				stageScorecards: z.array(
					z.looseObject({ laterCardNested: z.string() }),
				),
				laterCardTopLevel: z.string(),
			})
			.parse(JSON.parse(await Bun.file(fixture.artifactFile).text()));
		expect(completed.laterCardTopLevel).toBe("kept");
		expect(completed.stageScorecards[0]?.laterCardNested).toBe("kept");
	});

	it("accepts the run as run:<name> and refuses one naming a path outside", async () => {
		const fixture = await writeRunFixture();
		directories.push(fixture.runsDirectory);
		await writeReview(fixture.reviewFile, []);
		const { output } = recordOutput();

		await runCalibrate(
			{
				id: `run:${RUN_NAME}`,
				runsDirectory: fixture.runsDirectory,
				json: false,
				confirmRejudge: false,
				readCurrentSources: unchangedControlSources,
			},
			{
				buildJudges: () => ({
					stageJudge: () => Promise.reject(new Error("no provider call")),
					finalJudge: () => Promise.reject(new Error("no provider call")),
				}),
				output,
				requireSpendCeiling: storedCeiling,
				probeModel: passingProbe,
			},
		);

		const failure = await failureOf(
			runCalibrate(
				{
					id: "run:../escape",
					runsDirectory: fixture.runsDirectory,
					json: false,
					confirmRejudge: false,
					readCurrentSources: unchangedControlSources,
				},
				{
					buildJudges: () => ({
						stageJudge: () => Promise.reject(new Error("no provider call")),
						finalJudge: () => Promise.reject(new Error("no provider call")),
					}),
					output,
					requireSpendCeiling: storedCeiling,
					probeModel: passingProbe,
				},
			),
		);

		expect(failure).toBeInstanceOf(UsageError);
		expect(failure.message).toContain("outside the runs directory");
	});
});
