import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { readLaunchRecord } from "#benchmark/launch-record";
import { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import {
	SET_SPEND_CEILING_COMMAND,
	storeSpendCeiling,
} from "#benchmark/settings";
import { FAKE_LAUNCH_PID, FakeLauncher } from "./launch-test-support";
import { createLaunchApp } from "./launches";

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

	interface Harness {
		readonly launcher: FakeLauncher;
		readonly runsDirectory: string;
		readonly post: (body: LaunchRequestBody) => Promise<Response>;
		readonly get: (path: string) => Promise<Response>;
	}

	async function harness(
		ceiling: "stored" | "missing" = "stored",
	): Promise<Harness> {
		const runsDirectory = await temporaryDirectory("rehearse-launch-runs-");
		if (ceiling === "stored") {
			await storeSpendCeiling(runsDirectory, 5);
		}
		const launcher = new FakeLauncher();
		const app = createLaunchApp({
			runsDirectory,
			casesRoot: await casesRoot([
				PIPELINE_CASE,
				SESSION_CASE,
				UNMODELLED_CASE,
			]),
			launcher,
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

		it("records the launch and its pid in the records directory", async () => {
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
				unreadable: [],
			});
		});
	});
});
