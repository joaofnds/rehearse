import { afterEach, describe, expect, it } from "bun:test";
import {
	chmod,
	cp,
	lstat,
	mkdir,
	mkdtemp,
	readdir,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { LiveCorpusRoot } from "#benchmark/corpus-file";
import {
	linkCorpus,
	linkedCorpusSource,
	unlinkCorpus,
} from "#benchmark/corpus-source";
import { corpusVersionLog } from "#benchmark/corpus-version";
import { writeLaunchRecord } from "#benchmark/launch-record";
import { storeSpendCeiling } from "#benchmark/settings";
import {
	directorySource,
	liveStageSettings,
	NO_PROVIDER_PROJECTS,
	nothingRunning,
	RecordedRunsFixture,
} from "#benchmark/run-records-test-support";
import type { RunLiveness } from "#benchmark/run-liveness";
import { createAppServer } from "./app";
import { CORPUS_VERSION_HEADER } from "./corpus-version-header";
import {
	directoryLiveCorpus,
	FAKE_LAUNCH_PID,
	FAKE_LAUNCH_STARTED_AT,
	FakeLauncher,
} from "./launch-test-support";

const reviewSchema = z.object({
	startsFrom: z.string(),
	invalidated: z.number(),
	applyRefusal: z.string().nullable(),
});

const appliedSchema = z.object({
	previous: z.string(),
	version: z.string(),
	invalidated: z.number(),
	rerun: z.discriminatedUnion("kind", [
		z.object({
			kind: z.literal("offered"),
			run: z.string(),
			stage: z.string(),
		}),
		z.object({ kind: z.literal("none"), reason: z.string() }),
	]),
	needsComparisonManifest: z.boolean(),
});

const corpusSchema = z.object({
	digest: z.string().nullable(),
	lastEdit: z.unknown(),
});

interface EditRequest {
	readonly path: string;
	readonly text: string;
}

/** An edit, carrying the version it was opened or reviewed against. */
interface ReviewedRequest extends EditRequest {
	readonly startsFrom: string;
}

interface ReplayRequest {
	readonly kind: "replay";
	readonly run: string;
	readonly stage: string;
	readonly attempts: number;
}

/** A read, or a same-origin JSON write when it carries a body. */
type Send = (path: string, body?: string) => Promise<Response>;

/** A version digest no linked directory holds. */
const NO_VERSION = "0".repeat(64);

const PORT = 4174;

/** The corpus screen's view of the server: its reads and its edit writes. */
class CorpusEditDriver {
	public constructor(private readonly send: Send) {}

	/** The version the corpus held when the screen opened the file. */
	public async opened(path: string): Promise<string> {
		const response = await this.send(
			`/api/corpus/file?path=${encodeURIComponent(path)}`,
		);
		expect(response.status).toBe(200);

		return z.string().parse(response.headers.get(CORPUS_VERSION_HEADER));
	}

	public reviewRaw(edit: ReviewedRequest): Promise<Response> {
		return this.send("/api/corpus/edits/review", JSON.stringify(edit));
	}

	/** Opens the file, as the screen does, and reviews the edit against it. */
	public async review(
		edit: EditRequest,
	): Promise<z.infer<typeof reviewSchema>> {
		const response = await this.reviewRaw({
			...edit,
			startsFrom: await this.opened(edit.path),
		});
		expect(response.status).toBe(200);

		return reviewSchema.parse(await response.json());
	}

	public applyRaw(edit: ReviewedRequest): Promise<Response> {
		return this.send("/api/corpus/edits/apply", JSON.stringify(edit));
	}

	public async apply(
		edit: ReviewedRequest,
	): Promise<z.infer<typeof appliedSchema>> {
		const response = await this.applyRaw(edit);
		expect(response.status).toBe(200);

		return appliedSchema.parse(await response.json());
	}

	public version(digest: string): Promise<Response> {
		return this.send(`/api/corpus/versions/${digest}`);
	}

	public launch(request: ReplayRequest): Promise<Response> {
		return this.send("/api/launches", JSON.stringify(request));
	}

	public async corpus(): Promise<z.infer<typeof corpusSchema>> {
		const response = await this.send("/api/corpus");
		expect(response.status).toBe(200);

		return corpusSchema.parse(await response.json());
	}
}

describe("/api/corpus/edits", () => {
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

	async function corpusDirectory(): Promise<string> {
		const root = await temporaryDirectory("rehearse-corpus-edit-");
		await mkdir(join(root, "skills", "build"), { recursive: true });
		await mkdir(join(root, "skills", "discuss"), { recursive: true });
		await writeFile(join(root, "CLAUDE.md"), "instructions\n");
		await writeFile(join(root, "skills", "build", "SKILL.md"), "build skill\n");
		await writeFile(
			join(root, "skills", "discuss", "SKILL.md"),
			"discuss skill\n",
		);

		return root;
	}

	/** The directories the live install's roots link to. */
	interface Installed {
		readonly root: string;
		readonly backingRoot: string;
	}

	/**
	 * A live install whose roots are links into a directory of its own, as
	 * the live instructions are on an operator's machine, so only a guard
	 * that resolves the live roots sees a write that reaches them.
	 */
	async function liveInstall(
		directory: string,
	): Promise<readonly [LiveCorpusRoot, Installed]> {
		const live = directoryLiveCorpus(directory);
		const installed = {
			root: join(directory, "installed", ".claude"),
			backingRoot: join(directory, "installed", ".agents"),
		};
		await mkdir(dirname(live.root), { recursive: true });
		for (const [root, target] of [
			[live.root, installed.root],
			[live.backingRoot, installed.backingRoot],
		] as const) {
			await mkdir(target, { recursive: true });
			await writeFile(join(target, "CLAUDE.md"), "live instructions\n");
			await symlink(target, root);
		}

		return [live, installed];
	}

	interface Served {
		readonly driver: CorpusEditDriver;
		readonly corpus: string;
		readonly runsDirectory: string;
		readonly fixture: RecordedRunsFixture;
		readonly launcher: FakeLauncher;
		/** Holds the live install and the directories its roots link to. */
		readonly liveDirectory: string;
		readonly installed: Installed;
	}

	/**
	 * The served app over a linked directory, a run whose stages read it at a
	 * logged version, and a live install of its own, so no test reaches the
	 * real one.
	 */
	async function serving(
		liveness: RunLiveness = nothingRunning,
	): Promise<Served> {
		const runsDirectory = await temporaryDirectory(
			"rehearse-corpus-edit-runs-",
		);
		const corpus = await corpusDirectory();
		const liveDirectory = await temporaryDirectory(
			"rehearse-corpus-edit-live-",
		);
		const [live, installed] = await liveInstall(liveDirectory);
		const fixture = new RecordedRunsFixture(runsDirectory, {
			settingsFile: await liveStageSettings(),
		});
		await fixture.write();
		await fixture.recordCorpusFrom(directorySource(corpus));
		await fixture.recordVersionFrom(directorySource(corpus));
		await fixture.writeInitialCheckpoint();
		await linkCorpus(runsDirectory, corpus);
		const launcher = new FakeLauncher();
		const app = createAppServer({
			runsDirectory,
			projectsDirectory: NO_PROVIDER_PROJECTS,
			readCorpusSource: () => linkedCorpusSource(runsDirectory, () => live),
			liveness,
			casesRoot: await temporaryDirectory("rehearse-corpus-edit-cases-"),
			launcher,
			liveCorpus: () => live,
			clientDistDirectory: await temporaryDirectory(
				"rehearse-corpus-edit-dist-",
			),
			port: PORT,
		});
		const host = `127.0.0.1:${String(PORT)}`;

		return {
			driver: new CorpusEditDriver((path, body) =>
				Promise.resolve(
					body === undefined
						? app.request(path, { headers: { host } })
						: app.request(path, {
								method: "POST",
								headers: {
									host,
									origin: `http://${host}`,
									"content-type": "application/json",
									"sec-fetch-site": "same-origin",
								},
								body,
							}),
				),
			),
			corpus,
			runsDirectory,
			fixture,
			launcher,
			liveDirectory,
			installed,
		};
	}

	/** Every file under a directory and its text, so a test sees any write. */
	async function treeOf(
		directory: string,
	): Promise<ReadonlyMap<string, string>> {
		const tree = new Map<string, string>();
		for (const path of await readdir(directory, { recursive: true })) {
			const entry = await stat(join(directory, path));
			if (entry.isFile()) {
				tree.set(path, await Bun.file(join(directory, path)).text());
			}
		}

		return tree;
	}

	async function editedFromDisk(served: Paths): Promise<void> {
		await writeFile(
			join(served.corpus, "skills", "discuss", "SKILL.md"),
			"discuss, edited elsewhere\n",
		);
	}

	type Paths = Readonly<Pick<Served, "corpus" | "runsDirectory">>;

	it("applies the reviewed edit as a new version whose last edit names the version it started from and the count it reported", async () => {
		const { driver } = await serving();
		const edit = { path: "CLAUDE.md", text: "instructions, edited\n" };
		const review = await driver.review(edit);

		const applied = await driver.apply({
			...edit,
			startsFrom: review.startsFrom,
		});

		const corpus = await driver.corpus();
		expect(review.invalidated).toBe(1);
		expect(applied.previous).toBe(review.startsFrom);
		expect(corpus.digest).toBe(applied.version);
		expect(corpus.digest).not.toBe(review.startsFrom);
		expect(corpus.lastEdit).toMatchObject({
			kind: "measured",
			previous: review.startsFrom,
			count: review.invalidated,
		});
	});

	it("counts no stale row for an edit to a file no judged stage read", async () => {
		const { driver, corpus } = await serving();
		await mkdir(join(corpus, "skills", "unused"));
		await writeFile(join(corpus, "skills", "unused", "SKILL.md"), "unused\n");

		const review = await driver.review({
			path: "skills/unused/SKILL.md",
			text: "unused, edited\n",
		});

		expect(review.invalidated).toBe(0);
	});

	it("reports no apply refusal for a linked directory outside the live install", async () => {
		const { driver } = await serving();

		const review = await driver.review({
			path: "CLAUDE.md",
			text: "instructions, edited\n",
		});

		expect(review.applyRefusal).toBeNull();
	});

	it("writes the edited bytes over the file with its mode", async () => {
		const { driver, corpus } = await serving();
		const file = join(corpus, "skills", "build", "SKILL.md");
		await chmod(file, 0o751);
		const edit = { path: "skills/build/SKILL.md", text: "build, edited\n" };
		const review = await driver.review(edit);

		await driver.apply({ ...edit, startsFrom: review.startsFrom });

		const { mode } = await stat(file);
		expect(await Bun.file(file).text()).toBe("build, edited\n");
		expect(mode.toString(8).slice(-3)).toBe("751");
	});

	it("keeps a starting version no measurement logged, naming it in the last edit", async () => {
		const served = await serving();
		await editedFromDisk(served);
		const edit = { path: "CLAUDE.md", text: "instructions, edited\n" };
		const review = await served.driver.review(edit);

		await served.driver.apply({ ...edit, startsFrom: review.startsFrom });

		const startingVersion = await served.driver.version(review.startsFrom);
		const corpus = await served.driver.corpus();
		expect(startingVersion.status).toBe(200);
		expect(corpus.lastEdit).toMatchObject({ previous: review.startsFrom });
	});

	it("removes no record", async () => {
		const { driver, runsDirectory } = await serving();
		const recordsBefore = await treeOf(runsDirectory);
		const edit = { path: "CLAUDE.md", text: "instructions, edited\n" };
		const review = await driver.review(edit);

		await driver.apply({ ...edit, startsFrom: review.startsFrom });

		const recordsAfter = await treeOf(runsDirectory);
		expect(
			[...recordsBefore.keys()].filter((path) => !recordsAfter.has(path)),
		).toEqual([]);
	});

	it("leaves no file in the linked directory beside the ones it held", async () => {
		const { driver, corpus } = await serving();
		const edit = { path: "CLAUDE.md", text: "instructions, edited\n" };
		const review = await driver.review(edit);

		await driver.apply({ ...edit, startsFrom: review.startsFrom });

		const tree = await treeOf(corpus);
		expect([...tree.keys()].toSorted()).toEqual([
			"CLAUDE.md",
			join("skills", "build", "SKILL.md"),
			join("skills", "discuss", "SKILL.md"),
		]);
	});

	it("replaces a file that is a link where it lives, leaving the link in place", async () => {
		const { driver, corpus } = await serving();
		await mkdir(join(corpus, "skills", "shared"));
		await writeFile(join(corpus, "skills", "shared", "SKILL.md"), "shared\n");
		const linked = join(corpus, "skills", "discuss", "SKILL.md");
		await rm(linked);
		await symlink(join("..", "shared", "SKILL.md"), linked);
		const edit = { path: "skills/discuss/SKILL.md", text: "shared, edited\n" };
		const review = await driver.review(edit);

		await driver.apply({ ...edit, startsFrom: review.startsFrom });

		const link = await lstat(linked);
		expect(link.isSymbolicLink()).toBe(true);
		expect(
			await Bun.file(join(corpus, "skills", "shared", "SKILL.md")).text(),
		).toBe("shared, edited\n");
	});

	describe("the paired rerun it offers", () => {
		async function applied(
			served: Pick<Served, "driver">,
			edit: EditRequest,
		): Promise<z.infer<typeof appliedSchema>> {
			const review = await served.driver.review(edit);

			return served.driver.apply({ ...edit, startsFrom: review.startsFrom });
		}

		it("replays the first stage, in pipeline order, of the invalidated run that read the edited file", async () => {
			const served = await serving();

			const { rerun } = await applied(served, {
				path: "CLAUDE.md",
				text: "instructions, edited\n",
			});

			expect(rerun).toEqual({
				kind: "offered",
				run: served.fixture.replayableRun,
				stage: "discuss",
			});
		});

		it("replays the stage whose skill was edited", async () => {
			const served = await serving();

			const { rerun } = await applied(served, {
				path: "skills/build/SKILL.md",
				text: "build skill, edited\n",
			});

			expect(rerun).toEqual({
				kind: "offered",
				run: served.fixture.replayableRun,
				stage: "build",
			});
		});

		it("replays the stage of the newest invalidated result, a stage replay recorded after its run", async () => {
			const served = await serving();
			await served.fixture.recordReplayFrom(directorySource(served.corpus));

			const { rerun } = await applied(served, {
				path: "CLAUDE.md",
				text: "instructions, edited\n",
			});

			expect(rerun).toEqual({
				kind: "offered",
				run: served.fixture.replayableRun,
				stage: "build",
			});
		});

		it("replays the stage a newer run stopped at, read from its stop record", async () => {
			const served = await serving();
			await served.fixture.recordReplayFrom(directorySource(served.corpus));
			await served.fixture.writeStoppedRun();
			await served.fixture.recordStoppedStageFrom(
				directorySource(served.corpus),
			);
			await cp(
				join(
					served.runsDirectory,
					`${served.fixture.stoppedRun}.checkpoints`,
					"initial",
				),
				join(
					served.runsDirectory,
					`${served.fixture.stoppedRun}.checkpoints`,
					"discuss",
				),
				{ recursive: true },
			);

			const { rerun } = await applied(served, {
				path: "CLAUDE.md",
				text: "instructions, edited\n",
			});

			expect(rerun).toEqual({
				kind: "offered",
				run: served.fixture.stoppedRun,
				stage: "build",
			});
		});

		it("starts nothing, leaving the replay to the person who applied", async () => {
			const served = await serving();

			await applied(served, {
				path: "CLAUDE.md",
				text: "instructions, edited\n",
			});

			expect(served.launcher.launches).toEqual([]);
		});

		it.each([
			["CLAUDE.md", true],
			["skills/build/SKILL.md", false],
		] as const)(
			"says whether a browser comparison of an edit to %s needs a comparison manifest",
			async (path, needed) => {
				const served = await serving();

				const { needsComparisonManifest } = await applied(served, {
					path,
					text: "edited\n",
				});

				expect(needsComparisonManifest).toBe(needed);
			},
		);

		describe("when the edit marks no recorded result stale", () => {
			it("offers none and says why", async () => {
				const served = await serving();
				await mkdir(join(served.corpus, "skills", "unused"));
				await writeFile(
					join(served.corpus, "skills", "unused", "SKILL.md"),
					"unused\n",
				);

				const { rerun } = await applied(served, {
					path: "skills/unused/SKILL.md",
					text: "unused, edited\n",
				});

				expect(rerun).toEqual({
					kind: "none",
					reason:
						"The edit marked no recorded result stale, so no replay can show what it changed",
				});
			});
		});

		describe("when the checkpoint the stage would replay from is gone", () => {
			it("offers none", async () => {
				const served = await serving();
				await rm(
					join(
						served.runsDirectory,
						`${served.fixture.replayableRun}.checkpoints`,
						"initial",
					),
					{ recursive: true },
				);

				const { invalidated, rerun } = await applied(served, {
					path: "CLAUDE.md",
					text: "instructions, edited\n",
				});

				expect(invalidated).toBe(1);
				expect(rerun).toEqual({
					kind: "none",
					reason:
						"No result this edit marked stale holds a recorded checkpoint to replay a stage that read CLAUDE.md from",
				});
			});
		});
	});

	interface Untouched {
		readonly tree: ReadonlyMap<string, string>;
		readonly log: readonly string[];
	}

	async function untouched(served: Paths): Promise<Untouched> {
		return {
			tree: await treeOf(served.corpus),
			log: await corpusVersionLog(
				served.runsDirectory,
				directorySource(served.corpus),
			),
		};
	}

	async function expectUntouched(
		served: Paths,
		before: Untouched,
	): Promise<void> {
		expect(await untouched(served)).toEqual(before);
	}

	type LiveSetup = Readonly<
		Pick<Served, "runsDirectory" | "liveDirectory" | "installed">
	>;

	/** Links a directory reached through a link to the given target. */
	async function linkThrough(served: LiveSetup, target: string): Promise<void> {
		const link = join(
			await temporaryDirectory("rehearse-corpus-edit-link-"),
			"corpus",
		);
		await symlink(target, link);
		await linkCorpus(served.runsDirectory, link);
	}

	describe("when the edit would write under the live install", () => {
		it.each([
			[
				"with the live install linked",
				(served: LiveSetup): Promise<void> =>
					unlinkCorpus(served.runsDirectory),
			],
			[
				"with a link to the live install's directory linked",
				(served: LiveSetup): Promise<void> =>
					linkThrough(served, served.installed.root),
			],
			[
				"with a link to the live install's backing directory linked",
				(served: LiveSetup): Promise<void> =>
					linkThrough(served, served.installed.backingRoot),
			],
			[
				"with a linked directory holding the live install, whose listed file links into it",
				async (served: LiveSetup): Promise<void> => {
					await symlink(
						join("installed", ".claude", "CLAUDE.md"),
						join(served.liveDirectory, "CLAUDE.md"),
					);
					await linkCorpus(served.runsDirectory, served.liveDirectory);
				},
			],
		] as const)(
			"refuses the apply and says so in the review, %s",
			async (_situation, arrange) => {
				const served = await serving();
				await arrange(served);
				const before = await treeOf(served.installed.root);
				const edit = { path: "CLAUDE.md", text: "edited from the browser\n" };
				const review = await served.driver.review(edit);

				const response = await served.driver.applyRaw({
					...edit,
					startsFrom: review.startsFrom,
				});

				expect(review.applyRefusal).toContain("live install");
				expect(response.status).toBe(409);
				expect(await treeOf(served.installed.root)).toEqual(before);
			},
		);
	});

	describe("when the linked directory no longer holds the version the edit started from", () => {
		it("refuses the apply, writing nothing and logging no version", async () => {
			const served = await serving();
			const edit = { path: "CLAUDE.md", text: "instructions, edited\n" };
			const review = await served.driver.review(edit);
			await editedFromDisk(served);
			const before = await untouched(served);

			const response = await served.driver.applyRaw({
				...edit,
				startsFrom: review.startsFrom,
			});

			expect(response.status).toBe(409);
			expect(await response.text()).toContain(review.startsFrom);
			await expectUntouched(served, before);
		});
	});

	describe("when the path is not a file the corpus report lists", () => {
		it.each([
			["a file the report does not list", "notes.md"],
			["a path outside the corpus", "../escape.md"],
			["a layout directory", "skills"],
		])(
			"refuses the review and the apply of %s, writing nothing and logging no version",
			async (_situation, path) => {
				const served = await serving();
				await writeFile(join(served.corpus, "notes.md"), "notes\n");
				const edit = { path, text: "written from the browser\n" };
				const review = await served.driver.reviewRaw({
					...edit,
					startsFrom: NO_VERSION,
				});
				const before = await untouched(served);

				const response = await served.driver.applyRaw({
					...edit,
					startsFrom: NO_VERSION,
				});

				expect(review.status).toBe(404);
				expect(response.status).toBe(404);
				await expectUntouched(served, before);
			},
		);
	});

	describe("when a layout directory holds a link that leaves the linked directory", () => {
		async function servingEscape(): Promise<Served> {
			const served = await serving();
			await mkdir(join(served.corpus, "agents"));
			await symlink(
				join(served.installed.root, "CLAUDE.md"),
				join(served.corpus, "agents", "escape.md"),
			);

			return served;
		}

		it("refuses the review", async () => {
			const { driver } = await servingEscape();

			const response = await driver.reviewRaw({
				path: "CLAUDE.md",
				text: "instructions, edited\n",
				startsFrom: NO_VERSION,
			});

			expect(response.status).toBe(409);
		});

		it("refuses the apply, writing nothing and logging no version", async () => {
			const served = await servingEscape();
			const before = await untouched(served);

			const response = await served.driver.applyRaw({
				path: "CLAUDE.md",
				text: "instructions, edited\n",
				startsFrom: NO_VERSION,
			});

			expect(response.status).toBe(409);
			await expectUntouched(served, before);
		});
	});

	describe("when the linked directory is no longer a corpus", () => {
		async function servingEmptied(): Promise<Served> {
			const served = await serving();
			await rm(served.corpus, { recursive: true });

			return served;
		}

		it("refuses the review", async () => {
			const { driver } = await servingEmptied();

			const response = await driver.reviewRaw({
				path: "CLAUDE.md",
				text: "instructions, edited\n",
				startsFrom: NO_VERSION,
			});

			expect(response.status).toBe(409);
		});

		it("refuses the apply", async () => {
			const { driver } = await servingEmptied();

			const response = await driver.applyRaw({
				path: "CLAUDE.md",
				text: "instructions, edited\n",
				startsFrom: NO_VERSION,
			});

			expect(response.status).toBe(409);
		});
	});

	describe("when the linked directory changed after the file was opened", () => {
		it("refuses the review, since the edit would overwrite the change unseen", async () => {
			const served = await serving();
			const opened = await served.driver.opened("CLAUDE.md");
			await writeFile(
				join(served.corpus, "CLAUDE.md"),
				"changed in another editor\n",
			);

			const response = await served.driver.reviewRaw({
				path: "CLAUDE.md",
				text: "instructions, edited\n",
				startsFrom: opened,
			});

			expect(response.status).toBe(409);
			expect(await response.text()).toContain("Open the file again");
		});
	});

	describe("when the edit leaves the file's bytes unchanged", () => {
		it("refuses the apply, writing nothing and logging no version", async () => {
			const served = await serving();
			const edit = { path: "CLAUDE.md", text: "instructions\n" };
			const review = await served.driver.review(edit);
			const before = await untouched(served);

			const response = await served.driver.applyRaw({
				...edit,
				startsFrom: review.startsFrom,
			});

			expect(response.status).toBe(409);
			await expectUntouched(served, before);
		});
	});

	describe("when a launch this server started is live", () => {
		it("refuses the apply, writing nothing and logging no version", async () => {
			const served = await serving({
				readMarker: () => Promise.resolve(undefined),
				isAlive: (pid) => pid === FAKE_LAUNCH_PID,
			});
			const edit = { path: "CLAUDE.md", text: "instructions, edited\n" };
			const review = await served.driver.review(edit);
			await writeLaunchRecord(served.runsDirectory, {
				kind: "replay",
				run: served.fixture.replayableRun,
				stage: "build",
				attempts: 1,
				id: crypto.randomUUID(),
				pid: FAKE_LAUNCH_PID,
				startedAt: FAKE_LAUNCH_STARTED_AT,
				launchedAt: new Date().toISOString(),
			});
			const before = await untouched(served);

			const response = await served.driver.applyRaw({
				...edit,
				startsFrom: review.startsFrom,
			});

			expect(response.status).toBe(409);
			await expectUntouched(served, before);
		});
	});

	describe("when a launch this server is starting has not started yet", () => {
		it("refuses the apply, writing nothing and logging no version", async () => {
			const served = await serving();
			const edit = { path: "CLAUDE.md", text: "instructions, edited\n" };
			const review = await served.driver.review(edit);
			await storeSpendCeiling(served.runsDirectory, 5);
			const held = served.launcher.holdNextLaunch();
			const launching = served.driver.launch({
				kind: "replay",
				run: served.fixture.replayableRun,
				stage: "build",
				attempts: 1,
			});
			await held.reached;
			const before = await untouched(served);

			const response = await served.driver.applyRaw({
				...edit,
				startsFrom: review.startsFrom,
			});
			held.release();
			const launched = await launching;

			expect(response.status).toBe(409);
			expect(launched.status).toBe(202);
			await expectUntouched(served, before);
		});
	});
});
