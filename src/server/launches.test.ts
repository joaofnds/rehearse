import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { readLaunchRecord } from "#benchmark/launch-record";
import { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import { storeSpendCeiling } from "#benchmark/settings";
import type { Launcher } from "./launches";
import { createLaunchApp } from "./launches";

const PID = 4242;

const launchedSchema = z.object({ id: z.string() });

/** The body the launch dialog posts, or a malformed one a test sends. */
type LaunchRequestBody = Readonly<Record<string, number | string>>;

interface Launch {
	readonly argv: readonly string[];
	readonly logFile: string;
}

class FakeLauncher implements Launcher {
	public readonly launches: Launch[] = [];

	public launch(argv: readonly string[], logFile: string): Promise<number> {
		this.launches.push({ argv, logFile });

		return Promise.resolve(PID);
	}
}

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
			casesRoot: await casesRoot([PIPELINE_CASE, SESSION_CASE]),
			launcher,
		});

		return {
			launcher,
			runsDirectory,
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
				pid: PID,
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
});
