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
import {
	directorySource,
	liveStageSettings,
	RecordedRunsFixture,
} from "#benchmark/run-records-test-support";
import { measureCorpusVersion } from "#benchmark/corpus-version";
import { benchmarkRunPaths, checkpointRecordFile } from "#benchmark/run-layout";
import type { CorpusReport } from "./corpus-report";
import { corpusReport } from "./corpus-report";

describe(corpusReport.name, () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
		);
	});

	async function corpusDirectory(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-corpus-report-"));
		roots.push(root);

		return root;
	}

	it("reports only the corpus layout, never a file beside it in the root", async () => {
		const root = await fullCorpusDirectory();
		await mkdir(join(root, "daemon"), { recursive: true });
		await writeFile(join(root, "daemon", "control.key"), "secret\n");
		await writeFile(join(root, ".claude.json"), "{}\n");
		const runs = await corpusDirectory();
		await new RecordedRunsFixture(runs).write();

		const report = await corpusReport(directorySource(root), runs);

		expect(report.files.map(({ path }) => path)).toEqual([
			"CLAUDE.md",
			"skills/build/SKILL.md",
			"skills/discuss/SKILL.md",
		]);
	});

	it("reports a rulebook file, since a stage session's corpus freezes rulebook whole", async () => {
		const root = await fullCorpusDirectory();
		await mkdir(join(root, "rulebook"), { recursive: true });
		await writeFile(join(root, "rulebook", "coding-style.md"), "style\n");
		const runs = await corpusDirectory();
		await new RecordedRunsFixture(runs).write();

		const report = await corpusReport(directorySource(root), runs);

		expect(report.files.map(({ path }) => path)).toContain(
			"rulebook/coding-style.md",
		);
	});

	describe("when a layout directory holds a symlink resolving outside the root", () => {
		async function reportOverEscapingSkills(): Promise<CorpusReport> {
			const root = await fullCorpusDirectory();
			const outside = await corpusDirectory();
			await writeFile(join(outside, "secret.md"), "secret bytes\n");
			await mkdir(join(root, "agents"), { recursive: true });
			await writeFile(join(root, "agents", "normal.md"), "an agent\n");
			await symlink(
				join(outside, "secret.md"),
				join(root, "skills", "escape.md"),
			);
			const runs = await corpusDirectory();
			await new RecordedRunsFixture(runs).write();

			return corpusReport(directorySource(root), runs);
		}

		it("reports every file under the layout directories that hashed whole, including one walked after the refusal", async () => {
			const report = await reportOverEscapingSkills();

			expect(report.files.map(({ path }) => path)).toEqual([
				"CLAUDE.md",
				"agents/normal.md",
			]);
		});

		it("names every offending entry in the directory, so an earlier one cannot hide a later one", async () => {
			const root = await fullCorpusDirectory();
			const outside = await corpusDirectory();
			await writeFile(join(outside, "secret.md"), "secret bytes\n");
			await mkdir(join(root, "agents"), { recursive: true });
			await symlink(
				join(root, "aardvark-gone.md"),
				join(root, "agents", "aardvark.md"),
			);
			await symlink(
				join(outside, "secret.md"),
				join(root, "agents", "escape.md"),
			);
			const runs = await corpusDirectory();
			await new RecordedRunsFixture(runs).write();

			const report = await corpusReport(directorySource(root), runs);

			expect(report.refusals).toEqual([
				"agents/aardvark.md is a link whose target is missing, so the bytes it names cannot be read",
				"agents/escape.md resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
			]);
		});

		it("names the refused entry without an absolute path", async () => {
			const report = await reportOverEscapingSkills();

			expect(report.refusals).toEqual([
				"skills/escape.md resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
			]);
		});

		it("carries no corpus root digest, since a digest over a partial tree names a corpus nobody holds", async () => {
			const report = await reportOverEscapingSkills();

			expect(report.digest).toBeUndefined();
		});
	});

	it("reports the refusal for a symlinked directory under a layout directory, rather than what it points at", async () => {
		const root = await fullCorpusDirectory();
		const outside = await corpusDirectory();
		await writeFile(join(outside, "control.key"), "secret bytes\n");
		await symlink(outside, join(root, "skills", "escape"));
		const runs = await corpusDirectory();
		await new RecordedRunsFixture(runs).write();

		const report = await corpusReport(directorySource(root), runs);

		expect(report.files.map(({ path }) => path)).toEqual(["CLAUDE.md"]);
		expect(report.refusals).toEqual([
			"skills/escape resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
		]);
		expect(JSON.stringify(report.refusals)).not.toContain("control.key");
	});

	it("redacts an absolute path out of a refusal, since a refusal is served to a browser", async () => {
		const root = await fullCorpusDirectory();
		const outside = await corpusDirectory();
		await symlink(outside, join(root, "agents"));
		const runs = await corpusDirectory();
		await new RecordedRunsFixture(runs).write();

		const report = await corpusReport(directorySource(root), runs);

		expect(report.refusals).toEqual([
			"agents resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
		]);
	});

	it("names a self-referential layout directory as a refusal, rather than failing the report", async () => {
		const root = await fullCorpusDirectory();
		await symlink(join(root, "agents"), join(root, "agents"));
		const runs = await corpusDirectory();
		await new RecordedRunsFixture(runs).write();

		const report = await corpusReport(directorySource(root), runs);

		expect(report.files.map(({ path }) => path)).toEqual([
			"CLAUDE.md",
			"skills/build/SKILL.md",
			"skills/discuss/SKILL.md",
		]);
		expect(report.refusals).toEqual([
			"agents is a link that never resolves to a file, so it names no bytes",
		]);
		expect(report.digest).toBeUndefined();
	});

	it("names a file occupying a layout directory path as a refusal, rather than failing the report", async () => {
		const root = await fullCorpusDirectory();
		await writeFile(join(root, "agents"), "not a directory\n");
		const runs = await corpusDirectory();
		await new RecordedRunsFixture(runs).write();

		const report = await corpusReport(directorySource(root), runs);

		expect(report.files.map(({ path }) => path)).toEqual([
			"CLAUDE.md",
			"skills/build/SKILL.md",
			"skills/discuss/SKILL.md",
		]);
		expect(report.refusals).toEqual([
			"agents is not a directory, so it cannot contain corpus files to hash",
		]);
		expect(report.digest).toBeUndefined();
	});

	it("names a layout entry it cannot read as a refusal, rather than failing the report", async () => {
		const root = await fullCorpusDirectory();
		await mkdir(join(root, "agents"), { recursive: true });
		await writeFile(join(root, "agents", "normal.md"), "an agent\n");
		await writeFile(join(root, "agents", "unreadable.md"), "an agent\n");
		await chmod(join(root, "agents", "unreadable.md"), 0o000);
		const runs = await corpusDirectory();
		await new RecordedRunsFixture(runs).write();

		const report = await corpusReport(directorySource(root), runs);

		expect(report.refusals).toEqual([
			"agents/unreadable.md cannot be read, so its bytes cannot be hashed",
		]);
		expect(report.digest).toBeUndefined();
		expect(JSON.stringify(report.refusals)).not.toContain("EACCES");
		expect(report.files.map(({ path }) => path)).toContain(
			"skills/build/SKILL.md",
		);
	});

	it("names a self-referential link as a refusal, though the whole listing of its directory fails", async () => {
		const root = await fullCorpusDirectory();
		await mkdir(join(root, "agents"), { recursive: true });
		await symlink(
			join(root, "agents", "loop.md"),
			join(root, "agents", "loop.md"),
		);
		const runs = await corpusDirectory();
		await new RecordedRunsFixture(runs).write();

		const report = await corpusReport(directorySource(root), runs);

		expect(report.refusals).toEqual([
			"agents/loop.md is a link that never resolves to a file, so it names no bytes",
		]);
		expect(report.digest).toBeUndefined();
		expect(JSON.stringify(report.refusals)).not.toContain("ELOOP");
	});

	it("names both an unreadable entry and an escaping one, so neither hides the other", async () => {
		const root = await fullCorpusDirectory();
		const outside = await corpusDirectory();
		await writeFile(join(outside, "secret.md"), "secret bytes\n");
		await mkdir(join(root, "agents"), { recursive: true });
		await symlink(
			join(outside, "secret.md"),
			join(root, "agents", "escape.md"),
		);
		await writeFile(join(root, "agents", "zz-unreadable.md"), "an agent\n");
		await chmod(join(root, "agents", "zz-unreadable.md"), 0o000);
		const runs = await corpusDirectory();
		await new RecordedRunsFixture(runs).write();

		const report = await corpusReport(directorySource(root), runs);

		expect(report.refusals).toEqual([
			"agents/escape.md resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
			"agents/zz-unreadable.md cannot be read, so its bytes cannot be hashed",
		]);
		expect(JSON.stringify(report.refusals)).not.toContain("EACCES");
	});

	it("reports a rulebook file exactly once, not once per list that carries it", async () => {
		const root = await fullCorpusDirectory();
		await mkdir(join(root, "rulebook"), { recursive: true });
		await writeFile(join(root, "rulebook", "coding-style.md"), "style\n");
		const runs = await corpusDirectory();
		await new RecordedRunsFixture(runs).write();

		const report = await corpusReport(directorySource(root), runs);

		expect(
			report.files.filter(({ path }) => path === "rulebook/coding-style.md"),
		).toHaveLength(1);
	});

	async function fullCorpusDirectory(): Promise<string> {
		const root = await corpusDirectory();
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

	async function runsDirectory(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-corpus-report-runs-"));
		roots.push(root);

		return root;
	}

	it("lists a live corpus file with a read count of zero when no checkpoint recorded it", async () => {
		const corpus = await corpusDirectory();
		await writeFile(join(corpus, "CLAUDE.md"), "instructions");

		const report = await corpusReport(
			directorySource(corpus),
			await runsDirectory(),
		);

		expect(report.files).toEqual([
			expect.objectContaining({ path: "CLAUDE.md", readBy: 0 }),
		]);
	});

	it("refuses a live instruction file outside the install and declared backing tree", async () => {
		const root = await corpusDirectory();
		const backingRoot = await corpusDirectory();
		const outside = await corpusDirectory();
		await mkdir(join(root, "skills", "build"), { recursive: true });
		await writeFile(join(root, "skills", "build", "SKILL.md"), "build skill\n");
		await writeFile(join(outside, "secret.md"), "SECRET BYTES\n");
		await symlink(join(outside, "secret.md"), join(root, "CLAUDE.md"));
		const source = { kind: "live" as const, root, backingRoot };

		const report = await corpusReport(source, await runsDirectory());

		expect(report.files.map(({ path }) => path)).toEqual([
			"skills/build/SKILL.md",
		]);
		expect(report.refusals).toEqual([
			"Corpus file CLAUDE.md resolves outside the live corpus extent, which would hash bytes the corpus does not hold",
		]);
		expect(report.digest).toBeUndefined();
		expect(JSON.stringify(report)).not.toContain("SECRET BYTES");
	});

	it("reports permitted backing-tree links like the same corpus stored locally", async () => {
		const root = await corpusDirectory();
		const backingRoot = await fullCorpusDirectory();
		const localRoot = await fullCorpusDirectory();
		await symlink(join(backingRoot, "CLAUDE.md"), join(root, "CLAUDE.md"));
		await symlink(join(backingRoot, "skills"), join(root, "skills"));
		const runs = await runsDirectory();

		const linked = await corpusReport(
			{ kind: "live", root, backingRoot },
			runs,
		);
		const local = await corpusReport(directorySource(localRoot), runs);

		expect(linked.files.map(({ path, sha256 }) => ({ path, sha256 }))).toEqual(
			local.files.map(({ path, sha256 }) => ({ path, sha256 })),
		);
		expect(linked.refusals).toEqual([]);
		expect(linked.digest).toBe(local.digest);
	});

	it("counts the run once when two of its stages both recorded the same file, since read-by counts distinct rows", async () => {
		const corpus = await fullCorpusDirectory();
		const runs = await runsDirectory();

		const fixture = new RecordedRunsFixture(runs);
		await fixture.write();
		await fixture.recordCorpusFrom(directorySource(corpus));

		const report = await corpusReport(directorySource(corpus), runs);

		const instructions = report.files.find((file) => file.path === "CLAUDE.md");
		expect(instructions?.readBy).toBe(1);
	});

	describe("when the corpus was edited after a run read it", () => {
		async function editedAfterRun(): Promise<{
			readonly report: CorpusReport;
			readonly fixture: RecordedRunsFixture;
			readonly previous: string;
		}> {
			const corpus = await fullCorpusDirectory();
			const runs = await runsDirectory();
			const fixture = new RecordedRunsFixture(runs, {
				settingsFile: await liveStageSettings(),
			});
			await fixture.write();
			await fixture.recordCorpusFrom(directorySource(corpus));
			const measured = await fixture.recordVersionFrom(directorySource(corpus));
			await writeFile(
				join(corpus, "skills", "build", "SKILL.md"),
				"build skill, edited\n",
			);

			const report = await corpusReport(directorySource(corpus), runs);

			return {
				report,
				fixture,
				previous: measured.kind === "version" ? measured.digest : "refused",
			};
		}

		it("counts the run's row as invalidated by the last edit, by its id", async () => {
			const { report, fixture, previous } = await editedAfterRun();

			expect(report.lastEdit).toEqual({
				kind: "measured",
				previous,
				count: 1,
				rows: [`run:${fixture.replayableRun}`],
			});
		});

		it("counts the row against the edited file and not against a file the edit left alone", async () => {
			const { report } = await editedAfterRun();

			const counts = Object.fromEntries(
				report.files.map(({ path, invalidated }) => [path, invalidated]),
			);
			expect(counts).toEqual({
				"CLAUDE.md": 0,
				"skills/build/SKILL.md": 1,
				"skills/discuss/SKILL.md": 0,
			});
		});

		it("counts the readable rows when another run's manifest does not parse, rather than failing the report", async () => {
			const corpus = await fullCorpusDirectory();
			const runs = await runsDirectory();
			const fixture = new RecordedRunsFixture(runs, {
				settingsFile: await liveStageSettings(),
			});
			await fixture.write();
			await fixture.recordCorpusFrom(directorySource(corpus));
			await fixture.recordVersionFrom(directorySource(corpus));
			const brokenRun = "2026-09-12T00-00-00.000Z";
			await fixture.writePipelineRun(brokenRun, "audit-log");
			await writeFile(
				benchmarkRunPaths(runs, brokenRun).manifestFile,
				"{ not json",
			);
			await writeFile(
				join(corpus, "skills", "build", "SKILL.md"),
				"build skill, edited\n",
			);

			const report = await corpusReport(directorySource(corpus), runs);

			expect(report.lastEdit).toMatchObject({
				kind: "measured",
				rows: [`run:${fixture.replayableRun}`],
			});
		});

		it("leaves out a replay whose upstream stage an earlier edit had already made stale", async () => {
			const corpus = await fullCorpusDirectory();
			const runs = await runsDirectory();
			const fixture = new RecordedRunsFixture(runs, {
				settingsFile: await liveStageSettings(),
			});
			await fixture.write();
			await fixture.recordCorpusFrom(directorySource(corpus));
			await fixture.recordVersionFrom(directorySource(corpus));
			await writeFile(
				join(corpus, "skills", "discuss", "SKILL.md"),
				"discuss skill, edited\n",
			);
			await fixture.recordReplayFrom(directorySource(corpus));
			await writeFile(
				join(corpus, "skills", "build", "SKILL.md"),
				"build skill, edited\n",
			);

			const report = await corpusReport(directorySource(corpus), runs);

			expect(report.lastEdit).toMatchObject({ kind: "measured", rows: [] });
		});

		it("counts a replay the last edit made stale through its upstream stage", async () => {
			const corpus = await fullCorpusDirectory();
			const runs = await runsDirectory();
			const fixture = new RecordedRunsFixture(runs, {
				settingsFile: await liveStageSettings(),
			});
			await fixture.write();
			await fixture.recordCorpusFrom(directorySource(corpus));
			await fixture.recordVersionFrom(directorySource(corpus));
			await fixture.recordReplayFrom(directorySource(corpus));
			await writeFile(
				join(corpus, "skills", "discuss", "SKILL.md"),
				"discuss skill, edited\n",
			);

			const report = await corpusReport(directorySource(corpus), runs);

			expect(report.lastEdit).toMatchObject({
				kind: "measured",
				rows: [
					`attempt:stage:${fixture.stageAttempt.lineage}/${fixture.stageAttempt.timestamp}`,
					`run:${fixture.replayableRun}`,
				],
			});
		});

		it("leaves out a run already stale for its stage settings", async () => {
			const corpus = await fullCorpusDirectory();
			const runs = await runsDirectory();
			const fixture = new RecordedRunsFixture(runs);
			await fixture.write();
			await fixture.recordCorpusFrom(directorySource(corpus));
			await fixture.recordVersionFrom(directorySource(corpus));
			await writeFile(
				join(corpus, "skills", "build", "SKILL.md"),
				"build skill, edited\n",
			);

			const report = await corpusReport(directorySource(corpus), runs);

			expect(report.lastEdit).toMatchObject({ kind: "measured", rows: [] });
		});

		it("leaves out a run whose latest checkpoint directory holds no record, since its history row has no judgment", async () => {
			const corpus = await fullCorpusDirectory();
			const runs = await runsDirectory();
			const fixture = new RecordedRunsFixture(runs, {
				settingsFile: await liveStageSettings(),
			});
			await fixture.write();
			await fixture.recordCorpusFrom(directorySource(corpus));
			await fixture.recordVersionFrom(directorySource(corpus));
			await rm(
				checkpointRecordFile(
					benchmarkRunPaths(runs, fixture.replayableRun).checkpointDirectory(
						"build",
					),
				),
			);
			await writeFile(
				join(corpus, "skills", "discuss", "SKILL.md"),
				"discuss skill, edited\n",
			);

			const report = await corpusReport(directorySource(corpus), runs);

			expect(report.lastEdit).toMatchObject({ kind: "measured", rows: [] });
		});

		it("names a refused corpus under test as the reason the last edit is not recorded", async () => {
			const corpus = await fullCorpusDirectory();
			const runs = await runsDirectory();
			await measureCorpusVersion(runs, directorySource(corpus));
			await writeFile(
				join(corpus, "skills", "build", "SKILL.md"),
				"build skill, edited\n",
			);
			await measureCorpusVersion(runs, directorySource(corpus));
			await symlink(
				join(corpus, "skills", "loop"),
				join(corpus, "skills", "loop"),
			);

			const report = await corpusReport(directorySource(corpus), runs);

			expect(report.lastEdit).toEqual({
				kind: "not-recorded",
				reason:
					"the corpus under test refused hashing, so it has no place in its log",
			});
		});

		it("leaves out a row an earlier edit had already made stale", async () => {
			const corpus = await fullCorpusDirectory();
			const runs = await runsDirectory();
			const fixture = new RecordedRunsFixture(runs, {
				settingsFile: await liveStageSettings(),
			});
			await fixture.write();
			await fixture.recordCorpusFrom(directorySource(corpus));
			await fixture.recordVersionFrom(directorySource(corpus));
			await writeFile(
				join(corpus, "skills", "build", "SKILL.md"),
				"build skill, edited\n",
			);
			await measureCorpusVersion(runs, directorySource(corpus));
			await writeFile(
				join(corpus, "skills", "discuss", "SKILL.md"),
				"discuss skill, edited\n",
			);

			const report = await corpusReport(directorySource(corpus), runs);

			expect(report.lastEdit).toMatchObject({ kind: "measured", count: 0 });
		});

		it("reads the last edit as not recorded when the log holds no earlier version", async () => {
			const corpus = await fullCorpusDirectory();
			const runs = await runsDirectory();
			const fixture = new RecordedRunsFixture(runs, {
				settingsFile: await liveStageSettings(),
			});
			await fixture.write();
			await fixture.recordCorpusFrom(directorySource(corpus));
			await writeFile(
				join(corpus, "skills", "build", "SKILL.md"),
				"build skill, edited\n",
			);

			const report = await corpusReport(directorySource(corpus), runs);

			expect(report.lastEdit.kind).toBe("not-recorded");
			expect(report.files.map(({ invalidated }) => invalidated)).toEqual([
				0, 0, 0,
			]);
		});
	});

	it("reports a run whose checkpoint directory holds no checkpoint.json as read-by zero, rather than throwing", async () => {
		const corpus = await corpusDirectory();
		await writeFile(join(corpus, "CLAUDE.md"), "instructions");
		const runs = await runsDirectory();
		const fixture = new RecordedRunsFixture(runs);
		await fixture.writeEmptyCheckpointDirectory("discuss");

		const report = await corpusReport(directorySource(corpus), runs);

		const instructions = report.files.find((file) => file.path === "CLAUDE.md");
		expect(instructions?.readBy).toBe(0);
	});
	it("refuses a corpus root whose CLAUDE.md is a symlink to a file outside it, naming it rather than throwing", async () => {
		const root = await corpusDirectory();
		const outside = await corpusDirectory();
		await writeFile(join(outside, "secret.md"), "SECRET BYTES\n");
		await symlink(join(outside, "secret.md"), join(root, "CLAUDE.md"));
		const runs = await runsDirectory();

		const report = await corpusReport(directorySource(root), runs);

		expect(report.refusals).toEqual([
			"Corpus file CLAUDE.md resolves outside the corpus source, which would hash bytes the corpus does not hold",
		]);
		expect(report.digest).toBeUndefined();
		expect(JSON.stringify(report)).not.toContain("SECRET BYTES");
	});

	it("refuses a CLAUDE.md whose link target is gone, rather than reporting the corpus as one that has none", async () => {
		const root = await corpusDirectory();
		await symlink(join(root, "does-not-exist.md"), join(root, "CLAUDE.md"));
		const runs = await runsDirectory();

		const report = await corpusReport(directorySource(root), runs);

		expect(report.refusals).toEqual([
			"Corpus file CLAUDE.md is a link whose target is missing, so the bytes it names cannot be read",
		]);
		expect(report.digest).toBeUndefined();
	});

	it("refuses a CLAUDE.md the harness cannot read, naming it rather than failing the screen", async () => {
		const root = await corpusDirectory();
		await writeFile(join(root, "CLAUDE.md"), "instructions\n");
		await chmod(join(root, "CLAUDE.md"), 0o000);
		const runs = await runsDirectory();

		const report = await corpusReport(directorySource(root), runs);

		expect(report.refusals).toEqual([
			"Corpus file CLAUDE.md cannot be read, so its bytes cannot be hashed",
		]);
		expect(report.digest).toBeUndefined();
	});

	it("refuses a CLAUDE.md that is a device rather than a file, since a device holds no corpus bytes", async () => {
		const root = await corpusDirectory();
		await symlink("/dev/null", join(root, "CLAUDE.md"));
		const runs = await runsDirectory();

		const report = await corpusReport(directorySource(root), runs);

		expect(report.refusals).toEqual([
			"Corpus file CLAUDE.md is not a regular file, so it holds no bytes to hash",
		]);
		expect(report.digest).toBeUndefined();
	});

	it("refuses a CLAUDE.md that is a pipe, rather than blocking the request on a reader that never returns", async () => {
		const root = await corpusDirectory();
		await Bun.spawn(["mkfifo", join(root, "CLAUDE.md")]).exited;
		const runs = await runsDirectory();

		const report = await corpusReport(directorySource(root), runs);

		expect(report.refusals).toEqual([
			"Corpus file CLAUDE.md is not a regular file, so it holds no bytes to hash",
		]);
		expect(report.digest).toBeUndefined();
	});

	it("refuses a CLAUDE.md that points at itself, rather than failing the screen with the loop error", async () => {
		const root = await corpusDirectory();
		await symlink(join(root, "CLAUDE.md"), join(root, "CLAUDE.md"));
		const runs = await runsDirectory();

		const report = await corpusReport(directorySource(root), runs);

		expect(report.refusals).toEqual([
			"Corpus file CLAUDE.md is a link that never resolves to a file, so it names no bytes",
		]);
		expect(report.digest).toBeUndefined();
	});

	it("refuses a CLAUDE.md that is a symlink to a directory, since a directory holds no instruction bytes", async () => {
		const root = await corpusDirectory();
		const outside = await corpusDirectory();
		await writeFile(join(outside, "secret.md"), "SECRET BYTES\n");
		await symlink(outside, join(root, "CLAUDE.md"));
		const runs = await runsDirectory();

		const report = await corpusReport(directorySource(root), runs);

		expect(report.refusals).toEqual([
			"Corpus file CLAUDE.md is a directory, so it holds no bytes to hash",
		]);
		expect(report.digest).toBeUndefined();
	});

	it("reports no refusal for a corpus root that simply has no CLAUDE.md", async () => {
		const root = await corpusDirectory();
		await mkdir(join(root, "skills", "build"), { recursive: true });
		await writeFile(join(root, "skills", "build", "SKILL.md"), "a skill\n");

		const report = await corpusReport(
			directorySource(root),
			await runsDirectory(),
		);

		expect(report.refusals).toEqual([]);
		expect(report.files.map(({ path }) => path)).toEqual([
			"skills/build/SKILL.md",
		]);
	});

	it("identifies a fixed tree by the same digest on every machine", async () => {
		const root = await fullCorpusDirectory();

		const report = await corpusReport(
			directorySource(root),
			await runsDirectory(),
		);

		expect(report.digest).toStartWith("4e196b");
	});

	it("names the live tree by the version a measurement of it records", async () => {
		const root = await fullCorpusDirectory();
		const measured = await measureCorpusVersion(
			await runsDirectory(),
			directorySource(root),
		);

		const report = await corpusReport(
			directorySource(root),
			await runsDirectory(),
		);

		expect(measured.kind === "version" ? measured.digest : "refused").toBe(
			report.digest ?? "withheld",
		);
	});

	it("reports a root reached through a symlinked parent directory, since the link does not leave the corpus", async () => {
		const parent = await corpusDirectory();
		const root = join(parent, "corpus");
		await mkdir(root, { recursive: true });
		await writeFile(join(root, "CLAUDE.md"), "instructions\n");
		const linkedParent = join(await corpusDirectory(), "link");
		await symlink(parent, linkedParent);

		const report = await corpusReport(
			directorySource(join(linkedParent, "corpus")),
			await runsDirectory(),
		);

		expect(report.files.map(({ path }) => path)).toEqual(["CLAUDE.md"]);
	});
});
