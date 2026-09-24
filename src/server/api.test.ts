import { afterEach, describe, expect, it } from "bun:test";
import {
	chmod,
	mkdir,
	mkdtemp,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { CorpusRoot } from "#benchmark/corpus-file";
import { CASES_DIRECTORY } from "#benchmark/case";
import {
	directorySource,
	liveStageSettings,
	RecordedRunsFixture,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import type { RecordedRunsOptions } from "#benchmark/run-records-test-support";
import { CONTROL_DIR } from "#benchmark/config";
import { runEventsDatabaseFile } from "#benchmark/run-layout";
import { openRunEventStore } from "#benchmark/run-events";
import { createApiApp } from "./api";

const runEventSchema = z.object({ kind: z.string() }).loose();

function parseSSEFrames(
	body: string,
): readonly z.infer<typeof runEventSchema>[] {
	return body
		.split("\n\n")
		.filter((frame) => frame.length > 0)
		.map((frame) =>
			runEventSchema.parse(
				JSON.parse(
					frame
						.split("\n")
						.filter((line) => line.startsWith("data:"))
						.map((line) => line.slice("data:".length).trim())
						.join("\n"),
				),
			),
		);
}

const corpusResponseSchema = z.object({
	root: z.string(),
	digest: z.string().optional(),
	files: z.array(z.object({ path: z.string() }).loose()),
	refusals: z.array(z.string()),
});

const pipelineRunRowSchema = z
	.object({
		kind: z.literal("run"),
		run: z.string(),
		stale: z.boolean(),
		staleCauses: z.array(z.string()),
	})
	.loose();
const runHistoryResponseSchema = z.object({
	rows: z.array(z.object({ kind: z.string() }).loose()),
	unreadable: z.array(z.object({ id: z.string(), reason: z.string() })),
});

interface PipelineRunHistory {
	readonly rows: readonly z.infer<typeof pipelineRunRowSchema>[];
	readonly unreadable: z.infer<typeof runHistoryResponseSchema>["unreadable"];
}

/**
 * The pipeline run rows only: these tests are about runs and their corpus
 * staleness, and the fixture also records attempts, a group and a replay.
 */
async function runHistoryResponseFrom(
	response: Response,
): Promise<PipelineRunHistory> {
	const body = runHistoryResponseSchema.parse(await response.json());

	return {
		rows: body.rows
			.filter((row) => row.kind === "run")
			.map((row) => pipelineRunRowSchema.parse(row)),
		unreadable: body.unreadable,
	};
}

/**
 * A response body does not carry the concrete path the test planted. Naming
 * that value rather than re-deriving the redactor's pattern is what keeps the
 * check honest: a detector built from the redactor's own logic agrees with the
 * redactor even where the redactor is wrong.
 */
function assertDoesNotLeak(body: string, secret: string): void {
	expect(body).not.toContain(secret);
}

describe(createApiApp.name, () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
		);
	});

	async function emptyDirectory(prefix: string): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), prefix));
		roots.push(root);

		return root;
	}

	async function corpusDirectory(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-api-corpus-"));
		roots.push(root);
		await mkdir(join(root, "skills", "build"), { recursive: true });
		await mkdir(join(root, "skills", "discuss"), { recursive: true });
		await Bun.write(join(root, "CLAUDE.md"), "the instructions\n");
		await Bun.write(join(root, "skills", "build", "SKILL.md"), "build skill\n");
		await Bun.write(
			join(root, "skills", "discuss", "SKILL.md"),
			"discuss skill\n",
		);

		return root;
	}

	async function writtenFixture(
		options: RecordedRunsOptions = {},
	): Promise<RecordedRunsFixture> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-api-"));
		roots.push(root);
		const fixture = new RecordedRunsFixture(root, options);
		await fixture.write();

		return fixture;
	}

	/**
	 * A fixture whose records carry the live root settings digest. Every
	 * assertion about a row's `stale` flag needs it, because `deriveStaleness`
	 * compares the recorded digest against the one it loads from that file. The
	 * fixture's own literal never matches, so it would decide the flag on its
	 * own, passing a `stale: false` test for the wrong reason and passing a
	 * `stale: true` test whatever the corpus holds.
	 */
	async function fixtureRecordingLiveSettings(): Promise<RecordedRunsFixture> {
		return writtenFixture({ settingsFile: await liveStageSettings() });
	}

	describe("GET /api/runs", () => {
		it("renders every recorded run as a row", async () => {
			const fixture = await writtenFixture();
			const corpus = await corpusDirectory();
			await fixture.recordCorpusFrom(directorySource(corpus));
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});

			const response = await app.request("/api/runs");
			const body = await runHistoryResponseFrom(response);

			expect(response.status).toBe(200);
			expect(body.rows.some((row) => row.run === fixture.replayableRun)).toBe(
				true,
			);
		});

		it("keeps healthy rows when one run's current settings are unavailable", async () => {
			const fixture = await fixtureRecordingLiveSettings();
			const corpus = await corpusDirectory();
			const brokenRun = "2026-09-07T00-00-00.000Z";
			const caseId = "zz-api-settings-missing";
			const caseDirectory = join(CONTROL_DIR, CASES_DIRECTORY, caseId);
			roots.push(caseDirectory);
			await mkdir(caseDirectory, { recursive: true });
			await Bun.write(
				join(caseDirectory, "case.json"),
				JSON.stringify({
					id: caseId,
					kind: "pipeline",
					title: "Missing settings",
					task: "task.md",
					productBrief: "brief.md",
					finalRubric: "rubric.md",
					pipeline: "pipeline.json",
					rubrics: "rubrics",
					target: { path: "/target" },
					settingsFile: "settings.json",
				}),
			);
			await fixture.writePipelineRun(brokenRun, caseId, {
				path: `cases/${caseId}/settings.json`,
				sha256: "0".repeat(64),
			});
			await fixture.recordCorpusFrom(directorySource(corpus));
			await fixture.recordCorpusFrom(directorySource(corpus), brokenRun);
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});

			const response = await app.request("/api/runs");
			const body = await runHistoryResponseFrom(response);

			expect(response.status).toBe(200);
			expect(
				body.rows.find(({ run }) => run === fixture.replayableRun)?.stale,
			).toBe(false);
			const broken = body.rows.find(({ run }) => run === brokenRun);
			expect(broken?.stale).toBe(true);
			expect(broken?.staleCauses.join(" ")).toContain(
				`cases/${caseId}/settings.json`,
			);
			assertDoesNotLeak(JSON.stringify(body), CONTROL_DIR);
		});

		it("renders an empty runs directory as no rows, not an error", async () => {
			const root = await mkdtemp(join(tmpdir(), "rehearse-api-empty-"));
			roots.push(root);
			const app = createApiApp({
				runsDirectory: root,
				liveness: nothingRunning,
				corpusSource: directorySource(await corpusDirectory()),
			});

			const response = await app.request("/api/runs");
			const body = await runHistoryResponseFrom(response);

			expect(response.status).toBe(200);
			expect(body.rows).toEqual([]);
		});

		/**
		 * Run history answers for every recorded run, and the corpus supplies one
		 * half of every staleness comparison. A corpus that cannot supply its
		 * instruction file invalidates the measurements that hashed one, which is
		 * a cause each affected row carries, not an error that blanks the screen
		 * and names nothing.
		 */
		describe("when the corpus cannot supply its instruction file", () => {
			async function historyFor(
				corpusSource: CorpusRoot,
			): Promise<PipelineRunHistory> {
				const fixture = await fixtureRecordingLiveSettings();
				const app = createApiApp({
					runsDirectory: fixture.runsDirectory,
					liveness: nothingRunning,
					corpusSource,
				});

				const response = await app.request("/api/runs");

				expect(response.status).toBe(200);

				return runHistoryResponseFrom(response);
			}

			it("names a CLAUDE.md that links out of a directory source as the cause", async () => {
				const corpus = await corpusDirectory();
				const outside = await emptyDirectory("rehearse-api-outside-");
				await writeFile(join(outside, "secret.md"), "SECRET BYTES\n");
				await rm(join(corpus, "CLAUDE.md"));
				await symlink(join(outside, "secret.md"), join(corpus, "CLAUDE.md"));

				const body = await historyFor(directorySource(corpus));

				expect(body.rows.flatMap((row) => row.staleCauses)).toContain(
					"Corpus file CLAUDE.md resolves outside the corpus source, which would hash bytes the corpus does not hold",
				);
				expect(body.rows.some((row) => row.stale)).toBe(true);
				assertDoesNotLeak(JSON.stringify(body), "SECRET BYTES");
				assertDoesNotLeak(JSON.stringify(body), outside);
			});

			it("names a CLAUDE.md that never resolves as the cause, not as a file that does not exist", async () => {
				const corpus = await corpusDirectory();
				const backingRoot = await emptyDirectory("rehearse-api-backing-");
				await rm(join(corpus, "CLAUDE.md"));
				await symlink(join(corpus, "CLAUDE.md"), join(corpus, "CLAUDE.md"));

				const body = await historyFor({
					kind: "live",
					root: corpus,
					backingRoot,
				});

				expect(body.rows.flatMap((row) => row.staleCauses)).toContain(
					"Corpus file CLAUDE.md is a link that never resolves to a file, so it names no bytes",
				);
			});

			it("names the absent instruction file as the cause, a corpus state the corpus report calls valid", async () => {
				const corpus = await corpusDirectory();
				await rm(join(corpus, "CLAUDE.md"));

				const body = await historyFor(directorySource(corpus));

				expect(body.rows.flatMap((row) => row.staleCauses)).toContain(
					"Corpus file CLAUDE.md is not in the corpus under test, so a checkpoint that hashed it cannot be compared",
				);
			});

			it("keeps every row readable, so history is not hidden behind one corpus state", async () => {
				const corpus = await corpusDirectory();
				await rm(join(corpus, "CLAUDE.md"));

				const body = await historyFor(directorySource(corpus));

				expect(body.rows.length).toBeGreaterThan(1);
				expect(body.unreadable).toEqual([]);
			});
		});

		it("recomputes staleness fresh on every request rather than caching it", async () => {
			const fixture = await fixtureRecordingLiveSettings();
			const corpus = await corpusDirectory();
			await fixture.recordCorpusFrom(directorySource(corpus));
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});

			const firstResponse = await app.request("/api/runs");
			const first = await runHistoryResponseFrom(firstResponse);
			await Bun.write(
				join(corpus, "skills", "build", "SKILL.md"),
				"build skill, edited\n",
			);
			const secondResponse = await app.request("/api/runs");
			const second = await runHistoryResponseFrom(secondResponse);

			const firstRow = first.rows.find(
				(row) => row.run === fixture.replayableRun,
			);
			const secondRow = second.rows.find(
				(row) => row.run === fixture.replayableRun,
			);
			expect(firstRow?.stale).toBe(false);
			expect(secondRow?.stale).toBe(true);
		});
	});

	describe("GET /api/corpus", () => {
		it("refuses an escaping live layout root without revealing its target or descendants", async () => {
			const corpus = await corpusDirectory();
			const outside = await emptyDirectory("private-corpus-target-");
			const backingRoot = await emptyDirectory("rehearse-backing-");
			await writeFile(
				join(outside, "hidden-descendant.md"),
				"private contents",
			);
			await symlink(outside, join(corpus, "agents"));
			const app = createApiApp({
				runsDirectory: await emptyDirectory("rehearse-api-runs-"),
				liveness: nothingRunning,
				corpusSource: { kind: "live", root: corpus, backingRoot },
			});

			const response = await app.request("/api/corpus");
			const text = await response.text();

			expect(response.status).toBe(200);
			const body = corpusResponseSchema.parse(JSON.parse(text));
			expect(body.digest).toBeUndefined();
			expect(body.refusals).toHaveLength(1);
			expect(body.refusals[0]).toContain("agents");
			expect(body.files.map(({ path }) => path)).toEqual([
				"CLAUDE.md",
				"skills/build/SKILL.md",
				"skills/discuss/SKILL.md",
			]);
			assertDoesNotLeak(text, outside);
			assertDoesNotLeak(text, "hidden-descendant.md");
			assertDoesNotLeak(text, "private contents");
		});

		it("renders the corpus root unredacted, since the operator declared it and the server is theirs", async () => {
			const corpus = await corpusDirectory();
			const runsDirectory = await mkdtemp(join(tmpdir(), "rehearse-api-runs-"));
			roots.push(runsDirectory);
			const app = createApiApp({
				runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});

			const response = await app.request("/api/corpus");
			const body: unknown = await response.json();

			expect(response.status).toBe(200);
			expect(body).toMatchObject({ root: corpus });
		});

		it("serves the files it could hash and names the refusal, rather than failing the screen over one entry", async () => {
			const corpus = await corpusDirectory();
			const outside = await emptyDirectory("rehearse-api-outside-");
			await writeFile(join(outside, "secret.md"), "secret bytes\n");
			await mkdir(join(corpus, "agents"), { recursive: true });
			await symlink(
				join(outside, "secret.md"),
				join(corpus, "agents", "escape.md"),
			);
			const app = createApiApp({
				runsDirectory: await emptyDirectory("rehearse-api-runs-"),
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});

			const response = await app.request("/api/corpus");
			const text = await response.text();
			const body = corpusResponseSchema.parse(JSON.parse(text));

			expect(response.status).toBe(200);
			expect(body.files.map(({ path }) => path)).toEqual([
				"CLAUDE.md",
				"skills/build/SKILL.md",
				"skills/discuss/SKILL.md",
			]);
			expect(body.refusals).toEqual([
				"agents/escape.md resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
			]);
			expect(body.digest).toBeUndefined();
		});

		it("names CLAUDE.md as a refusal when it is itself a link out of the tree, rather than failing the screen", async () => {
			const corpus = await emptyDirectory("rehearse-api-corpus-");
			const outside = await emptyDirectory("rehearse-api-outside-");
			await writeFile(join(outside, "secret.md"), "secret bytes\n");
			await symlink(join(outside, "secret.md"), join(corpus, "CLAUDE.md"));
			const app = createApiApp({
				runsDirectory: await emptyDirectory("rehearse-api-runs-"),
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});

			const response = await app.request("/api/corpus");
			const text = await response.text();
			const body = corpusResponseSchema.parse(JSON.parse(text));

			expect(response.status).toBe(200);
			expect(body.refusals).toEqual([
				"Corpus file CLAUDE.md resolves outside the corpus source, which would hash bytes the corpus does not hold",
			]);
			expect(body.files).toEqual([]);
			expect(body.digest).toBeUndefined();
		});

		it("names an unreadable layout entry as a refusal, rather than failing the screen", async () => {
			const corpus = await corpusDirectory();
			await mkdir(join(corpus, "agents"), { recursive: true });
			await writeFile(join(corpus, "agents", "private.md"), "an agent\n");
			await chmod(join(corpus, "agents", "private.md"), 0o000);
			const app = createApiApp({
				runsDirectory: await emptyDirectory("rehearse-api-runs-"),
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});

			const response = await app.request("/api/corpus");
			const text = await response.text();
			const body = corpusResponseSchema.parse(JSON.parse(text));

			expect(response.status).toBe(200);
			expect(body.refusals).toEqual([
				"agents/private.md cannot be read, so its bytes cannot be hashed",
			]);
			expect(body.digest).toBeUndefined();
			expect(text).not.toContain("EACCES");
			assertDoesNotLeak(body.refusals.join(""), corpus);
		});

		it("names a self-referential layout entry as a refusal, rather than failing the screen", async () => {
			const corpus = await corpusDirectory();
			await mkdir(join(corpus, "agents"), { recursive: true });
			await symlink(
				join(corpus, "agents", "loop.md"),
				join(corpus, "agents", "loop.md"),
			);
			const app = createApiApp({
				runsDirectory: await emptyDirectory("rehearse-api-runs-"),
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});

			const response = await app.request("/api/corpus");
			const text = await response.text();
			const body = corpusResponseSchema.parse(JSON.parse(text));

			expect(response.status).toBe(200);
			expect(body.refusals).toEqual([
				"agents/loop.md is a link that never resolves to a file, so it names no bytes",
			]);
			expect(body.digest).toBeUndefined();
			expect(text).not.toContain("ELOOP");
			assertDoesNotLeak(body.refusals.join(""), corpus);
		});

		it.each([
			[
				"a self-referential directory",
				(path: string) => symlink(path, path),
				"agents is a link that never resolves to a file, so it names no bytes",
			],
			[
				"a regular file",
				(path: string) => writeFile(path, "not a directory\n"),
				"agents is not a directory, so it cannot contain corpus files to hash",
			],
		])(
			"names %s at a top-level layout path as a refusal, rather than returning 500",
			async (_name, plant, expectedRefusal) => {
				const corpus = await corpusDirectory();
				await plant(join(corpus, "agents"));
				const app = createApiApp({
					runsDirectory: await emptyDirectory("rehearse-api-runs-"),
					liveness: nothingRunning,
					corpusSource: directorySource(corpus),
				});

				const response = await app.request("/api/corpus");
				const text = await response.text();
				const body = corpusResponseSchema.parse(JSON.parse(text));

				expect(response.status).toBe(200);
				expect(body.refusals).toEqual([expectedRefusal]);
				expect(body.digest).toBeUndefined();
				assertDoesNotLeak(body.refusals.join(""), corpus);
			},
		);

		it("serves a live corpus with an out-of-extent instruction file as a partial report", async () => {
			const corpus = await corpusDirectory();
			const backingRoot = await emptyDirectory("rehearse-api-backing-");
			const outside = await emptyDirectory("rehearse-api-outside-");
			await rm(join(corpus, "CLAUDE.md"));
			await writeFile(join(outside, "secret.md"), "SECRET BYTES\n");
			await symlink(join(outside, "secret.md"), join(corpus, "CLAUDE.md"));
			const app = createApiApp({
				runsDirectory: await emptyDirectory("rehearse-api-runs-"),
				liveness: nothingRunning,
				corpusSource: { kind: "live", root: corpus, backingRoot },
			});

			const response = await app.request("/api/corpus");
			const text = await response.text();
			const body = corpusResponseSchema.parse(JSON.parse(text));

			expect(response.status).toBe(200);
			expect(body.files.map(({ path }) => path)).toEqual([
				"skills/build/SKILL.md",
				"skills/discuss/SKILL.md",
			]);
			expect(body.refusals).toEqual([
				"Corpus file CLAUDE.md resolves outside the live corpus extent, which would hash bytes the corpus does not hold",
			]);
			expect(body.digest).toBeUndefined();
			expect(text).not.toContain("SECRET BYTES");
			expect(text).not.toContain(outside);
		});
	});

	describe("GET /api/records/:id", () => {
		it("refuses a record id whose segment escapes the runs directory, without a 500", async () => {
			const fixture = await writtenFixture();
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(await corpusDirectory()),
			});

			const response = await app.request(
				`/api/records/${encodeURIComponent("checkpoint:../../etc/passwd/shape")}`,
			);

			expect(response.status).toBeGreaterThanOrEqual(400);
			expect(response.status).toBeLessThan(500);
		});

		it("names no absolute filesystem path in a refusal body", async () => {
			const fixture = await writtenFixture();
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(await corpusDirectory()),
			});

			const response = await app.request(
				`/api/records/${encodeURIComponent("run:no-such-run")}`,
			);
			const body = await response.text();

			expect(response.status).toBeGreaterThanOrEqual(400);
			expect(response.status).toBeLessThan(500);
			assertDoesNotLeak(body, fixture.runsDirectory);
		});

		it("names no absolute filesystem path when the checkpoint stage in the id was never recorded", async () => {
			const fixture = await writtenFixture();
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(await corpusDirectory()),
			});
			const id = `checkpoint:${fixture.replayableRun}/no-such-stage`;

			const response = await app.request(
				`/api/records/${encodeURIComponent(id)}`,
			);
			const body = await response.text();

			expect(response.status).toBeGreaterThanOrEqual(400);
			expect(response.status).toBeLessThan(500);
			assertDoesNotLeak(body, fixture.runsDirectory);
		});
	});

	describe("GET /api/runs/:run/events", () => {
		it("streams every already-appended event as SSE frames, for a reader attaching mid-run", async () => {
			const runsDirectory = await mkdtemp(join(tmpdir(), "rehearse-api-runs-"));
			roots.push(runsDirectory);
			const store = await openRunEventStore(
				runEventsDatabaseFile(runsDirectory),
			);
			store.append({
				runId: "run-1",
				kind: "stage-started",
				stage: "shape",
				spentUsd: 0,
				elapsedMs: 0,
			});
			store.append({
				runId: "run-1",
				kind: "run-completed",
				stage: "shape",
				spentUsd: 1,
				elapsedMs: 1000,
			});
			store.close();
			const app = createApiApp({
				runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(await corpusDirectory()),
			});

			const response = await app.request("/api/runs/run-1/events");
			const frames = parseSSEFrames(await response.text());

			expect(response.headers.get("content-type")).toBe("text/event-stream");
			expect(frames.map(({ kind }) => kind)).toEqual([
				"stage-started",
				"run-completed",
			]);
		});

		it("keeps a run with no events open rather than closing the connection, since the run may not have started emitting yet", async () => {
			const runsDirectory = await mkdtemp(join(tmpdir(), "rehearse-api-runs-"));
			roots.push(runsDirectory);
			const app = createApiApp({
				runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(await corpusDirectory()),
			});
			const controller = new AbortController();

			const responsePromise = app.request("/api/runs/no-such-run/events", {
				signal: controller.signal,
			});
			const response = await responsePromise;
			const reader = response.body?.getReader();

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe("text/event-stream");
			controller.abort();
			await reader?.cancel();
		});
	});

	describe("unguarded route-level throw", () => {
		it("sanitizes an absolute path out of an error this module's own handlers did not anticipate", async () => {
			const root = await mkdtemp(join(tmpdir(), "rehearse-api-throw-"));
			roots.push(root);
			const app = createApiApp({
				runsDirectory: root,
				liveness: nothingRunning,
				corpusSource: directorySource(await corpusDirectory()),
			});
			app.get("/api/throws", () => {
				throw new Error(`boom at ${CONTROL_DIR}/secret.json`);
			});

			const response = await app.request("/api/throws");
			const body = await response.text();

			expect(response.status).toBe(500);
			assertDoesNotLeak(body, CONTROL_DIR);
		});

		it("names no absolute path when staleCheckpoints itself throws from a corpus root outside CONTROL_DIR", async () => {
			const fixture = await writtenFixture();
			const corpus = await corpusDirectory();
			await fixture.recordCorpusFrom(directorySource(corpus));
			await rm(join(corpus, "skills", "build"), { recursive: true });
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});

			const response = await app.request("/api/runs");
			const body = await response.text();

			assertDoesNotLeak(body, corpus);
		});
	});
});
