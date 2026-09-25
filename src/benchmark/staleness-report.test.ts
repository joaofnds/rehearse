import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CASES_DIRECTORY } from "./case";
import { CONTROL_DIR } from "./config";
import { resolveCorpusSource } from "./corpus-source";
import {
	directorySource,
	liveStageSettings,
	RecordedRunsFixture,
} from "./run-records-test-support";
import { TestResources } from "./test-support";
import {
	checkpointStaleness,
	groupStaleness,
	replayAttemptStaleness,
	sessionAttemptStaleness,
	staleCheckpoints,
} from "./staleness-report";
import { measureCorpusVersion } from "./corpus-version";

const HALF_WRITTEN_UUID = "0f6b6f2a-0000-4000-8000-00000000000f";

describe(staleCheckpoints.name, () => {
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

	async function corpusDirectory(buildSkill: string): Promise<string> {
		const root = await temporaryDirectory("rehearse-stale-corpus-");
		await mkdir(join(root, "skills", "build"), { recursive: true });
		await mkdir(join(root, "skills", "discuss"), { recursive: true });
		await mkdir(join(root, "skills", "doctrine"), { recursive: true });
		await Bun.write(join(root, "CLAUDE.md"), "the instructions\n");
		await Bun.write(join(root, "skills", "build", "SKILL.md"), buildSkill);
		await Bun.write(
			join(root, "skills", "discuss", "SKILL.md"),
			"discuss skill\n",
		);
		await Bun.write(
			join(root, "skills", "doctrine", "principles.md"),
			"the doctrine\n",
		);

		return root;
	}

	/**
	 * Records the live root settings digest, because every assertion below reads
	 * a checkpoint's staleness and `deriveStaleness` compares the recorded digest
	 * against the one it loads from that file. A literal would stale every run
	 * here for a reason no test is about.
	 */
	async function writtenFixture(): Promise<RecordedRunsFixture> {
		const root = await temporaryDirectory("rehearse-stale-");
		const fixture = new RecordedRunsFixture(root, {
			settingsFile: await liveStageSettings(),
		});
		await fixture.write();
		await fixture.writeInitialCheckpoint();

		return fixture;
	}

	async function declarePipelineCase(
		caseId: string,
		settingsContent?: string,
	): Promise<void> {
		const directory = join(CONTROL_DIR, CASES_DIRECTORY, caseId);
		roots.push(directory);
		await mkdir(directory, { recursive: true });
		await Bun.write(
			join(directory, "case.json"),
			JSON.stringify({
				id: caseId,
				kind: "pipeline",
				title: "Settings probe",
				task: "task.md",
				productBrief: "brief.md",
				finalRubric: "rubric.md",
				pipeline: "pipeline.json",
				rubrics: "rubrics",
				target: { path: "/target" },
				settingsFile: "settings.json",
			}),
		);
		if (settingsContent !== undefined) {
			await Bun.write(join(directory, "settings.json"), settingsContent);
		}
	}

	it("names the stage whose recorded corpus no longer matches, with its cause", async () => {
		const fixture = await writtenFixture();
		const corpus = await corpusDirectory("build skill, edited\n");
		await fixture.recordCorpusFrom(
			directorySource(await corpusDirectory("build skill\n")),
		);

		const stale = await staleCheckpoints(
			fixture.runsDirectory,
			directorySource(corpus),
		);

		expect(stale.map(({ id }) => id)).toEqual([
			`checkpoint:${fixture.replayableRun}/build`,
		]);
		expect(stale.at(0)?.causes.join(" ")).toContain("skills/build/SKILL.md");
	});

	it("names no checkpoint when the corpus still holds the recorded bytes", async () => {
		const fixture = await writtenFixture();
		const corpus = await corpusDirectory("build skill\n");
		await fixture.recordCorpusFrom(directorySource(corpus));

		const stale = await staleCheckpoints(
			fixture.runsDirectory,
			directorySource(corpus),
		);

		expect(stale).toEqual([]);
	});

	it("stales the initial checkpoint and its downstream chain when settings change", async () => {
		const fixture = await writtenFixture();
		const corpus = await corpusDirectory("build skill\n");
		await fixture.recordCorpusFrom(directorySource(corpus));
		await fixture.recordSettingsFile({
			path: "stage-settings.json",
			sha256: "0".repeat(64),
		});

		const stale = await staleCheckpoints(
			fixture.runsDirectory,
			directorySource(corpus),
		);

		expect(stale.map(({ id, causes }) => ({ id, causes }))).toEqual([
			{
				id: `checkpoint:${fixture.replayableRun}/initial`,
				causes: ["stage settings file stage-settings.json changed"],
			},
			{
				id: `checkpoint:${fixture.replayableRun}/discuss`,
				causes: [
					"upstream stage initial is stale",
					"stage settings file stage-settings.json changed",
				],
			},
			{
				id: `checkpoint:${fixture.replayableRun}/build`,
				causes: [
					"upstream stage initial is stale",
					"stage settings file stage-settings.json changed",
				],
			},
		]);
	});

	it("treats checkpoints without settings evidence as stale", async () => {
		const fixture = await writtenFixture();
		const corpus = await corpusDirectory("build skill\n");
		await fixture.recordCorpusFrom(directorySource(corpus));
		await fixture.recordSettingsFile(undefined);

		const stale = await staleCheckpoints(
			fixture.runsDirectory,
			directorySource(corpus),
		);

		expect(stale.map(({ id }) => id)).toEqual([
			`checkpoint:${fixture.replayableRun}/initial`,
			`checkpoint:${fixture.replayableRun}/discuss`,
			`checkpoint:${fixture.replayableRun}/build`,
		]);
	});

	it("keeps healthy runs readable when another run's settings file is missing", async () => {
		const fixture = await writtenFixture();
		const corpus = await corpusDirectory("build skill\n");
		const brokenRun = "2026-09-07T00-00-00.000Z";
		const caseId = "zz-settings-missing";
		await declarePipelineCase(caseId);
		await fixture.writePipelineRun(brokenRun, caseId, {
			path: `cases/${caseId}/settings.json`,
			sha256: "0".repeat(64),
		});
		await fixture.recordCorpusFrom(directorySource(corpus));
		await fixture.recordCorpusFrom(directorySource(corpus), brokenRun);

		const stale = await staleCheckpoints(
			fixture.runsDirectory,
			directorySource(corpus),
		);

		expect(stale.map(({ id }) => id)).toEqual([
			`checkpoint:${brokenRun}/discuss`,
			`checkpoint:${brokenRun}/build`,
		]);
		expect(stale.at(0)?.causes.join(" ")).toContain(
			`cases/${caseId}/settings.json`,
		);
		expect(stale.flatMap(({ causes }) => causes).join(" ")).not.toContain(
			CONTROL_DIR,
		);
	});

	it("keeps healthy runs readable when another run's settings file is invalid", async () => {
		const fixture = await writtenFixture();
		const corpus = await corpusDirectory("build skill\n");
		const brokenRun = "2026-09-08T00-00-00.000Z";
		const caseId = "zz-settings-invalid";
		await declarePipelineCase(caseId, JSON.stringify({ hooks: {} }));
		await fixture.writePipelineRun(brokenRun, caseId, {
			path: `cases/${caseId}/settings.json`,
			sha256: "0".repeat(64),
		});
		await fixture.recordCorpusFrom(directorySource(corpus));
		await fixture.recordCorpusFrom(directorySource(corpus), brokenRun);

		const stale = await staleCheckpoints(
			fixture.runsDirectory,
			directorySource(corpus),
		);

		expect(stale.map(({ id }) => id)).toEqual([
			`checkpoint:${brokenRun}/discuss`,
			`checkpoint:${brokenRun}/build`,
		]);
		expect(stale.at(0)?.causes.join(" ")).toContain(
			`cases/${caseId}/settings.json`,
		);
	});

	it("keeps a checkpoint fresh with linked files in the captured live backing tree", async () => {
		const fixture = await writtenFixture();
		const root = await corpusDirectory("build skill\n");
		const backingRoot = await temporaryDirectory("rehearse-stale-backing-");
		await Bun.write(join(backingRoot, "reviewer.md"), "trusted reviewer\n");
		await symlink(backingRoot, join(root, "agents"));
		const source = { kind: "live", root, backingRoot } as const;
		await fixture.recordCorpusFrom(source);

		const stale = await staleCheckpoints(fixture.runsDirectory, source);

		expect(stale).toEqual([]);
	});

	it("reports a refused layout root as the checkpoint's cause", async () => {
		const fixture = await writtenFixture();
		const root = await corpusDirectory("build skill\n");
		await fixture.recordCorpusFrom(directorySource(root));
		const outside = await temporaryDirectory("rehearse-stale-foreign-");
		await Bun.write(join(outside, "private.md"), "foreign bytes\n");
		await symlink(outside, join(root, "agents"));

		const stale = await staleCheckpoints(
			fixture.runsDirectory,
			directorySource(root),
		);

		expect(stale.map(({ id, causes }) => ({ id, causes }))).toEqual([
			{
				id: `checkpoint:${fixture.replayableRun}/discuss`,
				causes: [
					"agents resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
				],
			},
			{
				id: `checkpoint:${fixture.replayableRun}/build`,
				causes: [
					"upstream stage discuss is stale",
					"agents resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
				],
			},
		]);
	});

	describe("when no corpus is named, which is the live install", () => {
		it("answers over a runs directory holding no run, reaching no skill", async () => {
			const runsDirectory = await temporaryDirectory("rehearse-stale-live-");

			const stale = await staleCheckpoints(
				runsDirectory,
				await resolveCorpusSource(undefined),
			);

			expect(stale).toEqual([]);
		});
	});

	describe("when the corpus holds no CLAUDE.md", () => {
		it("answers for the runs it can read without reading instructions", async () => {
			const root = await temporaryDirectory("rehearse-stale-styles-");
			await Bun.write(join(root, "output-styles", "brief.md"), "brief style\n");
			const runsDirectory = await temporaryDirectory("rehearse-stale-empty-");

			const stale = await staleCheckpoints(runsDirectory, {
				kind: "directory",
				root,
			});

			expect(stale).toEqual([]);
		});
	});

	describe("when a corpus directory holds a symlink out of the tree", () => {
		it("stales the stage that reads it, naming the entry as the cause", async () => {
			const fixture = await writtenFixture();
			const corpus = await corpusDirectory("build skill\n");
			await fixture.recordCorpusFrom(directorySource(corpus));
			await symlink(
				join(await corpusDirectory("foreign skill\n"), "CLAUDE.md"),
				join(corpus, "skills", "build", "escape.md"),
			);

			const stale = await staleCheckpoints(
				fixture.runsDirectory,
				directorySource(corpus),
			);

			expect(stale.map(({ id }) => id)).toEqual([
				`checkpoint:${fixture.replayableRun}/build`,
			]);
			expect(stale.at(0)?.causes.join(" ")).toContain("skills/build/escape.md");
		});

		it("judges a stage that does not read the broken tree normally", async () => {
			const fixture = await writtenFixture();
			const corpus = await corpusDirectory("build skill\n");
			await fixture.recordCorpusFrom(directorySource(corpus));
			await symlink(
				join(await corpusDirectory("foreign skill\n"), "CLAUDE.md"),
				join(corpus, "skills", "build", "escape.md"),
			);

			const stale = await staleCheckpoints(
				fixture.runsDirectory,
				directorySource(corpus),
			);

			expect(stale.map(({ id }) => id)).not.toContain(
				`checkpoint:${fixture.replayableRun}/discuss`,
			);
		});

		it("names no absolute filesystem path in the cause", async () => {
			const fixture = await writtenFixture();
			const corpus = await corpusDirectory("build skill\n");
			await fixture.recordCorpusFrom(directorySource(corpus));
			await symlink(
				join(await corpusDirectory("foreign skill\n"), "CLAUDE.md"),
				join(corpus, "skills", "build", "escape.md"),
			);

			const stale = await staleCheckpoints(
				fixture.runsDirectory,
				directorySource(corpus),
			);

			expect(stale.flatMap(({ causes }) => causes).join(" ")).not.toContain(
				corpus,
			);
		});
	});

	describe("when the session about to replay names another model", () => {
		it("names every checkpoint the recorded model no longer matches", async () => {
			const fixture = await writtenFixture();
			const corpus = await corpusDirectory("build skill\n");
			await fixture.recordCorpusFrom(directorySource(corpus));

			const stale = await staleCheckpoints(
				fixture.runsDirectory,
				directorySource(corpus),
				{ model: "opus" },
			);

			expect(stale.map(({ id }) => id)).toEqual([
				`checkpoint:${fixture.replayableRun}/initial`,
				`checkpoint:${fixture.replayableRun}/discuss`,
				`checkpoint:${fixture.replayableRun}/build`,
			]);
			expect(stale.at(0)?.causes).toContain("model sonnet is now opus");
		});
	});

	describe("when the session about to replay names another effort", () => {
		it("names every checkpoint the recorded effort no longer matches", async () => {
			const fixture = await writtenFixture();
			const corpus = await corpusDirectory("build skill\n");
			await fixture.recordCorpusFrom(directorySource(corpus));

			const stale = await staleCheckpoints(
				fixture.runsDirectory,
				directorySource(corpus),
				{ effort: "high" },
			);

			expect(stale.at(0)?.causes).toContain("effort none is now high");
		});
	});
});

