import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import {
	RecordedArms,
	RUN,
	STAGE,
	STAGE_RUBRIC,
} from "#benchmark/compare-attempts-test-support";
import {
	RUN as ANALYZED_RUN,
	runStoppedAtBuild,
	runWithOneGradedStage,
} from "#benchmark/culprit-analysis-test-support";
import { readLaunchRecord, writeLaunchRecord } from "#benchmark/launch-record";
import {
	directorySource,
	RecordedRunsFixture,
} from "#benchmark/run-records-test-support";
import { readCaseDeclaration } from "#benchmark/case";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import { pauseRequested } from "#benchmark/run-pause";
import type { JsonValue } from "#benchmark/json-value";
import { CONTROL_DIR, RECORDS_DIRECTORY_VARIABLE } from "#benchmark/config";
import { liveCorpusSource } from "#benchmark/corpus-file";
import { linkCorpus } from "#benchmark/corpus-source";
import { corpusVersionLog } from "#benchmark/corpus-version";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { CEILING_OVERRUN_STATEMENT } from "#benchmark/spend-ceiling";
import {
	SET_SPEND_CEILING_COMMAND,
	storeSpendCeiling,
	UNLINK_CORPUS_COMMAND,
} from "#benchmark/settings";
import {
	FAKE_LAUNCH_PID,
	FAKE_LAUNCH_STARTED_AT,
	FakeLauncher,
} from "./launch-test-support";
import { compareAttempts } from "#benchmark/compare-attempts";
import { createLaunchApp } from "./launches";

const NOTHING_RUNNING: RunLiveness = {
	readMarker: () => Promise.resolve(undefined),
	isAlive: () => false,
};

const launchedSchema = z.object({ id: z.string() });
const refusalSchema = z.object({ error: z.string() });

/** The body the launch dialog posts, or a malformed one a test sends. */
type LaunchRequestBody = Readonly<Record<string, number | string>>;

const PIPELINE_CASE = {
	id: "pipe-case",
	kind: "pipeline",
	title: "A pipeline case",
	task: "task.md",
	productBrief: "brief.md",
	finalRubric: "rubric.md",
	pipeline: "pipeline.json",
	rubrics: "rubrics",
	target: { path: "/target" },
	model: "sonnet",
};

const UNMODELLED_CASE = {
	id: "no-model",
	kind: "session",
	title: "A case that declares no model",
	prompt: "Reply OK.",
	tools: [],
	corpusFiles: [],
	checks: [{ kind: "word-band", max: 1 }],
};

/** Recorded on disk, and its declaration does not parse. */
const BROKEN_CASE = { id: "broken-case" };

const SESSION_CASE = {
	id: "sess-case",
	kind: "session",
	title: "A session case",
	prompt: "Reply OK.",
	tools: [],
	corpusFiles: [],
	checks: [{ kind: "word-band", max: 1 }],
	model: "haiku",
};

