import { afterEach, describe, expect, it } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readdir,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { LiveCorpusRoot } from "#benchmark/corpus-file";
import {
	linkCorpus,
	linkedCorpusSource,
	unlinkCorpus,
} from "#benchmark/corpus-source";
import {
	directorySource,
	liveStageSettings,
	NO_PROVIDER_PROJECTS,
	nothingRunning,
	RecordedRunsFixture,
} from "#benchmark/run-records-test-support";
import type { RunLiveness } from "#benchmark/run-liveness";
import { createApiApp } from "./api";
import { directoryLiveCorpus, FakeLauncher } from "./launch-test-support";
import { createLaunchApp } from "./launches";

const reviewSchema = z.object({
	startsFrom: z.string(),
	invalidated: z.number(),
	applyRefusal: z.string().nullable(),
});

const appliedSchema = z.object({
	previous: z.string(),
	version: z.string(),
	invalidated: z.number(),
});

const corpusSchema = z.object({
	digest: z.string().nullable(),
	lastEdit: z.unknown(),
});

interface EditRequest {
	readonly path: string;
	readonly text: string;
}

interface ApplyRequest extends EditRequest {
	readonly startsFrom: string;
}

type Read = (path: string) => Promise<Response>;

type Write = (path: string, body: string) => Promise<Response>;

/** The corpus screen's view of the server: its reads and its edit writes. */
class CorpusEditDriver {
	public constructor(
		private readonly read: Read,
		private readonly write: Write,
	) {}

	public reviewRaw(edit: EditRequest): Promise<Response> {
		return this.write("/api/corpus/edits/review", JSON.stringify(edit));
	}

	public async review(
		edit: EditRequest,
	): Promise<z.infer<typeof reviewSchema>> {
		const response = await this.reviewRaw(edit);
		expect(response.status).toBe(200);

		return reviewSchema.parse(await response.json());
	}

	public applyRaw(edit: ApplyRequest): Promise<Response> {
		return this.write("/api/corpus/edits/apply", JSON.stringify(edit));
	}

	public async apply(
		edit: ApplyRequest,
	): Promise<z.infer<typeof appliedSchema>> {
		const response = await this.applyRaw(edit);
		expect(response.status).toBe(200);

		return appliedSchema.parse(await response.json());
	}

	public async corpus(): Promise<z.infer<typeof corpusSchema>> {
		const response = await this.read("/api/corpus");
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

	interface Served {
		readonly driver: CorpusEditDriver;
		readonly corpus: string;
		readonly runsDirectory: string;
		readonly fixture: RecordedRunsFixture;
		/** Holds the live install and its backing tree, each a corpus. */
		readonly liveDirectory: string;
		readonly live: LiveCorpusRoot;
	}

	/**
	 * A linked directory, a run whose stages read it at a logged version, and
	 * a live install of its own, so no test reaches the real one.
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
		const live = directoryLiveCorpus(liveDirectory);
		for (const root of [live.root, live.backingRoot]) {
			await mkdir(root, { recursive: true });
			await writeFile(join(root, "CLAUDE.md"), "live instructions\n");
		}
		const fixture = new RecordedRunsFixture(runsDirectory, {
			settingsFile: await liveStageSettings(),
		});
		await fixture.write();
		await fixture.recordCorpusFrom(directorySource(corpus));
		await fixture.recordVersionFrom(directorySource(corpus));
		await linkCorpus(runsDirectory, corpus);
		const api = createApiApp({
			runsDirectory,
			projectsDirectory: NO_PROVIDER_PROJECTS,
			readCorpusSource: () => linkedCorpusSource(runsDirectory, () => live),
			liveness,
		});
		const launches = createLaunchApp({
			runsDirectory,
			casesRoot: await temporaryDirectory("rehearse-corpus-edit-cases-"),
			launcher: new FakeLauncher(),
			liveness,
			liveCorpus: () => live,
		});

		return {
			driver: new CorpusEditDriver(
				(path) => Promise.resolve(api.request(path)),
				(path, body) =>
					Promise.resolve(
						launches.request(path, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body,
						}),
					),
			),
			corpus,
			runsDirectory,
			fixture,
			liveDirectory,
			live,
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
			count: applied.invalidated,
		});
	});

	describe("when the edit would write under the live install", () => {
		it.each([
			["the live install is linked", (): undefined => undefined],
			[
				"the linked directory is a link to the live install",
				(live: LiveCorpusRoot): string => live.root,
			],
			[
				"the linked directory is a link to the live install's backing tree",
				(live: LiveCorpusRoot): string => live.backingRoot,
			],
		] as const)(
			"refuses the apply when %s, and the review says so",
			async (_situation, target) => {
				const { driver, runsDirectory, live, liveDirectory } = await serving();
				const linked = target(live);
				if (linked === undefined) {
					await unlinkCorpus(runsDirectory);
				} else {
					const link = join(
						await temporaryDirectory("rehearse-corpus-edit-link-"),
						"corpus",
					);
					await symlink(linked, link);
					await linkCorpus(runsDirectory, link);
				}
				const before = await treeOf(liveDirectory);
				const edit = { path: "CLAUDE.md", text: "edited from the browser\n" };
				const review = await driver.review(edit);

				const response = await driver.applyRaw({
					...edit,
					startsFrom: review.startsFrom,
				});

				expect(review.applyRefusal).toContain("live install");
				expect(response.status).toBe(409);
				expect(await treeOf(liveDirectory)).toEqual(before);
			},
		);
	});
});