describe(checkpointStaleness.name, () => {
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

	async function editedFixture(): Promise<{
		readonly fixture: RecordedRunsFixture;
		readonly corpus: string;
	}> {
		const root = await temporaryDirectory("rehearse-staleness-");
		const fixture = new RecordedRunsFixture(root, {
			settingsFile: await liveStageSettings(),
		});
		await fixture.write();
		await fixture.writeInitialCheckpoint();
		const corpus = await temporaryDirectory("rehearse-staleness-corpus-");
		await mkdir(join(corpus, "skills", "build"), { recursive: true });
		await mkdir(join(corpus, "skills", "discuss"), { recursive: true });
		await Bun.write(join(corpus, "CLAUDE.md"), "the instructions\n");
		await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "build\n");
		await Bun.write(join(corpus, "skills", "discuss", "SKILL.md"), "discuss\n");
		await fixture.recordCorpusFrom(directorySource(corpus));
		await fixture.recordVersionFrom(directorySource(corpus));
		await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "edited\n");

		return { fixture, corpus };
	}

	it("reports every checkpoint with the files it read that changed and its version distance", async () => {
		const { fixture, corpus } = await editedFixture();

		const report = await checkpointStaleness(
			fixture.runsDirectory,
			directorySource(corpus),
		);

		expect(
			report.filter(({ id }) =>
				id.startsWith(`checkpoint:${fixture.replayableRun}/`),
			),
		).toEqual([
			{
				id: `checkpoint:${fixture.replayableRun}/initial`,
				stale: false,
				causes: [],
				changedFiles: [],
				distance: {
					kind: "not-recorded",
					reason: "recorded before corpus versions",
				},
			},
			{
				id: `checkpoint:${fixture.replayableRun}/discuss`,
				stale: false,
				causes: [],
				changedFiles: [],
				distance: { kind: "measured", versions: 1 },
			},
			{
				id: `checkpoint:${fixture.replayableRun}/build`,
				stale: true,
				causes: ["skills/build/SKILL.md changed"],
				changedFiles: [{ path: "skills/build/SKILL.md", change: "changed" }],
				distance: { kind: "measured", versions: 1 },
			},
		]);
	});
});