describe(createLaunchApp.name, () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
		);
	});

	async function temporaryDirectory(prefix: string): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), prefix));
		roots.push(root);

		return root;
	}

	async function casesRoot(
		declarations: readonly { readonly id: string }[],
	): Promise<string> {
		const root = await temporaryDirectory("rehearse-launch-cases-");
		for (const declaration of declarations) {
			await mkdir(join(root, declaration.id), { recursive: true });
			await Bun.write(
				join(root, declaration.id, "case.json"),
				JSON.stringify(declaration),
			);
		}

		return root;
	}

	/** A settings write as the client sends it, wrong types included. */
	type SettingsRequestBody = Readonly<Record<string, string | number>>;

	interface Harness {
		readonly launcher: FakeLauncher;
		readonly runsDirectory: string;
		readonly post: (body: LaunchRequestBody) => Promise<Response>;
		readonly get: (path: string) => Promise<Response>;
		readonly stop: (id: string) => Promise<Response>;
		readonly pause: (run: string) => Promise<Response>;
		readonly send: (
			method: "PUT" | "DELETE" | "POST",
			path: string,
			body: SettingsRequestBody,
		) => Promise<Response>;
		/** Posts a case declaration as the Declare a case form does. */
		readonly declare: (body: JsonValue) => Promise<Response>;
		readonly casesDirectory: string;
		/** The same records under a new server and launcher, as after a restart. */
		readonly restarted: () => Promise<Harness>;
	}

	async function harness(
		ceiling: "stored" | "missing" = "stored",
		liveness: RunLiveness = NOTHING_RUNNING,
	): Promise<Harness> {
		const runsDirectory = await temporaryDirectory("rehearse-launch-runs-");
		if (ceiling === "stored") {
			await storeSpendCeiling(runsDirectory, 5);
		}

		return serving(
			runsDirectory,
			await casesRoot([
				PIPELINE_CASE,
				SESSION_CASE,
				UNMODELLED_CASE,
				BROKEN_CASE,
			]),
			liveness,
		);
	}

	function serving(
		runsDirectory: string,
		cases: string,
		liveness: RunLiveness,
	): Harness {
		const launcher = new FakeLauncher();
		const app = createLaunchApp({
			runsDirectory,
			casesRoot: cases,
			launcher,
			liveness,
		});

		return {
			launcher,
			runsDirectory,
			get: (path) => Promise.resolve(app.request(path)),
			post: (body) =>
				Promise.resolve(
					app.request("/api/launches", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body),
					}),
				),
			stop: (id) =>
				Promise.resolve(
					app.request(`/api/launches/${id}/stop`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: "{}",
					}),
				),
			pause: (run) =>
				Promise.resolve(
					app.request(`/api/runs/${run}/pause`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: "{}",
					}),
				),
			send: (method, path, body) =>
				Promise.resolve(
					app.request(path, {
						method,
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body),
					}),
				),
			declare: (body) =>
				Promise.resolve(
					app.request("/api/cases", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body),
					}),
				),
			casesDirectory: cases,
			restarted: () => Promise.resolve(serving(runsDirectory, cases, liveness)),
		};
	}

	describe("when a case is launched once", () => {
		it("runs the case under its declared model and answers with the launch id", async () => {
			const { launcher, post } = await harness();

			const response = await post({
				kind: "case",
				caseId: "sess-case",
				attempts: 1,
			});

			expect(response.status).toBe(202);
			expect(launchedSchema.parse(await response.json()).id).toBeString();
			expect(launcher.launches.map(({ argv }) => argv)).toEqual([
				["run", "--case", "sess-case", "--model", "haiku"],
			]);
		});

		it("records the launch, its pid and when that process started in the records directory", async () => {
			const { launcher, post, runsDirectory } = await harness();

			const response = await post({
				kind: "case",
				caseId: "pipe-case",
				attempts: 1,
			});
			const { id } = launchedSchema.parse(await response.json());
			const record = await readLaunchRecord(runsDirectory, id);

			expect(record).toMatchObject({
				id,
				kind: "case",
				caseId: "pipe-case",
				attempts: 1,
				pid: FAKE_LAUNCH_PID,
				startedAt: FAKE_LAUNCH_STARTED_AT,
			});
			expect(launcher.launches[0]?.logFile).toBe(
				join(runsDirectory, "launches", `${id}.log`),
			);
		});
	});

	describe("when a case is launched more than once", () => {
		it.each([3, 6, 12])(
			"asks for a confirmation group of %d already approved",
			async (attempts) => {
				const { launcher, post } = await harness();

				await post({ kind: "case", caseId: "pipe-case", attempts });

				expect(launcher.launches.map(({ argv }) => argv)).toEqual([
					[
						"run",
						"--case",
						"pipe-case",
						"--model",
						"sonnet",
						"--confirm",
						"--reps",
						String(attempts),
						"--yes",
						"--approved-in-browser",
					],
				]);
			},
		);
	});

	describe("when a stage is replayed", () => {
		async function recordedRun(runsDirectory: string): Promise<string> {
			const fixture = new RecordedRunsFixture(runsDirectory);
			await fixture.write();
			await fixture.writeInitialCheckpoint();

			return fixture.replayableRun;
		}

		it("replays the stage under the run's recorded model", async () => {
			const { launcher, post, runsDirectory } = await harness();
			const run = await recordedRun(runsDirectory);

			const response = await post({
				kind: "replay",
				run,
				stage: "build",
				attempts: 1,
			});

			expect(response.status).toBe(202);
			expect(launcher.launches.map(({ argv }) => argv)).toEqual([
				["replay", "--run", run, "--stage", "build", "--model", "sonnet"],
			]);
		});

		it.each([3, 6, 12])(
			"asks for a replay group of %d already approved",
			async (attempts) => {
				const { launcher, post, runsDirectory } = await harness();
				const run = await recordedRun(runsDirectory);

				await post({ kind: "replay", run, stage: "build", attempts });

				expect(launcher.launches.map(({ argv }) => argv)).toEqual([
					[
						"replay",
						"--run",
						run,
						"--stage",
						"build",
						"--model",
						"sonnet",
						"--confirm",
						"--reps",
						String(attempts),
						"--yes",
						"--approved-in-browser",
					],
				]);
			},
		);

		it("records the run and stage the launch replays", async () => {
			const { post, runsDirectory } = await harness();
			const run = await recordedRun(runsDirectory);

			const response = await post({
				kind: "replay",
				run,
				stage: "discuss",
				attempts: 3,
			});
			const { id } = launchedSchema.parse(await response.json());

			expect(await readLaunchRecord(runsDirectory, id)).toMatchObject({
				kind: "replay",
				run,
				stage: "discuss",
				attempts: 3,
			});
		});
	});

	describe("when two attempts are compared", () => {
		const SHARED = {
			"CLAUDE.md": "global instructions\n",
			"skills/review/SKILL.md": "review\n",
		};

		async function recordedArms(runsDirectory: string): Promise<RecordedArms> {
			return RecordedArms.create(
				runsDirectory,
				await temporaryDirectory("rehearse-launch-arms-"),
			);
		}

		it("compares them already approved once the free checks pass", async () => {
			const { launcher, post, runsDirectory } = await harness();
			const arms = await recordedArms(runsDirectory);
			const armA = await arms.recordArm("baseline", {
				...SHARED,
				"skills/build/SKILL.md": "build\n",
			});
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"skills/build/SKILL.md": "revised build\n",
			});
			await arms.readInStage(armA, "skills/build/SKILL.md");
			await arms.readInStage(armB, "skills/build/SKILL.md");

			const response = await post({ kind: "comparison", armA, armB });
			const { id } = launchedSchema.parse(await response.json());

			expect(response.status).toBe(202);
			expect(launcher.launches.map(({ argv }) => argv)).toEqual([
				[
					"compare",
					"attempts",
					"--arm-a",
					armA,
					"--arm-b",
					armB,
					"--yes",
					"--approved-in-browser",
				],
			]);
			expect(await readLaunchRecord(runsDirectory, id)).toMatchObject({
				kind: "comparison",
				armA,
				armB,
				run: RUN,
				stage: STAGE,
				attempts: 2,
			});
		});

		it("refuses a skill the replayed stage never reads, before starting anything", async () => {
			const { launcher, post, runsDirectory } = await harness();
			const arms = await recordedArms(runsDirectory);
			const armA = await arms.recordArm("baseline", SHARED);
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"skills/build/SKILL.md": "build\n",
			});

			const response = await post({ kind: "comparison", armA, armB });

			expect(response.status).toBe(409);
			expect(refusalSchema.parse(await response.json()).error).toBe(
				`stage ${STAGE} reads nothing in skills/build/, so arms A and B ran the same files and nothing is under test`,
			);
			expect(launcher.launches).toEqual([]);
		});

		it("refuses a stage rubric changed since arm A was recorded, before starting anything", async () => {
			const { launcher, post, runsDirectory } = await harness();
			const arms = await recordedArms(runsDirectory);
			const armA = await arms.recordArm("baseline", {
				...SHARED,
				"skills/build/SKILL.md": "build\n",
			});
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"skills/build/SKILL.md": "revised build\n",
			});
			for (const arm of [armA, armB]) {
				await arms.readInStage(arm, "skills/build/SKILL.md");
				await arms.freezeRubric(arm, `${STAGE_RUBRIC}\n`);
			}

			const response = await post({ kind: "comparison", armA, armB });

			expect(response.status).toBe(409);
			expect(refusalSchema.parse(await response.json()).error).toBe(
				"the cases/audit-log/rubrics/build.json rubric changed since arm A was recorded, so a baseline group run now could not be compared with it",
			);
			expect(launcher.launches).toEqual([]);
		});

		it("refuses a skill under test that is not the replayed stage's own, before starting anything", async () => {
			const { launcher, post, runsDirectory } = await harness();
			const arms = await recordedArms(runsDirectory);
			const armA = await arms.recordArm("baseline", SHARED);
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"skills/review/SKILL.md": "revised review\n",
			});
			await arms.readInStage(armA, "skills/review/SKILL.md");
			await arms.readInStage(armB, "skills/review/SKILL.md");

			const response = await post({ kind: "comparison", armA, armB });

			expect(response.status).toBe(409);
			expect(refusalSchema.parse(await response.json()).error).toBe(
				`skills/review/ is not the ${STAGE} stage's own skill, which is the only skill a baseline replay can run without`,
			);
			expect(launcher.launches).toEqual([]);
		});

		it("refuses arms the comparison would refuse before starting anything", async () => {
			const { launcher, post, runsDirectory } = await harness();
			const arms = await recordedArms(runsDirectory);
			const armA = await arms.recordArm("baseline", SHARED);
			const armB = await arms.recordArm("candidate", SHARED);

			const response = await post({ kind: "comparison", armA, armB });

			expect(response.status).toBe(409);
			expect(refusalSchema.parse(await response.json()).error).toBe(
				"arms A and B hold identical corpora, so nothing is under test",
			);
			expect(launcher.launches).toEqual([]);
		});

		it("refuses a group that is not recorded", async () => {
			const { launcher, post } = await harness();

			const response = await post({
				kind: "comparison",
				armA: "never-recorded",
				armB: "never-recorded-either",
			});

			expect(response.status).toBe(404);
			expect(refusalSchema.parse(await response.json()).error).toBe(
				"No recorded confirmation group never-recorded",
			);
			expect(launcher.launches).toEqual([]);
		});

		it("refuses a group id that could name a path outside the records", async () => {
			const { launcher, post } = await harness();

			const response = await post({
				kind: "comparison",
				armA: "../outside",
				armB: "never-recorded",
			});

			expect(response.status).toBe(400);
			expect(launcher.launches).toEqual([]);
		});
	});

	describe("when a saved comparison is extended", () => {
		/** A comparison `compare attempts` saved, named by its manifest digest. */
		async function savedComparison(runsDirectory: string): Promise<{
			readonly arms: RecordedArms;
			readonly comparison: string;
		}> {
			const arms = await RecordedArms.create(
				runsDirectory,
				await temporaryDirectory("rehearse-launch-extend-"),
			);
			const shared = {
				"CLAUDE.md": "global instructions\n",
				"skills/review/SKILL.md": "review\n",
			};
			const armA = await arms.recordArm("baseline", {
				...shared,
				"skills/build/SKILL.md": "build\n",
			});
			const armB = await arms.recordArm("candidate", {
				...shared,
				"skills/build/SKILL.md": "revised build\n",
			});
			await arms.readInStage(armA, "skills/build/SKILL.md");
			await arms.readInStage(armB, "skills/build/SKILL.md");
			const { reportFile } = await compareAttempts(
				{ runsDirectory, armA, armB },
				{ runBaselineGroup: arms.runBaselineGroup },
			);

			return { arms, comparison: basename(dirname(reportFile)) };
		}

		it("extends it already approved at the cost the dialog stated", async () => {
			const { launcher, post, runsDirectory } = await harness();
			const { comparison } = await savedComparison(runsDirectory);

			const response = await post({
				kind: "extension",
				comparison,
				attempts: 2,
				statedUsd: 9,
			});
			const { id } = launchedSchema.parse(await response.json());

			expect(response.status).toBe(202);
			expect(launcher.launches.map(({ argv }) => argv)).toEqual([
				[
					"compare",
					"extend",
					"--comparison",
					comparison,
					"--attempts",
					"2",
					"--yes",
					"--approved-in-browser",
				],
			]);
			expect(await readLaunchRecord(runsDirectory, id)).toMatchObject({
				kind: "extension",
				comparison,
				run: RUN,
				stage: STAGE,
				attempts: 2,
				usd: 9,
			});
		});

		it("refuses when the cost differs from the one the dialog stated, before starting anything", async () => {
			const { launcher, post, runsDirectory } = await harness();
			const { comparison } = await savedComparison(runsDirectory);

			const response = await post({
				kind: "extension",
				comparison,
				attempts: 2,
				statedUsd: 4.5,
			});

			expect(response.status).toBe(409);
			expect(refusalSchema.parse(await response.json()).error).toBe(
				"Adding 2 attempts to each arm now costs about $9.00, not the $4.50 the dialog stated; reopen it to read the current cost",
			);
			expect(launcher.launches).toEqual([]);
		});

		it("refuses a comparison the extension would refuse, before starting anything", async () => {
			const { launcher, post, runsDirectory } = await harness();
			const { arms, comparison } = await savedComparison(runsDirectory);
			await arms.nameStageRubric("rubrics/missing.json");

			const response = await post({
				kind: "extension",
				comparison,
				attempts: 2,
				statedUsd: 9,
			});

			expect(response.status).toBe(409);
			expect(refusalSchema.parse(await response.json()).error).toStartWith(
				"the rubrics/missing.json rubric cannot be read",
			);
			expect(launcher.launches).toEqual([]);
		});

		it("refuses a comparison nothing saved", async () => {
			const { launcher, post } = await harness();

			const response = await post({
				kind: "extension",
				comparison: "0".repeat(64),
				attempts: 2,
				statedUsd: 9,
			});

			expect(response.status).toBe(404);
			expect(refusalSchema.parse(await response.json()).error).toBe(
				`No saved comparison ${"0".repeat(64)}`,
			);
			expect(launcher.launches).toEqual([]);
		});

		it("refuses a comparison that could name a path outside the records", async () => {
			const { launcher, post } = await harness();

			const response = await post({
				kind: "extension",
				comparison: "../outside",
				attempts: 2,
				statedUsd: 9,
			});

			expect(response.status).toBe(400);
			expect(launcher.launches).toEqual([]);
		});
	});

	describe("when a culprit analysis is requested", () => {
		const RUNNING_PID = 4242;
		const stillRunning: RunLiveness = {
			readMarker: () => Promise.resolve({ pid: RUNNING_PID }),
			isAlive: (pid) => pid === RUNNING_PID,
		};

		it("starts it under sonnet, capped at the cost the dialog stated", async () => {
			const { launcher, post, runsDirectory } = await harness();
			await runStoppedAtBuild(runsDirectory);

			const response = await post({
				kind: "analysis",
				run: ANALYZED_RUN,
				statedUsd: 1,
			});
			const { id } = launchedSchema.parse(await response.json());

			expect(response.status).toBe(202);
			expect(launcher.launches.map(({ argv }) => argv)).toEqual([
				["analyze", ANALYZED_RUN, "--model", "sonnet", "--budget-usd", "1"],
			]);
			expect(await readLaunchRecord(runsDirectory, id)).toMatchObject({
				kind: "analysis",
				run: ANALYZED_RUN,
				usd: 1,
			});
		});

		it("caps it at a stored ceiling below the analysis budget", async () => {
			const { launcher, post, runsDirectory } = await harness();
			await runStoppedAtBuild(runsDirectory);
			await storeSpendCeiling(runsDirectory, 0.5);

			const response = await post({
				kind: "analysis",
				run: ANALYZED_RUN,
				statedUsd: 0.5,
			});

			expect(response.status).toBe(202);
			expect(launcher.launches.map(({ argv }) => argv)).toEqual([
				["analyze", ANALYZED_RUN, "--model", "sonnet", "--budget-usd", "0.5"],
			]);
		});

		it("refuses when the most it can spend differs from what the dialog stated, before starting anything", async () => {
			const { launcher, post, runsDirectory } = await harness();
			await runStoppedAtBuild(runsDirectory);
			await storeSpendCeiling(runsDirectory, 0.5);

			const response = await post({
				kind: "analysis",
				run: ANALYZED_RUN,
				statedUsd: 1,
			});

			expect(response.status).toBe(409);
			expect(refusalSchema.parse(await response.json()).error).toBe(
				"An analysis can now spend at most $0.50, not the $1.00 the dialog stated; reopen it to read the current cost",
			);
			expect(launcher.launches).toEqual([]);
		});

		it("refuses a stated cost below what it can now spend", async () => {
			const { launcher, post, runsDirectory } = await harness();
			await runStoppedAtBuild(runsDirectory);

			const response = await post({
				kind: "analysis",
				run: ANALYZED_RUN,
				statedUsd: 0.5,
			});

			expect(response.status).toBe(409);
			expect(launcher.launches).toEqual([]);
		});

		it("refuses a run still in flight, before starting anything", async () => {
			const { launcher, post, runsDirectory } = await harness(
				"stored",
				stillRunning,
			);
			await runWithOneGradedStage(runsDirectory);

			const response = await post({
				kind: "analysis",
				run: ANALYZED_RUN,
				statedUsd: 1,
			});

			expect(response.status).toBe(409);
			expect(refusalSchema.parse(await response.json()).error).toBe(
				`Run ${ANALYZED_RUN} is still in flight, so it has no outcome to analyze`,
			);
			expect(launcher.launches).toEqual([]);
		});

		it("refuses a run nothing recorded", async () => {
			const { launcher, post } = await harness();

			const response = await post({
				kind: "analysis",
				run: "../outside",
				statedUsd: 1,
			});

			expect(response.status).toBe(404);
			expect(refusalSchema.parse(await response.json()).error).toBe(
				"No recorded run ../outside",
			);
			expect(launcher.launches).toEqual([]);
		});

		it("refuses with no spend ceiling stored, before starting anything", async () => {
			const { launcher, post, runsDirectory } = await harness("missing");
			await runStoppedAtBuild(runsDirectory);

			const response = await post({
				kind: "analysis",
				run: ANALYZED_RUN,
				statedUsd: 1,
			});

			expect(response.status).toBe(409);
			expect(launcher.launches).toEqual([]);
		});
	});

	describe("when the launch cannot be started as asked", () => {
		async function recordedRun(
			runsDirectory: string,
			initialCheckpoint: "recorded" | "missing",
		): Promise<string> {
			const fixture = new RecordedRunsFixture(runsDirectory);
			await fixture.write();
			if (initialCheckpoint === "recorded") {
				await fixture.writeInitialCheckpoint();
			}

			return fixture.replayableRun;
		}

		it.each([
			[
				"an attempt count the dialog does not offer",
				{ kind: "case", caseId: "pipe-case", attempts: 5 },
			],
			["an unknown kind", { kind: "review", caseId: "pipe-case", attempts: 1 }],
			[
				"a malformed case id",
				{ kind: "case", caseId: "../pipe-case", attempts: 1 },
			],
			[
				"a field the launch does not take",
				{ kind: "case", caseId: "pipe-case", attempts: 1, model: "opus" },
			],
		])(
			"refuses %s as a bad request and starts nothing",
			async (_label, body) => {
				const { launcher, post } = await harness();

				const response = await post(body);

				expect(response.status).toBe(400);
				expect(refusalSchema.parse(await response.json()).error).not.toBe("");
				expect(launcher.launches).toEqual([]);
			},
		);

		it.each([
			[
				"a case with no declaration",
				{ kind: "case", caseId: "missing-case", attempts: 1 },
			],
			[
				"a run never recorded",
				{
					kind: "replay",
					run: "2026-01-01T00-00-00.000Z",
					stage: "build",
					attempts: 1,
				},
			],
			[
				"a run named by a path",
				{ kind: "replay", run: "../../etc", stage: "build", attempts: 1 },
			],
			[
				"a stage the run's pipeline lacks",
				{
					kind: "replay",
					run: "2026-09-03T00-00-00.000Z",
					stage: "ship",
					attempts: 1,
				},
			],
		])("refuses %s as not found and starts nothing", async (_label, body) => {
			const { launcher, post, runsDirectory } = await harness();
			await recordedRun(runsDirectory, "recorded");

			const response = await post(body);

			expect(response.status).toBe(404);
			expect(launcher.launches).toEqual([]);
		});

		it("refuses a replay whose preceding checkpoint was never recorded", async () => {
			const { launcher, post, runsDirectory } = await harness();
			const run = await recordedRun(runsDirectory, "missing");

			const response = await post({
				kind: "replay",
				run,
				stage: "discuss",
				attempts: 1,
			});

			expect(response.status).toBe(409);
			expect(refusalSchema.parse(await response.json()).error).toContain(
				"initial",
			);
			expect(launcher.launches).toEqual([]);
		});

		it("refuses a recorded case whose declaration does not parse as a conflict, not as unknown", async () => {
			const { launcher, post } = await harness();

			const response = await post({
				kind: "case",
				caseId: BROKEN_CASE.id,
				attempts: 1,
			});

			expect(response.status).toBe(409);
			expect(launcher.launches).toEqual([]);
		});

		it("refuses a recorded run whose manifest does not parse as a conflict", async () => {
			const { launcher, post, runsDirectory } = await harness();
			const run = await recordedRun(runsDirectory, "recorded");
			await Bun.write(
				benchmarkRunPaths(runsDirectory, run).manifestFile,
				"not json",
			);

			const response = await post({
				kind: "replay",
				run,
				stage: "discuss",
				attempts: 1,
			});

			expect(response.status).toBe(409);
			expect(refusalSchema.parse(await response.json()).error).not.toContain(
				runsDirectory,
			);
			expect(launcher.launches).toEqual([]);
		});

		it("refuses a case that declares no model, since the child cannot ask for one", async () => {
			const { launcher, post } = await harness();

			const response = await post({
				kind: "case",
				caseId: "no-model",
				attempts: 1,
			});

			expect(response.status).toBe(409);
			expect(refusalSchema.parse(await response.json()).error).toContain(
				"model",
			);
			expect(launcher.launches).toEqual([]);
		});

		it("refuses every launch while no spend ceiling is stored, naming how to set one", async () => {
			const { launcher, post } = await harness("missing");

			const response = await post({
				kind: "case",
				caseId: "pipe-case",
				attempts: 1,
			});

			expect(response.status).toBe(409);
			expect(refusalSchema.parse(await response.json()).error).toContain(
				SET_SPEND_CEILING_COMMAND,
			);
			expect(launcher.launches).toEqual([]);
		});
		describe("when a corpus directory is linked", () => {
			async function linked(): Promise<Harness> {
				const served = await harness();
				const corpus = await temporaryDirectory("rehearse-launch-corpus-");
				await Bun.write(join(corpus, "CLAUDE.md"), "linked\n");
				await linkCorpus(served.runsDirectory, corpus);

				return served;
			}

			it("refuses a pipeline case, naming how to unlink", async () => {
				const { launcher, post } = await linked();

				const response = await post({
					kind: "case",
					caseId: "pipe-case",
					attempts: 1,
				});

				expect(response.status).toBe(409);
				expect(refusalSchema.parse(await response.json()).error).toContain(
					UNLINK_CORPUS_COMMAND,
				);
				expect(launcher.launches).toEqual([]);
			});

			it("launches a session case, which measures the linked corpus", async () => {
				const { launcher, post } = await linked();

				const response = await post({
					kind: "case",
					caseId: "sess-case",
					attempts: 1,
				});

				expect(response.status).toBe(202);
				expect(launcher.launches).toHaveLength(1);
			});
		});

		it("refuses while the settings file cannot be read, without the records path", async () => {
			const { launcher, post, runsDirectory } = await harness("missing");
			await Bun.write(join(runsDirectory, "settings.json"), "not json");

			const response = await post({
				kind: "case",
				caseId: "pipe-case",
				attempts: 1,
			});
			const { error } = refusalSchema.parse(await response.json());

			expect(response.status).toBe(409);
			expect(error).toContain(SET_SPEND_CEILING_COMMAND);
			expect(error).not.toContain(runsDirectory);
			expect(launcher.launches).toEqual([]);
		});
	});
	describe("when the launch dialog reads what it offers", () => {
		const settingsSchema = z.object({
			spendCeilingUsd: z.number().nullable(),
			setCommand: z.string(),
		});
		const casesSchema = z.object({
			cases: z.array(
				z.object({
					id: z.string(),
					kind: z.string(),
					title: z.string(),
					model: z.string().nullable(),
				}),
			),
			unreadable: z.array(z.object({ id: z.string(), reason: z.string() })),
		});

		it("reads the stored spend ceiling and the command that sets it", async () => {
			const { get } = await harness();

			const response = await get("/api/settings");

			expect(settingsSchema.parse(await response.json())).toEqual({
				spendCeilingUsd: 5,
				setCommand: SET_SPEND_CEILING_COMMAND,
			});
		});

		it("reads no ceiling when none is stored", async () => {
			const { get } = await harness("missing");

			const response = await get("/api/settings");

			expect(
				settingsSchema.parse(await response.json()).spendCeilingUsd,
			).toBeNull();
		});

		it("answers a conflict naming the fix when the settings file cannot be read", async () => {
			const { get, runsDirectory } = await harness("missing");
			await Bun.write(join(runsDirectory, "settings.json"), "not json");

			const response = await get("/api/settings");

			expect(response.status).toBe(409);
			expect(refusalSchema.parse(await response.json()).error).toContain(
				SET_SPEND_CEILING_COMMAND,
			);
		});

		it("lists every declared case with the model it runs under", async () => {
			const { get } = await harness();

			const response = await get("/api/cases");

			expect(casesSchema.parse(await response.json())).toEqual({
				cases: [
					{
						id: "no-model",
						kind: "session",
						title: UNMODELLED_CASE.title,
						model: null,
					},
					{
						id: "pipe-case",
						kind: "pipeline",
						title: PIPELINE_CASE.title,
						model: "sonnet",
					},
					{
						id: "sess-case",
						kind: "session",
						title: SESSION_CASE.title,
						model: "haiku",
					},
				],
				unreadable: [
					{
						id: BROKEN_CASE.id,
						reason:
							"Case broken-case declaration has an invalid kind: Invalid discriminator value. Expected 'pipeline' | 'session'",
					},
				],
			});
		});
	});

	describe("when a case is declared", () => {
		const DECLARED_CASE = {
			id: "declared",
			kind: "session",
			title: "A declared case",
			prompt: "Reply OK.",
			tools: [],
			corpusFiles: ["skills/build/SKILL.md"],
			checks: [{ kind: "word-band", max: 1 }],
			model: "sonnet",
		};
		const declaredSchema = z.object({
			declaration: z.unknown(),
			path: z.string(),
		});
		const listedIdsSchema = z.object({
			cases: z.array(z.object({ id: z.string() })),
		});

		it("answers the declaration and the file it wrote, and lists the case", async () => {
			const { declare, get } = await harness();

			const response = await declare(DECLARED_CASE);

			expect(response.status).toBe(201);
			expect(declaredSchema.parse(await response.json())).toEqual({
				declaration: DECLARED_CASE,
				path: "cases/declared/case.json",
			});
			const listing = await get("/api/cases");
			const { cases } = listedIdsSchema.parse(await listing.json());
			expect(cases.map(({ id }) => id)).toContain(DECLARED_CASE.id);
		});

		it("writes the declaration as typed, without the defaults the parser fills in", async () => {
			const { declare, casesDirectory } = await harness();

			await declare(DECLARED_CASE);

			const written: unknown = await Bun.file(
				join(casesDirectory, DECLARED_CASE.id, "case.json"),
			).json();
			expect(written).toEqual(DECLARED_CASE);
		});

		it("writes the fields in the order a case.json declares them", async () => {
			const { declare, casesDirectory } = await harness();

			await declare(DECLARED_CASE);

			const written = await Bun.file(
				join(casesDirectory, DECLARED_CASE.id, "case.json"),
			).text();
			const fields = [...written.matchAll(/^\t"(?<field>\w+)":/gmu)].map(
				(match) => match.groups?.["field"],
			);
			expect(fields).toEqual(Object.keys(DECLARED_CASE));
		});

		it("writes a declaration the case reader a run uses parses", async () => {
			const { declare, casesDirectory } = await harness();

			await declare(DECLARED_CASE);

			expect(
				await readCaseDeclaration(DECLARED_CASE.id, casesDirectory),
			).toMatchObject(DECLARED_CASE);
		});

		describe("when the declaration is refused", () => {
			async function caseDirectories(root: string): Promise<string[]> {
				const entries = await readdir(root);

				return entries.toSorted((left, right) => left.localeCompare(right));
			}

			it("refuses an id that is already declared, keeping its declaration", async () => {
				const { declare, casesDirectory } = await harness();

				const response = await declare({
					...DECLARED_CASE,
					id: SESSION_CASE.id,
				});

				expect(response.status).toBe(409);
				expect(refusalSchema.parse(await response.json()).error).toContain(
					SESSION_CASE.id,
				);
				expect(
					await readCaseDeclaration(SESSION_CASE.id, casesDirectory),
				).toMatchObject(SESSION_CASE);
			});

			it("declares one of two requests that race for one id and refuses the other", async () => {
				const { declare, casesDirectory } = await harness();

				const responses = await Promise.all([
					declare(DECLARED_CASE),
					declare({ ...DECLARED_CASE, title: "The other" }),
				]);

				expect(
					responses
						.map(({ status }) => status)
						.toSorted((left, right) => left - right),
				).toEqual([201, 409]);
				expect(
					await readCaseDeclaration(DECLARED_CASE.id, casesDirectory),
				).toMatchObject({ id: DECLARED_CASE.id });
			});

			it("refuses while the settings file cannot be read, writing no case directory", async () => {
				const { declare, casesDirectory, runsDirectory } = await harness();
				await Bun.write(join(runsDirectory, "settings.json"), "not json");
				const before = await caseDirectories(casesDirectory);

				const response = await declare(DECLARED_CASE);

				expect(response.status).toBe(409);
				expect(refusalSchema.parse(await response.json()).error).toContain(
					SET_SPEND_CEILING_COMMAND,
				);
				expect(await caseDirectories(casesDirectory)).toEqual(before);
			});

			it.each([
				["no check", { ...DECLARED_CASE, checks: [] }, "checks"],
				[
					"an id that is not a case id",
					{ ...DECLARED_CASE, id: "../escape" },
					"lowercase letters, digits, or dashes",
				],
				["no prompt", { ...DECLARED_CASE, prompt: "" }, "prompt"],
				[
					"a corpus file outside the corpus layout",
					{ ...DECLARED_CASE, corpusFiles: ["notes/plan.md"] },
					"notes/plan.md",
				],
				[
					"a corpus file that climbs out of the corpus install",
					{ ...DECLARED_CASE, corpusFiles: ["skills/../../.ssh/id_rsa"] },
					"skills/../../.ssh/id_rsa",
				],
				[
					"a corpus file that climbs out of the corpus layout",
					{ ...DECLARED_CASE, corpusFiles: ["skills/../settings.json"] },
					"skills/../settings.json",
				],
				[
					"a prompt the claude CLI would read as an option",
					{ ...DECLARED_CASE, prompt: "--version" },
					"prompt",
				],
				[
					"a field no case declares",
					{ ...DECLARED_CASE, titel: "A declared case" },
					"titel is not a case.json field",
				],
			])(
				"refuses %s with the reason and writes no case directory",
				async (_label, body, named) => {
					const { declare, casesDirectory } = await harness();
					const before = await caseDirectories(casesDirectory);

					const response = await declare(body);

					expect(response.status).toBe(400);
					expect(refusalSchema.parse(await response.json()).error).toContain(
						named,
					);
					expect(await caseDirectories(casesDirectory)).toEqual(before);
				},
			);

			it.each([
				["target", { path: "/target" }],
				["stateCheck", { kind: "file-exists", path: "x" }],
				["settings", { permissions: { allow: ["Bash"] } }],
				["agents", { helper: {} }],
				["fixture", "fixture"],
				["transcript", { file: "prefix.jsonl" }],
				["projectFiles", ["CLAUDE.md"]],
			])(
				"refuses a declaration that sets %s, which is declared by hand",
				async (field, value) => {
					const { declare, casesDirectory } = await harness();
					const before = await caseDirectories(casesDirectory);

					const response = await declare({ ...DECLARED_CASE, [field]: value });

					expect(response.status).toBe(400);
					const { error } = refusalSchema.parse(await response.json());
					expect(error).toContain(field);
					expect(error).toContain("by hand");
					expect(await caseDirectories(casesDirectory)).toEqual(before);
				},
			);

			it("refuses a pipeline case, which needs a target repository and its own task files", async () => {
				const { declare, casesDirectory } = await harness();
				const before = await caseDirectories(casesDirectory);

				const response = await declare({ ...DECLARED_CASE, kind: "pipeline" });

				expect(response.status).toBe(400);
				expect(refusalSchema.parse(await response.json()).error).toContain(
					"target repository",
				);
				expect(await caseDirectories(casesDirectory)).toEqual(before);
			});
		});
	});

	describe("when the settings are read and written", () => {
		const readingSchema = z.object({
			spendCeilingUsd: z.number().nullable(),
			recordsDirectory: z.string(),
			linkedCorpus: z.object({
				kind: z.enum(["live", "directory"]),
				root: z.string(),
			}),
			overrun: z.string(),
		});

		async function reading(
			get: Harness["get"],
		): Promise<z.infer<typeof readingSchema>> {
			const response = await get("/api/settings");

			return readingSchema.parse(await response.json());
		}

		async function corpusDirectory(): Promise<string> {
			const corpus = await temporaryDirectory("rehearse-settings-corpus-");
			await Bun.write(join(corpus, "CLAUDE.md"), "linked\n");

			return corpus;
		}

		it("reads the ceiling, the records location, the linked corpus and the overrun", async () => {
			const { get, runsDirectory } = await harness();

			const response = await get("/api/settings");

			expect(readingSchema.parse(await response.json())).toEqual({
				spendCeilingUsd: 5,
				recordsDirectory: runsDirectory,
				linkedCorpus: { kind: "live", root: liveCorpusSource().root },
				overrun: CEILING_OVERRUN_STATEMENT,
			});
		});

		it("stores a ceiling the server reads back after a restart", async () => {
			const served = await harness("missing");
			await served.send("PUT", "/api/settings/spend-ceiling", { usd: 2.5 });

			const restarted = await served.restarted();
			const response = await restarted.get("/api/settings");

			expect(readingSchema.parse(await response.json()).spendCeilingUsd).toBe(
				2.5,
			);
		});

		it("stores a ceiling a new CLI process reads back", async () => {
			const { send, runsDirectory } = await harness("missing");
			await send("PUT", "/api/settings/spend-ceiling", { usd: 2.5 });

			const child = Bun.spawn(
				[
					process.execPath,
					join(CONTROL_DIR, "rehearse.ts"),
					"settings",
					"--json",
				],
				{
					env: { ...Bun.env, [RECORDS_DIRECTORY_VARIABLE]: runsDirectory },
					stdout: "pipe",
				},
			);
			const stdout = await new Response(child.stdout).text();

			expect(await child.exited).toBe(0);
			expect(JSON.parse(stdout)).toMatchObject({ spendCeilingUsd: 2.5 });
		});

		it("links a corpus directory and reads it back", async () => {
			const { send, get } = await harness();
			const corpus = await corpusDirectory();

			const linked = await send("PUT", "/api/settings/corpus", {
				directory: corpus,
			});

			expect(linked.status).toBe(200);
			const after = await reading(get);
			expect(after.linkedCorpus).toEqual({
				kind: "directory",
				root: corpus,
			});
		});

		it("unlinks the corpus, leaving the live install linked", async () => {
			const { send, get } = await harness();
			await send("PUT", "/api/settings/corpus", {
				directory: await corpusDirectory(),
			});

			const unlinked = await send("DELETE", "/api/settings/corpus", {});

			expect(unlinked.status).toBe(200);
			const after = await reading(get);
			expect(after.linkedCorpus.kind).toBe("live");
		});

		describe("when the linked corpus is measured now", () => {
			const measuredSchema = z.object({
				label: z.string(),
				digest: z.string(),
			});

			it("records a version of the linked directory and answers its label", async () => {
				const { send, runsDirectory } = await harness();
				const corpus = await corpusDirectory();
				await send("PUT", "/api/settings/corpus", { directory: corpus });

				const response = await send("POST", "/api/settings/corpus/rehash", {});
				const measured = measuredSchema.parse(await response.json());

				expect(response.status).toBe(200);
				expect(measured.label).toBe(corpusVersionLabel(measured.digest));
				expect(
					await corpusVersionLog(runsDirectory, directorySource(corpus)),
				).toEqual([measured.digest]);
			});

			it("refuses a corpus it cannot measure, naming why", async () => {
				const { send } = await harness();
				const corpus = await corpusDirectory();
				const outside = await temporaryDirectory("rehearse-outside-");
				await Bun.write(join(outside, "secret.md"), "outside\n");
				await mkdir(join(corpus, "skills", "leak"), { recursive: true });
				await symlink(
					join(outside, "secret.md"),
					join(corpus, "skills", "leak", "SKILL.md"),
				);
				await send("PUT", "/api/settings/corpus", { directory: corpus });

				const response = await send("POST", "/api/settings/corpus/rehash", {});
				const refused = z
					.object({ error: z.string() })
					.parse(await response.json());

				expect(response.status).toBe(409);
				expect(refused.error).toContain("SKILL.md");
			});
		});

		describe("when the settings file cannot be read", () => {
			it.each([
				["PUT", "/api/settings/spend-ceiling", { usd: 2 }],
				["PUT", "/api/settings/corpus", { directory: "<corpus>" }],
				["DELETE", "/api/settings/corpus", {}],
				["POST", "/api/settings/corpus/rehash", {}],
			] as const)(
				"answers %s %s with a conflict and leaves the file",
				async (method, path, body) => {
					const { send, runsDirectory } = await harness("missing");
					const settingsFile = join(runsDirectory, "settings.json");
					await Bun.write(settingsFile, "not json");

					const corpus = await corpusDirectory();

					const response = await send(
						method,
						path,
						"directory" in body ? { directory: corpus } : body,
					);

					expect(response.status).toBe(409);
					expect(refusalSchema.parse(await response.json()).error).toContain(
						SET_SPEND_CEILING_COMMAND,
					);
					expect(await Bun.file(settingsFile).text()).toBe("not json");
				},
			);
		});

		describe("when the written value is refused", () => {
			it.each([0, -1, "5"])("refuses %p as a ceiling", async (usd) => {
				const { send, get } = await harness();

				const response = await send("PUT", "/api/settings/spend-ceiling", {
					usd,
				});

				expect(response.status).toBe(400);
				const after = await reading(get);
				expect(after.spendCeilingUsd).toBe(5);
			});

			it("refuses a directory holding no corpus and keeps the link", async () => {
				const { send, get } = await harness();
				const linked = await corpusDirectory();
				await send("PUT", "/api/settings/corpus", { directory: linked });
				const notCorpus = await temporaryDirectory("rehearse-not-corpus-");

				const response = await send("PUT", "/api/settings/corpus", {
					directory: notCorpus,
				});

				expect(response.status).toBe(409);
				const after = await reading(get);
				expect(after.linkedCorpus.root).toBe(linked);
			});

			it("refuses a relative directory as a bad request, since the server's working directory is not the browser's", async () => {
				const { send, get } = await harness();

				const response = await send("PUT", "/api/settings/corpus", {
					directory: "",
				});

				expect(response.status).toBe(400);
				const after = await reading(get);
				expect(after.linkedCorpus.kind).toBe("live");
			});
		});
	});

	describe("when a run is paused", () => {
		const RUN_PID = 4242;
		const running: RunLiveness = {
			readMarker: () => Promise.resolve({ pid: RUN_PID }),
			isAlive: (pid) => pid === RUN_PID,
		};

		async function runningRun(runsDirectory: string): Promise<string> {
			const fixture = new RecordedRunsFixture(runsDirectory);
			await fixture.writeRunningRun();

			return fixture.runningRun;
		}

		it("asks a RUNNING run to pause after its stage and answers accepted", async () => {
			const server = await harness("stored", running);
			const run = await runningRun(server.runsDirectory);

			const response = await server.pause(run);

			expect(response.status).toBe(202);
			expect(
				await pauseRequested(benchmarkRunPaths(server.runsDirectory, run)),
			).toBe(true);
		});

		it("refuses a run that is no longer running and asks nothing", async () => {
			const server = await harness();
			const run = await runningRun(server.runsDirectory);

			const response = await server.pause(run);

			expect(response.status).toBe(409);
			expect(
				await pauseRequested(benchmarkRunPaths(server.runsDirectory, run)),
			).toBe(false);
		});

		it("refuses a run it has no record of", async () => {
			const server = await harness("stored", running);

			const response = await server.pause("2026-01-01T00-00-00.000Z");

			expect(response.status).toBe(404);
		});
	});

	describe("when a launch is stopped", () => {
		async function launched(post: Harness["post"]): Promise<string> {
			const response = await post({
				kind: "case",
				caseId: "pipe-case",
				attempts: 1,
			});

			return launchedSchema.parse(await response.json()).id;
		}

		it("signals the launch's process to stop and answers accepted", async () => {
			const server = await harness();
			const id = await launched(server.post);

			const response = await server.stop(id);

			expect(response.status).toBe(202);
			expect(server.launcher.stopped).toEqual([FAKE_LAUNCH_PID]);
		});

		it("records that the operator asked it to stop", async () => {
			const server = await harness();
			const id = await launched(server.post);

			await server.stop(id);

			const record = await readLaunchRecord(server.runsDirectory, id);
			expect(record.stopRequestedAt).toBeString();
		});

		it("stops a launch a server started before it restarted", async () => {
			const server = await harness();
			const id = await launched(server.post);
			const restarted = await server.restarted();

			const response = await restarted.stop(id);

			expect(response.status).toBe(202);
			expect(restarted.launcher.stopped).toEqual([FAKE_LAUNCH_PID]);
		});

		describe("when it is a culprit analysis", () => {
			it("refuses, leaving the one capped call to end and record what it spent", async () => {
				const server = await harness();
				await runStoppedAtBuild(server.runsDirectory);
				const response = await server.post({
					kind: "analysis",
					run: ANALYZED_RUN,
					statedUsd: 1,
				});
				const { id } = launchedSchema.parse(await response.json());

				const stop = await server.stop(id);

				expect(stop.status).toBe(409);
				expect(refusalSchema.parse(await stop.json()).error).toBe(
					`Launch ${id} is a culprit analysis, one call capped at the cost it stated, which records what it spent when it ends; it cannot be stopped`,
				);
				expect(server.launcher.stopped).toEqual([]);
				const record = await readLaunchRecord(server.runsDirectory, id);
				expect(record.stopRequestedAt).toBeUndefined();
			});
		});

		describe("when its process cannot be told apart from another", () => {
			it("refuses a launch that was never recorded", async () => {
				const server = await harness();

				const response = await server.stop(crypto.randomUUID());

				expect(response.status).toBe(404);
				expect(server.launcher.stopped).toEqual([]);
			});

			it("refuses a launch whose process has ended", async () => {
				const server = await harness();
				const id = await launched(server.post);
				server.launcher.processes.delete(FAKE_LAUNCH_PID);

				const response = await server.stop(id);

				expect(response.status).toBe(409);
				expect(server.launcher.stopped).toEqual([]);
			});

			it("refuses a launch whose pid a later process now holds", async () => {
				const server = await harness();
				const id = await launched(server.post);
				server.launcher.processes.set(
					FAKE_LAUNCH_PID,
					"Wed Sep 30 09:00:00 2026",
				);

				const response = await server.stop(id);

				expect(response.status).toBe(409);
				expect(server.launcher.stopped).toEqual([]);
			});

			it("refuses a launch recorded without its start time", async () => {
				const server = await harness();
				const id = await launched(server.post);
				const { startedAt: _startedAt, ...withoutStart } =
					await readLaunchRecord(server.runsDirectory, id);
				await writeLaunchRecord(server.runsDirectory, withoutStart);

				const response = await server.stop(id);

				expect(response.status).toBe(409);
				expect(server.launcher.stopped).toEqual([]);
			});
		});
	});
});
