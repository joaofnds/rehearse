import type { Immutable } from "#benchmark/contracts";
import { afterEach, describe, expect, it } from "bun:test";
import {
	chmod,
	mkdir,
	mkdtemp,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
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
import {
	benchmarkRunPaths,
	checkpointRecordFile,
	confirmationGroupPaths,
	runEventsDatabaseFile,
} from "#benchmark/run-layout";
import { openRunEventStore } from "#benchmark/run-events";
import { claimShortId } from "#benchmark/short-id";
import { measureCorpusVersion } from "#benchmark/corpus-version";
import { createApiApp } from "./api";

function sha256Hex(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

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

const rowStalenessSchema = z.discriminatedUnion("state", [
	z
		.object({
			state: z.literal("available"),
			stale: z.boolean(),
			causes: z.array(z.string()),
		})
		.loose(),
	z.object({ state: z.literal("unavailable"), reasons: z.array(z.string()) }),
]);
const pipelineRunRowSchema = z
	.object({
		kind: z.literal("run"),
		run: z.string(),
		staleness: rowStalenessSchema,
	})
	.loose();
const runHistoryResponseSchema = z.object({
	rows: z.array(z.object({ kind: z.string() }).loose()),
	unreadable: z.array(
		z.object({ kind: z.string(), id: z.string(), reason: z.string() }),
	),
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

/** Every stale cause the history names, across the rows it could judge. */
function staleCausesOf(
	history: Immutable<PipelineRunHistory>,
): readonly string[] {
	return history.rows.flatMap(({ staleness }) =>
		staleness.state === "available" ? staleness.causes : [],
	);
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

		it("returns exactly the rows the ids parameter names", async () => {
			const fixture = await writtenFixture();
			const corpus = await corpusDirectory();
			const otherRun = "2026-09-12T00-00-00.000Z";
			await fixture.writePipelineRun(otherRun, "audit-log");
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});

			const response = await app.request(
				`/api/runs?ids=${encodeURIComponent(`run:${otherRun},group:absent`)}&ids=${encodeURIComponent(`run:${fixture.replayableRun}`)}`,
			);
			const body = await runHistoryResponseFrom(response);

			expect(body.rows.map((row) => row.kind === "run" && row.run)).toEqual([
				otherRun,
				fixture.replayableRun,
			]);
		});

		it("answers the rows the corpus's last edit invalidated as stale rows, a stopped run among them", async () => {
			const root = await emptyDirectory("rehearse-api-");
			const fixture = new RecordedRunsFixture(root, {
				settingsFile: await liveStageSettings(),
			});
			await fixture.writeStoppedRun();
			const corpus = await corpusDirectory();
			await fixture.recordStoppedStageFrom(directorySource(corpus));
			await writeFile(join(corpus, "skills", "build", "SKILL.md"), "edited\n");
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});
			const corpusResponse = await app.request("/api/corpus");
			const { lastEdit } = z
				.object({ lastEdit: z.object({ rows: z.array(z.string()) }) })
				.parse(await corpusResponse.json());
			const invalidated = lastEdit.rows;

			const response = await app.request(
				`/api/runs?ids=${encodeURIComponent(invalidated.join(","))}`,
			);
			const body = await runHistoryResponseFrom(response);

			expect(invalidated).toEqual([`run:${fixture.stoppedRun}`]);
			expect(
				body.rows.map(({ run, staleness }) => ({ run, staleness })),
			).toMatchObject([
				{
					run: fixture.stoppedRun,
					staleness: {
						stale: true,
						distance: { kind: "measured", versions: 1 },
					},
				},
			]);
		});

		it("answers the healthy rows when one run's manifest does not parse", async () => {
			const fixture = await writtenFixture();
			const corpus = await corpusDirectory();
			const brokenRun = "2026-09-12T00-00-00.000Z";
			await fixture.writePipelineRun(brokenRun, "audit-log");
			await Bun.write(
				benchmarkRunPaths(fixture.runsDirectory, brokenRun).manifestFile,
				"{ not json",
			);
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

		it("gives a run whose checkpoint does not parse the parse error as its unavailable reason", async () => {
			const fixture = await writtenFixture();
			const corpus = await corpusDirectory();
			await fixture.recordCorpusFrom(directorySource(corpus));
			await Bun.write(
				checkpointRecordFile(
					benchmarkRunPaths(
						fixture.runsDirectory,
						fixture.replayableRun,
					).checkpointDirectory("build"),
				),
				"{ not json",
			);
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});

			const response = await app.request("/api/runs");
			const body = await runHistoryResponseFrom(response);

			const staleness = body.rows.find(
				({ run }) => run === fixture.replayableRun,
			)?.staleness;
			expect(staleness?.state).toBe("unavailable");
			expect(
				staleness?.state === "unavailable" && staleness.reasons.join("\n"),
			).toContain("JSON Parse error");
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
				body.rows.find(({ run }) => run === fixture.replayableRun)?.staleness,
			).toMatchObject({ state: "available", stale: false });
			const broken = body.rows.find(({ run }) => run === brokenRun);
			expect(broken?.staleness).toMatchObject({
				state: "available",
				stale: true,
			});
			expect(JSON.stringify(broken?.staleness)).toContain(
				`cases/${caseId}/settings.json`,
			);
			assertDoesNotLeak(JSON.stringify(body), CONTROL_DIR);
		});

		it("names each record by the same short id after a restart and a later claim, with a replay's checkpoint and attempt", async () => {
			const fixture = await writtenFixture();
			const corpus = await corpusDirectory();
			const claimAndWrite = async (run: string): Promise<void> => {
				await claimShortId(fixture.runsDirectory, "audit-log", {
					kind: "run",
					run,
				});
				await fixture.writePipelineRun(run, "audit-log");
			};
			const shortIds = async (): Promise<readonly unknown[]> => {
				const app = createApiApp({
					runsDirectory: fixture.runsDirectory,
					liveness: nothingRunning,
					corpusSource: directorySource(corpus),
				});
				const response = await app.request("/api/runs");
				const body = runHistoryResponseSchema.parse(await response.json());

				return body.rows.filter((row) => "shortId" in row);
			};
			await fixture.claim("audit-log", fixture.auditLogClaims);
			await claimAndWrite("2026-09-11T00-00-00.000Z");

			const before = await shortIds();
			await claimAndWrite("2026-09-12T00-00-00.000Z");
			const after = await shortIds();

			expect(after).toHaveLength(before.length + 1);
			for (const row of before) {
				expect(after).toContainEqual(row);
			}
			expect(before).toContainEqual(
				expect.objectContaining({
					kind: "replay",
					shortId: "audit-log/r3",
					checkpointShortId: "audit-log/r2/s1",
					attempt: { position: 2, count: 2 },
				}),
			);
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

				expect(staleCausesOf(body)).toContain(
					"Corpus file CLAUDE.md resolves outside the corpus source, which would hash bytes the corpus does not hold",
				);
				expect(
					body.rows.some(
						({ staleness }) =>
							staleness.state === "available" && staleness.stale,
					),
				).toBe(true);
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

				expect(staleCausesOf(body)).toContain(
					"Corpus file CLAUDE.md is a link that never resolves to a file, so it names no bytes",
				);
			});

			it("names the absent instruction file as the cause, a corpus state the corpus report calls valid", async () => {
				const corpus = await corpusDirectory();
				await rm(join(corpus, "CLAUDE.md"));

				const body = await historyFor(directorySource(corpus));

				expect(staleCausesOf(body)).toContain(
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
			expect(firstRow?.staleness).toMatchObject({ stale: false });
			expect(secondRow?.staleness).toMatchObject({ stale: true });
		});

		/**
		 * Siblings share a case, a group or a lineage, so a link that dropped
		 * or derived one identity field would open a neighbor's history and
		 * still answer 200. Each expected attempt comes from what the fixture
		 * wrote, never from the link, so the check cannot agree with itself.
		 */
		it("links every record to a history route that opens that record, never a sibling", async () => {
			const fixture = await writtenFixture();
			const corpus = await corpusDirectory();
			const { caseId, uuid } = fixture.sessionAttempt;
			const secondUuid = "0f6b6f2a-0000-4000-8000-000000000002";
			await fixture.writeAttemptAt(secondUuid, corpus, caseId, []);
			const [firstRep, secondRep] = await fixture.writeSessionGroup(
				"group-s",
				2,
			);
			await fixture.writeStoppedRun();
			const { lineage, timestamp } = fixture.stageAttempt;
			const secondReplay = "2026-09-03T02-00-00.000Z";
			await fixture.writeReplayOf(fixture.stoppedRun, secondReplay);
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});
			const expected = new Map<string, object>([
				[`/attempts/session/${caseId}/${uuid}`, { kind: "session", id: uuid }],
				[
					`/attempts/session/${caseId}/${secondUuid}`,
					{ kind: "session", id: secondUuid },
				],
				[
					`/groups/group-s/reps/${firstRep}/attempt`,
					{ kind: "session", id: firstRep },
				],
				[
					`/groups/group-s/reps/${secondRep}/attempt`,
					{ kind: "session", id: secondRep },
				],
				[
					`/replays/${lineage}/${timestamp}`,
					{ kind: "stage", run: fixture.replayableRun },
				],
				[
					`/replays/${lineage}/${secondReplay}`,
					{ kind: "stage", run: fixture.stoppedRun },
				],
				[
					`/runs/${fixture.replayableRun}/stages/discuss`,
					{ kind: "stage", run: fixture.replayableRun, stage: "discuss" },
				],
				[
					`/runs/${fixture.replayableRun}/stages/build`,
					{ kind: "stage", run: fixture.replayableRun, stage: "build" },
				],
				[
					`/runs/${fixture.stoppedRun}/stages/build`,
					{ kind: "stopped-stage", run: fixture.stoppedRun, stage: "build" },
				],
			]);

			const listing = await app.request("/api/runs");
			const listed = z
				.object({
					rows: z.array(
						z
							.object({
								links: z
									.array(
										z.union([
											z
												.object({
													state: z.literal("available"),
													href: z.string(),
												})
												.loose(),
											z.object({ state: z.literal("unavailable") }).loose(),
										]),
									)
									.default([]),
							})
							.loose(),
					),
				})
				.parse(await listing.json());
			const hrefs = listed.rows.flatMap((row) =>
				row.links.flatMap((link) =>
					link.state === "available" ? [link.href] : [],
				),
			);

			expect(hrefs.toSorted()).toEqual([...expected.keys()].toSorted());
			for (const [href, attempt] of expected) {
				const response = await app.request(`/api${href}/history`);
				const body = z
					.object({ attempt: z.object({}).loose() })
					.loose()
					.parse(await response.json());
				expect({ href, status: response.status }).toEqual({
					href,
					status: 200,
				});
				expect(body.attempt).toMatchObject(attempt);
			}
		});
	});

	describe("GET /api/runs/:run", () => {
		it("says of each stage's read-manifest corpus entry whether that file changed since", async () => {
			const fixture = await writtenFixture();
			const corpus = await corpusDirectory();
			await fixture.recordCorpusFrom(directorySource(corpus));
			const skillEntry = (stage: string, content: string) =>
				({
					path: `skills/${stage}/SKILL.md`,
					half: "corpus",
					role: "stage skill",
					evidence: "declared",
					sha256: sha256Hex(content),
				}) as const;
			await fixture.recordReadManifest("discuss", [
				skillEntry("discuss", "discuss skill\n"),
			]);
			await fixture.recordReadManifest("build", [
				skillEntry("build", "build skill\n"),
			]);
			await Bun.write(
				join(corpus, "skills", "build", "SKILL.md"),
				"build skill, edited\n",
			);
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});

			const response = await app.request(
				`/api/runs/${encodeURIComponent(fixture.replayableRun)}`,
			);

			expect(await response.json()).toMatchObject({
				stages: [
					{
						stage: "discuss",
						readManifest: {
							state: "available",
							entries: [
								{
									...skillEntry("discuss", "discuss skill\n"),
									state: "unchanged",
								},
							],
						},
					},
					{
						stage: "build",
						readManifest: {
							state: "available",
							entries: [
								{ ...skillEntry("build", "build skill\n"), state: "changed" },
							],
						},
					},
				],
			});
		});

		it("says of a stopped stage's read-manifest corpus entry whether that file changed since", async () => {
			const fixture = await writtenFixture();
			await fixture.writeStoppedRunEvidence();
			const corpus = await corpusDirectory();
			const instructions = {
				path: "CLAUDE.md",
				half: "corpus",
				role: "global instructions",
				evidence: "declared",
				sha256: sha256Hex("the instructions\n"),
			} as const;
			const skill = {
				path: "skills/build/SKILL.md",
				half: "corpus",
				role: "stage skill",
				evidence: "declared",
				sha256: sha256Hex("build skill\n"),
			} as const;
			await fixture.recordStageReadManifest(
				"build",
				[instructions, skill],
				[instructions, skill].map(({ path, sha256 }) => ({ path, sha256 })),
			);
			await Bun.write(
				join(corpus, "skills", "build", "SKILL.md"),
				"build skill, edited\n",
			);
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});

			const response = await app.request(
				`/api/runs/${encodeURIComponent(fixture.stoppedRun)}`,
			);

			expect(await response.json()).toMatchObject({
				stages: [
					{ stage: "discuss" },
					{
						stage: "build",
						readManifest: {
							state: "available",
							entries: [
								{ ...instructions, state: "unchanged" },
								{ ...skill, state: "changed" },
							],
						},
					},
				],
			});
		});

		it("serves the run with its read manifests unjudged when the corpus under test cannot judge them", async () => {
			const fixture = await writtenFixture();
			const corpus = await corpusDirectory();
			await fixture.recordCorpusFrom(directorySource(corpus));
			const entry = {
				path: "skills/build/SKILL.md",
				half: "corpus",
				role: "stage skill",
				evidence: "declared",
				sha256: sha256Hex("build skill\n"),
			} as const;
			await fixture.recordReadManifest("build", [entry]);
			await rm(join(corpus, "skills", "build"), { recursive: true });
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});

			const response = await app.request(
				`/api/runs/${encodeURIComponent(fixture.replayableRun)}`,
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual(
				expect.objectContaining({
					stages: [
						expect.objectContaining({ stage: "discuss" }),
						expect.objectContaining({
							stage: "build",
							readManifest: { state: "available", entries: [entry] },
						}),
					],
				}),
			);
		});

		it("serves a stopped stage's read manifest unjudged when the corpus under test cannot judge it", async () => {
			const fixture = await writtenFixture();
			await fixture.writeStoppedRunEvidence();
			const corpus = await corpusDirectory();
			const skill = {
				path: "skills/build/SKILL.md",
				half: "corpus",
				role: "stage skill",
				evidence: "declared",
				sha256: sha256Hex("build skill\n"),
			} as const;
			await fixture.recordStageReadManifest(
				"build",
				[skill],
				[{ path: skill.path, sha256: skill.sha256 }],
			);
			await rm(join(corpus, "skills", "build"), { recursive: true });
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});

			const response = await app.request(
				`/api/runs/${encodeURIComponent(fixture.stoppedRun)}`,
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual(
				expect.objectContaining({
					stages: [
						expect.objectContaining({ stage: "discuss" }),
						expect.objectContaining({
							stage: "build",
							readManifest: { state: "available", entries: [skill] },
						}),
					],
				}),
			);
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

	describe("GET /api/corpus/versions", () => {
		async function measuredTwice(): Promise<{
			readonly app: ReturnType<typeof createApiApp>;
			readonly older: string;
		}> {
			const corpus = await corpusDirectory();
			const runsDirectory = await emptyDirectory("rehearse-api-runs-");
			const source = directorySource(corpus);
			const older = await measureCorpusVersion(runsDirectory, source);
			await Bun.write(join(corpus, "CLAUDE.md"), "edited instructions 3\n");
			await measureCorpusVersion(runsDirectory, source);
			if (older.kind !== "version") {
				throw new Error("the fixture corpus should measure to a version");
			}

			return {
				app: createApiApp({
					runsDirectory,
					liveness: nothingRunning,
					corpusSource: source,
				}),
				older: older.digest,
			};
		}

		it("lists the corpus under test's versions in log order, each named corpus@ and six characters", async () => {
			const { app, older } = await measuredTwice();

			const response = await app.request("/api/corpus/versions");
			const body = z
				.object({
					versions: z.array(
						z.object({
							position: z.number(),
							label: z.string(),
							digest: z.string(),
						}),
					),
				})
				.parse(await response.json());

			expect(response.status).toBe(200);
			expect(body.versions.map(({ position }) => position)).toEqual([1, 2]);
			expect(body.versions[0]).toEqual({
				position: 1,
				label: `corpus@${older.slice(0, 6)}`,
				digest: older,
			});
			expect(body.versions[1]?.digest).not.toBe(older);
		});

		it("opens the older version's file by a unique prefix after the source file changed", async () => {
			const { app, older } = await measuredTwice();

			const response = await app.request(
				`/api/corpus/versions/corpus@${older.slice(0, 12)}/file?path=CLAUDE.md`,
			);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe("the instructions\n");
		});

		it("refuses an ambiguous prefix and names its candidates", async () => {
			const { app } = await measuredTwice();

			// Both versions of this fixed tree start with "4".
			const response = await app.request("/api/corpus/versions/corpus@4");

			expect(response.status).toBe(409);
			expect(await response.json()).toEqual({
				error: "The corpus version prefix is ambiguous",
				candidates: [
					"4821f98acb79d83b1eddd201252732a1b8ddc996ca6eee8aedcf348cb988a326",
					"49a9e463aae61c91d06da870b9c0d74822ac5ca1696bc8148806467c0356774a",
				],
			});
		});

		it("opens a version by a unique prefix as its digest, label and files", async () => {
			const { app, older } = await measuredTwice();

			const response = await app.request(
				`/api/corpus/versions/${older.slice(0, 6)}`,
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				digest: older,
				label: `corpus@${older.slice(0, 6)}`,
				files: [
					{ path: "CLAUDE.md", sha256: sha256Hex("the instructions\n") },
					{ path: "skills/build/SKILL.md", sha256: sha256Hex("build skill\n") },
					{
						path: "skills/discuss/SKILL.md",
						sha256: sha256Hex("discuss skill\n"),
					},
				],
			});
		});

		it("serves a version's file as the bytes it held, text or not", async () => {
			const corpus = await corpusDirectory();
			const runsDirectory = await emptyDirectory("rehearse-api-runs-");
			const source = directorySource(corpus);
			const bytes = Uint8Array.of(255, 254, 0, 1);
			await Bun.write(join(corpus, "skills", "build", "table.bin"), bytes);
			const measured = await measureCorpusVersion(runsDirectory, source);
			if (measured.kind !== "version") {
				throw new Error("the fixture corpus should measure to a version");
			}
			const app = createApiApp({
				runsDirectory,
				liveness: nothingRunning,
				corpusSource: source,
			});

			const response = await app.request(
				`/api/corpus/versions/${measured.digest}/file?path=skills/build/table.bin`,
			);

			expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
		});

		it("answers a file request that names no path as a bad request", async () => {
			const { app, older } = await measuredTwice();

			const response = await app.request(`/api/corpus/versions/${older}/file`);

			expect(response.status).toBe(400);
		});

		it("refuses a version no record holds and a file the version does not hold", async () => {
			const { app, older } = await measuredTwice();

			const missing = await app.request(
				`/api/corpus/versions/${"f".repeat(64)}`,
			);
			const absentFile = await app.request(
				`/api/corpus/versions/${older}/file?path=agents/none.md`,
			);

			expect(missing.status).toBe(404);
			expect(absentFile.status).toBe(404);
		});
	});

	describe("GET /api/groups/:groupId/reads", () => {
		it("serves each rep stage's reads with whether each file changed since", async () => {
			const corpus = await corpusDirectory();
			const fixture = await writtenFixture();
			await fixture.recordGroupFrom(directorySource(corpus));
			const repId = `${fixture.groupId}-rep-1`;
			const read = {
				path: "skills/build/SKILL.md",
				half: "corpus",
				role: "stage skill",
				evidence: "declared",
				sha256: sha256Hex("build skill\n"),
			} as const;
			await fixture.recordGroupRepReadManifest(repId, "build", [read]);
			await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "edited\n");
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});

			const response = await app.request(
				`/api/groups/${fixture.groupId}/reads`,
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				reps: [
					{
						repId,
						stage: "build",
						readManifest: [{ ...read, state: "changed" }],
					},
				],
				reasons: [],
			});
		});

		it("serves the reps' reads unjudged and names why they could not be judged", async () => {
			const fixture = await writtenFixture();
			const repId = `${fixture.groupId}-rep-1`;
			const read = {
				path: "skills/build/SKILL.md",
				half: "corpus",
				role: "stage skill",
				evidence: "declared",
				sha256: "a".repeat(64),
			} as const;
			await fixture.recordGroupRepReadManifest(repId, "build", [read]);
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(await corpusDirectory()),
			});

			const response = await app.request(
				`/api/groups/${fixture.groupId}/reads`,
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				reps: [{ repId, stage: "build", readManifest: [read] }],
				reasons: [
					"Reads not judged: the group froze no pipeline to hash its stages against",
				],
			});
		});

		it("names a missing frozen pipeline by its path in the group, not an absolute one", async () => {
			const corpus = await corpusDirectory();
			const fixture = await writtenFixture();
			await fixture.recordGroupFrom(directorySource(corpus));
			const { inputsDirectory } = confirmationGroupPaths(
				fixture.runsDirectory,
				fixture.groupId,
			);
			await rm(join(inputsDirectory, "pipeline.json"));
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(corpus),
			});

			const response = await app.request(
				`/api/groups/${fixture.groupId}/reads`,
			);
			const body = await response.text();

			expect(JSON.parse(body)).toEqual({
				reps: [],
				reasons: [
					"Reads not judged: the group's frozen pipeline inputs/pipeline.json is missing",
				],
			});
			assertDoesNotLeak(body, fixture.runsDirectory);
		});

		it("refuses a group that was never recorded, naming no absolute path", async () => {
			const fixture = await writtenFixture();
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(await corpusDirectory()),
			});

			const response = await app.request("/api/groups/no-such-group/reads");

			expect(response.status).toBe(404);
			assertDoesNotLeak(await response.text(), fixture.runsDirectory);
		});

		it("refuses a group id that escapes the runs directory, without a 500", async () => {
			const fixture = await writtenFixture();
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(await corpusDirectory()),
			});

			const response = await app.request("/api/groups/..%2F..%2Fetc/reads");

			expect(response.status).toBe(400);
		});
	});

	describe("GET /api/records/:id", () => {
		it("serves a confirmation rep's stage file with the reads it recorded", async () => {
			const fixture = await writtenFixture();
			const repId = `${fixture.groupId}-rep-1`;
			await fixture.recordGroupRepReadManifest(repId, "build", [
				{
					path: "skills/build/SKILL.md",
					half: "corpus",
					role: "stage skill",
					evidence: "declared",
					sha256: "b".repeat(64),
				},
			]);
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				corpusSource: directorySource(await corpusDirectory()),
			});

			const response = await app.request(
				`/api/records/${encodeURIComponent(`rep:stage:${fixture.groupId}/${repId}/build`)}`,
			);
			const json: unknown = await response.json();

			expect(response.status).toBe(200);
			const body = z
				.object({
					readManifest: z.array(z.object({ path: z.string() }).loose()),
				})
				.loose()
				.parse(json);
			expect(body.readManifest.map((entry) => entry.path)).toEqual([
				"skills/build/SKILL.md",
			]);
		});

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

			expect(response.status).toBe(400);
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

			expect(response.status).toBe(404);
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

			expect(response.status).toBe(404);
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