describe(replayAttemptStaleness.name, () => {
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

	async function recordedFixture(): Promise<{
		readonly fixture: RecordedRunsFixture;
		readonly corpus: string;
	}> {
		const root = await temporaryDirectory("rehearse-replay-staleness-");
		const fixture = new RecordedRunsFixture(root, {
			settingsFile: await liveStageSettings(),
		});
		await fixture.write();
		await fixture.writeInitialCheckpoint();
		const corpus = await temporaryDirectory("rehearse-replay-corpus-");
		await mkdir(join(corpus, "skills", "build"), { recursive: true });
		await mkdir(join(corpus, "skills", "discuss"), { recursive: true });
		await Bun.write(join(corpus, "CLAUDE.md"), "the instructions\n");
		await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "build\n");
		await Bun.write(join(corpus, "skills", "discuss", "SKILL.md"), "discuss\n");
		await fixture.recordCorpusFrom(directorySource(corpus));
		await fixture.recordVersionFrom(directorySource(corpus));
		await fixture.recordReplayFrom(directorySource(corpus));

		return { fixture, corpus };
	}

	const REPLAY_ATTEMPT =
		"attempt:stage:lineage-discuss/2026-09-03T01-00-00.000Z";

	it("names each stage corpus file the replay read that changed, with its version distance", async () => {
		const { fixture, corpus } = await recordedFixture();
		await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "edited\n");

		const report = await replayAttemptStaleness(
			fixture.runsDirectory,
			directorySource(corpus),
		);

		expect(report).toEqual({
			records: [
				{
					id: REPLAY_ATTEMPT,
					stale: true,
					causes: ["skills/build/SKILL.md changed"],
					changedFiles: [{ path: "skills/build/SKILL.md", change: "changed" }],
					distance: { kind: "measured", versions: 1 },
				},
			],
			unreadable: [],
		});
	});

	it("reports the replay clean at distance 0 when nothing it read changed", async () => {
		const { fixture, corpus } = await recordedFixture();

		const report = await replayAttemptStaleness(
			fixture.runsDirectory,
			directorySource(corpus),
		);

		expect(report.records).toEqual([
			{
				id: REPLAY_ATTEMPT,
				stale: false,
				causes: [],
				changedFiles: [],
				distance: { kind: "measured", versions: 0 },
			},
		]);
	});

	it("stales the replay when the checkpoint it consumed went stale", async () => {
		const { fixture, corpus } = await recordedFixture();
		await Bun.write(join(corpus, "skills", "discuss", "SKILL.md"), "edited\n");

		const report = await replayAttemptStaleness(
			fixture.runsDirectory,
			directorySource(corpus),
		);

		expect(report.records.map(({ causes }) => causes)).toEqual([
			["upstream stage discuss is stale"],
		]);
	});

	it("stales the replay on a model the caller names that differs from its own", async () => {
		const { fixture, corpus } = await recordedFixture();

		const report = await replayAttemptStaleness(
			fixture.runsDirectory,
			directorySource(corpus),
			{ model: "opus" },
		);

		expect(report.records.map(({ causes }) => causes)).toEqual([
			["model sonnet is now opus"],
		]);
	});
});

describe(groupStaleness.name, () => {
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

	async function stageCorpus(): Promise<string> {
		const corpus = await temporaryDirectory("rehearse-group-corpus-");
		await mkdir(join(corpus, "skills", "build"), { recursive: true });
		await mkdir(join(corpus, "skills", "discuss"), { recursive: true });
		await Bun.write(join(corpus, "CLAUDE.md"), "the instructions\n");
		await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "build\n");
		await Bun.write(join(corpus, "skills", "discuss", "SKILL.md"), "discuss\n");

		return corpus;
	}

	async function fixtureWithGroupFrom(
		corpus: string,
	): Promise<RecordedRunsFixture> {
		const fixture = new RecordedRunsFixture(
			await temporaryDirectory("rehearse-group-staleness-"),
		);
		await fixture.write();
		await fixture.recordGroupFrom(directorySource(corpus));

		return fixture;
	}

	it("names each frozen stage corpus file that changed, with its version distance", async () => {
		const corpus = await stageCorpus();
		const fixture = await fixtureWithGroupFrom(corpus);
		await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "edited\n");

		const report = await groupStaleness(
			fixture.runsDirectory,
			directorySource(corpus),
		);

		expect(report).toEqual({
			records: [
				{
					id: `group:${fixture.groupId}`,
					stale: true,
					causes: ["skills/build/SKILL.md changed"],
					changedFiles: [{ path: "skills/build/SKILL.md", change: "changed" }],
					distance: { kind: "measured", versions: 1 },
				},
			],
			unreadable: [],
		});
	});

	it("names a file every stage froze once", async () => {
		const corpus = await stageCorpus();
		const fixture = await fixtureWithGroupFrom(corpus);
		await Bun.write(join(corpus, "CLAUDE.md"), "edited instructions\n");

		const report = await groupStaleness(
			fixture.runsDirectory,
			directorySource(corpus),
		);

		expect(report.records.map(({ causes }) => causes)).toEqual([
			["CLAUDE.md changed"],
		]);
	});

	it("reports the group clean at distance 0 when nothing it froze changed", async () => {
		const corpus = await stageCorpus();
		const fixture = await fixtureWithGroupFrom(corpus);

		const report = await groupStaleness(
			fixture.runsDirectory,
			directorySource(corpus),
		);

		expect(report.records).toEqual([
			{
				id: `group:${fixture.groupId}`,
				stale: false,
				causes: [],
				changedFiles: [],
				distance: { kind: "measured", versions: 0 },
			},
		]);
	});

	it("names each frozen session corpus file that changed", async () => {
		const corpus = await temporaryDirectory("rehearse-group-style-");
		await mkdir(join(corpus, "output-styles"), { recursive: true });
		await Bun.write(join(corpus, "output-styles", "brief.md"), "brief\n");
		const fixture = new RecordedRunsFixture(
			await temporaryDirectory("rehearse-session-group-"),
		);
		await fixture.recordSessionGroupFrom("session-group", corpus, [
			"output-styles/brief.md",
		]);
		await Bun.write(join(corpus, "output-styles", "brief.md"), "edited\n");

		const report = await groupStaleness(
			fixture.runsDirectory,
			directorySource(corpus),
		);

		expect(report.records).toEqual([
			{
				id: "group:session-group",
				stale: true,
				causes: ["output-styles/brief.md changed"],
				changedFiles: [{ path: "output-styles/brief.md", change: "changed" }],
				distance: { kind: "measured", versions: 1 },
			},
		]);
	});

	describe("when a stage group froze no pipeline", () => {
		it("names the group unreadable rather than judging it", async () => {
			const fixture = new RecordedRunsFixture(
				await temporaryDirectory("rehearse-group-no-pipeline-"),
			);
			await fixture.write();

			const report = await groupStaleness(
				fixture.runsDirectory,
				directorySource(await stageCorpus()),
			);

			expect(report).toEqual({
				records: [],
				unreadable: [
					{
						id: `group:${fixture.groupId}`,
						reason: "the group froze no pipeline to hash its stages against",
					},
				],
			});
		});
	});
});

describe(sessionAttemptStaleness.name, () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
		);
	});

	async function styleCorpus(brief: string): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-case-corpus-"));
		roots.push(root);
		await mkdir(join(root, "output-styles"), { recursive: true });
		await Bun.write(join(root, "output-styles", "brief.md"), brief);

		return root;
	}

	async function runsWithSmokeAttempt(corpusRoot: string): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-case-stale-"));
		roots.push(root);
		const fixture = new RecordedRunsFixture(root);
		await fixture.writeAttemptReading(corpusRoot, "smoke", [
			"output-styles/brief.md",
		]);

		return root;
	}

	const SMOKE_ATTEMPT =
		"attempt:session:smoke/0f6b6f2a-0000-4000-8000-000000000001";

	it("names each declared corpus file the attempt read that changed", async () => {
		const runsDirectory = await runsWithSmokeAttempt(
			await styleCorpus("the brief style\n"),
		);

		const report = await sessionAttemptStaleness(
			runsDirectory,
			directorySource(await styleCorpus("the brief style, edited\n")),
		);

		expect(report.records).toEqual([
			{
				id: SMOKE_ATTEMPT,
				stale: true,
				causes: ["output-styles/brief.md changed"],
				changedFiles: [{ path: "output-styles/brief.md", change: "changed" }],
				distance: {
					kind: "not-recorded",
					reason: "recorded before corpus versions",
				},
			},
		]);
	});

	it("reports the attempt clean when the corpus still holds the recorded bytes", async () => {
		const corpus = await styleCorpus("the brief style\n");
		const runsDirectory = await runsWithSmokeAttempt(corpus);

		const report = await sessionAttemptStaleness(
			runsDirectory,
			directorySource(corpus),
		);

		expect(report.records.map(({ id, stale }) => ({ id, stale }))).toEqual([
			{ id: SMOKE_ATTEMPT, stale: false },
		]);
	});

	it("names an out-of-extent live file as a stale cause instead of freshness", async () => {
		const recordedCorpus = await styleCorpus("the brief style\n");
		const runsDirectory = await runsWithSmokeAttempt(recordedCorpus);
		const root = await mkdtemp(join(tmpdir(), "rehearse-live-install-"));
		const backingRoot = await mkdtemp(join(tmpdir(), "rehearse-live-backing-"));
		const outside = await styleCorpus("FOREIGN STYLE\n");
		roots.push(root, backingRoot);
		await mkdir(join(root, "output-styles"), { recursive: true });
		await symlink(
			join(outside, "output-styles", "brief.md"),
			join(root, "output-styles", "brief.md"),
		);

		const report = await sessionAttemptStaleness(runsDirectory, {
			kind: "live",
			root,
			backingRoot,
		});

		expect(
			report.records.map(({ id, stale, causes, changedFiles }) => ({
				id,
				stale,
				causes,
				changedFiles,
			})),
		).toEqual([
			{
				id: SMOKE_ATTEMPT,
				stale: true,
				causes: [
					"Corpus file output-styles/brief.md resolves outside the live corpus extent, which would hash bytes the corpus does not hold",
				],
				changedFiles: [],
			},
		]);
	});

	describe("when a case has two attempts measured at two versions", () => {
		const OLDER = "0f6b6f2a-0000-4000-8000-00000000000a";
		const NEWER = "0f6b6f2a-0000-4000-8000-00000000000b";

		it("answers for each attempt on its own, with its distance", async () => {
			const corpus = await styleCorpus("some older style\n");
			const root = await mkdtemp(join(tmpdir(), "rehearse-case-two-"));
			roots.push(root);
			const fixture = new RecordedRunsFixture(root);
			const older = await measureCorpusVersion(root, directorySource(corpus));
			await fixture.writeAttemptAt(
				OLDER,
				corpus,
				"smoke",
				["output-styles/brief.md"],
				older,
			);
			await Bun.write(
				join(corpus, "output-styles", "brief.md"),
				"the brief style\n",
			);
			const newer = await measureCorpusVersion(root, directorySource(corpus));
			await fixture.writeAttemptAt(
				NEWER,
				corpus,
				"smoke",
				["output-styles/brief.md"],
				newer,
			);

			const report = await sessionAttemptStaleness(
				root,
				directorySource(corpus),
			);

			expect(
				report.records
					.map(({ id, stale, distance }) => ({ id, stale, distance }))
					.toSorted((left, right) => left.id.localeCompare(right.id)),
			).toEqual([
				{
					id: `attempt:session:smoke/${OLDER}`,
					stale: true,
					distance: { kind: "measured", versions: 1 },
				},
				{
					id: `attempt:session:smoke/${NEWER}`,
					stale: false,
					distance: { kind: "measured", versions: 0 },
				},
			]);
		});
	});

	describe("when one attempt record cannot be read", () => {
		it("names it as unreadable and still answers for the other attempt", async () => {
			const corpus = await styleCorpus("the brief style\n");
			const runsDirectory = await runsWithSmokeAttempt(corpus);
			const fixture = new RecordedRunsFixture(runsDirectory);
			await fixture.writeUnreadableAttempt("smoke", HALF_WRITTEN_UUID);

			const report = await sessionAttemptStaleness(
				runsDirectory,
				directorySource(await styleCorpus("the brief style, edited\n")),
			);

			expect(report.records.map(({ id }) => id)).toEqual([SMOKE_ATTEMPT]);
			expect(report.unreadable.map(({ id }) => id)).toEqual([
				`attempt:session:smoke/${HALF_WRITTEN_UUID}`,
			]);
		});
	});

	describe("when a case declaration cannot be read", () => {
		const resources = TestResources.forEachTest();

		it("names it as unreadable rather than reading as fresh", async () => {
			const stray = join(CONTROL_DIR, CASES_DIRECTORY, "zz-stale-probe");
			resources.track(stray);
			await mkdir(stray, { recursive: true });
			const root = await mkdtemp(join(tmpdir(), "rehearse-case-unread-"));
			roots.push(root);

			const report = await sessionAttemptStaleness(
				root,
				directorySource(await styleCorpus("the brief style\n")),
			);

			expect(report.unreadable.map(({ id }) => id)).toEqual([
				"case:zz-stale-probe",
			]);
		});
	});

	describe("when a case has no recorded attempt", () => {
		it("reports no record, because nothing was measured", async () => {
			const root = await mkdtemp(join(tmpdir(), "rehearse-case-none-"));
			roots.push(root);

			const report = await sessionAttemptStaleness(
				root,
				directorySource(await styleCorpus("the brief style\n")),
			);

			expect(report.records).toEqual([]);
		});
	});
});
