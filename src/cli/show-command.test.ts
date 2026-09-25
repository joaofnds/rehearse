import { afterEach, describe, expect, it } from "bun:test";
import { chmod, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { caseDeclarationPath, casesRoot } from "#benchmark/case";
import { CONTROL_DIR, DEFAULT_CASE_ID } from "#benchmark/config";
import {
	benchmarkRunPaths,
	benchmarkRunsDirectory,
	comparisonReportPaths,
	confirmationGroupPaths,
} from "#benchmark/run-layout";
import {
	directorySource,
	RecordedRunsFixture,
} from "#benchmark/run-records-test-support";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { UsageError } from "#cli/commands";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import { LIST_KINDS, runList } from "#cli/list-command";
import { runShow } from "#cli/show-command";
import type { ShowDependencies } from "#cli/show-command";
import { CorpusConfigurationError } from "#benchmark/corpus-file";
import { CorpusSourceError } from "#benchmark/corpus-source";
import type { ReadManifestEntry } from "#benchmark/read-manifest";
import { runCommand } from "#benchmark/command";
import { recordRetentionRef } from "#benchmark/target";
import { TestResources } from "#benchmark/test-support";
import { RUN_NAME } from "#cli/calibrate-test-support";

describe("naming a record a session pastes onto a card", () => {
	/**
	 * A card is read by people who are not on this machine, and the README tells
	 * a session to paste this output onto one. An absolute path under the
	 * control root discloses the home directory and names the same file the
	 * control-relative path does.
	 */
	it("names an absent record's path relative to the control root", async () => {
		const recorder = recordOutput();

		const failure = await failureOf(
			runShow(
				{
					id: "run:absent",
					json: true,
					runsDirectory: benchmarkRunsDirectory(CONTROL_DIR),
				},
				recorder.output,
			),
		);

		expect(failure.message).toContain(".benchmark-runs/absent.json");
		expect(failure.message).not.toContain(homedir());
	});
});

/**
 * A group summary judges its reps' reads against a corpus, and the default
 * resolver reads the operator's live install, so a test that does not name a
 * corpus gets none rather than whatever this machine has installed.
 */
const NO_CORPUS: ShowDependencies = {
	resolveCorpus: () =>
		Promise.reject(new CorpusSourceError("this test resolves no corpus")),
};

describe(runShow.name, () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
		);
	});

	async function writtenFixture(): Promise<RecordedRunsFixture> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-show-"));
		roots.push(root);
		const fixture = new RecordedRunsFixture(root);
		await fixture.write();

		return fixture;
	}

	async function printed(
		id: string,
		json: boolean,
		runsDirectory: string,
		dependencies: ShowDependencies = NO_CORPUS,
	): Promise<string> {
		const recorder = recordOutput();
		await runShow({ id, json, runsDirectory }, recorder.output, dependencies);

		return recorder.stdout.join("");
	}

	it("prints exactly the run artifact's bytes with --json", async () => {
		const fixture = await writtenFixture();
		const paths = benchmarkRunPaths(
			fixture.runsDirectory,
			fixture.replayableRun,
		);

		const stdout = await printed(
			`run:${fixture.replayableRun}`,
			true,
			fixture.runsDirectory,
		);

		expect(stdout).toBe(await Bun.file(paths.artifactFile).text());
		expect(() => {
			JSON.parse(stdout);
		}).not.toThrow();
	});

	it("prints exactly the checkpoint record's bytes with --json", async () => {
		const fixture = await writtenFixture();
		const paths = benchmarkRunPaths(
			fixture.runsDirectory,
			fixture.replayableRun,
		);

		const stdout = await printed(
			`checkpoint:${fixture.replayableRun}/build`,
			true,
			fixture.runsDirectory,
		);

		expect(stdout).toBe(
			await Bun.file(
				join(paths.checkpointDirectory("build"), "checkpoint.json"),
			).text(),
		);
	});

	it("prints exactly the group record's bytes with --json", async () => {
		const fixture = await writtenFixture();
		const paths = confirmationGroupPaths(
			fixture.runsDirectory,
			fixture.groupId,
		);

		const stdout = await printed(
			`group:${fixture.groupId}`,
			true,
			fixture.runsDirectory,
		);

		expect(stdout).toBe(await Bun.file(paths.groupFile).text());
	});

	it("prints exactly the comparison report's bytes with --json", async () => {
		const fixture = await writtenFixture();
		const paths = comparisonReportPaths(
			fixture.runsDirectory,
			fixture.comparisonDigest,
		);

		const stdout = await printed(
			`comparison:${fixture.comparisonDigest}`,
			true,
			fixture.runsDirectory,
		);

		expect(stdout).toBe(await Bun.file(paths.reportFile).text());
	});

	it("prints exactly the case declaration's bytes with --json", async () => {
		const fixture = await writtenFixture();

		const stdout = await printed(
			`case:${DEFAULT_CASE_ID}`,
			true,
			fixture.runsDirectory,
		);

		expect(stdout).toBe(
			await Bun.file(caseDeclarationPath(DEFAULT_CASE_ID, casesRoot())).text(),
		);
	});

	it("prints exactly the session attempt record's bytes with --json", async () => {
		const fixture = await writtenFixture();

		const stdout = await printed(
			`attempt:session:${fixture.sessionAttempt.caseId}/${fixture.sessionAttempt.uuid}`,
			true,
			fixture.runsDirectory,
		);

		expect(stdout).toBe(await Bun.file(fixture.sessionAttemptFile).text());
	});

	it("prints exactly the stage replay record's bytes with --json", async () => {
		const fixture = await writtenFixture();

		const stdout = await printed(
			`attempt:stage:${fixture.stageAttempt.lineage}/${fixture.stageAttempt.timestamp}`,
			true,
			fixture.runsDirectory,
		);

		expect(stdout).toBe(await Bun.file(fixture.stageAttemptFile).text());
	});

	async function stageCorpus(): Promise<string> {
		const corpus = await mkdtemp(join(tmpdir(), "rehearse-show-corpus-"));
		roots.push(corpus);
		await mkdir(join(corpus, "skills", "build"), { recursive: true });
		await mkdir(join(corpus, "skills", "discuss"), { recursive: true });
		await Bun.write(join(corpus, "CLAUDE.md"), "the instructions\n");
		await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "build\n");
		await Bun.write(join(corpus, "skills", "discuss", "SKILL.md"), "discuss\n");

		return corpus;
	}

	const BUILD_SKILL_SHA256 = new Bun.CryptoHasher("sha256")
		.update("build\n")
		.digest("hex");
	const BUILD_SKILL_READ: ReadManifestEntry = {
		path: "skills/build/SKILL.md",
		half: "corpus",
		role: "stage skill",
		evidence: "declared",
		sha256: BUILD_SKILL_SHA256,
	};

	function corpusAt(root: string): ShowDependencies {
		return {
			resolveCorpus: () => Promise.resolve({ kind: "directory", root }),
		};
	}

	it("prints each rep stage's reads in a group's summary, with whether each file changed since", async () => {
		const corpus = await stageCorpus();
		const fixture = await writtenFixture();
		await fixture.recordGroupFrom(directorySource(corpus));
		const repId = `${fixture.groupId}-rep-1`;
		await fixture.recordGroupRepReadManifest(repId, "build", [
			BUILD_SKILL_READ,
		]);
		await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "edited\n");

		const stdout = await printed(
			`group:${fixture.groupId}`,
			false,
			fixture.runsDirectory,
			corpusAt(corpus),
		);

		expect(stdout).toContain(
			`| ${repId} | build | skills/build/SKILL.md | stage skill | declared | ${BUILD_SKILL_SHA256.slice(0, 12)} | changed |
States compare each file with the corpus at ${corpus} as it was when this summary was printed.`,
		);
	});

	async function fixtureWithRepRead(): Promise<RecordedRunsFixture> {
		const fixture = await writtenFixture();
		await fixture.recordGroupRepReadManifest(
			`${fixture.groupId}-rep-1`,
			"build",
			[BUILD_SKILL_READ],
		);

		return fixture;
	}

	it("lists a group's rep reads unjudged and names why when they could not be judged", async () => {
		const fixture = await fixtureWithRepRead();

		const stdout = await printed(
			`group:${fixture.groupId}`,
			false,
			fixture.runsDirectory,
			corpusAt(await stageCorpus()),
		);

		expect(stdout).toContain(
			`| ${fixture.groupId}-rep-1 | build | skills/build/SKILL.md | stage skill | declared | ${BUILD_SKILL_SHA256.slice(0, 12)} | not judged |
Reads not judged: the group froze no pipeline to hash its stages against.`,
		);
	});

	it("lists a group's rep reads unjudged when the live install is misconfigured", async () => {
		const fixture = await fixtureWithRepRead();

		const stdout = await printed(
			`group:${fixture.groupId}`,
			false,
			fixture.runsDirectory,
			{
				resolveCorpus: () =>
					Promise.reject(
						new CorpusConfigurationError("the backing root is relative"),
					),
			},
		);

		expect(stdout).toContain(
			`| stage skill | declared | ${BUILD_SKILL_SHA256.slice(0, 12)} | not judged |
Reads not judged: the backing root is relative.`,
		);
	});

	/**
	 * The production runs directory is under the control root, so a filesystem
	 * error naming a rep's file there would disclose the home directory on the
	 * card this summary is pasted onto.
	 */
	it("names a rep stage it could not read relative to the control root", async () => {
		const root = await mkdtemp(join(CONTROL_DIR, "rehearse-show-test-"));
		roots.push(root);
		const fixture = new RecordedRunsFixture(root);
		await fixture.write();
		const repId = `${fixture.groupId}-rep-1`;
		await fixture.recordGroupRepReadManifest(repId, "build", [
			BUILD_SKILL_READ,
		]);
		const stageFile = confirmationGroupPaths(
			fixture.runsDirectory,
			fixture.groupId,
		)
			.rep(repId)
			.stageFile("build");
		await chmod(stageFile, 0);

		const stdout = await printed(
			`group:${fixture.groupId}`,
			false,
			fixture.runsDirectory,
			corpusAt(await stageCorpus()),
		);

		await chmod(stageFile, 0o644);
		expect(stdout).toContain(
			`${repId} build could not be read: EACCES: permission denied, open '${relative(CONTROL_DIR, stageFile)}'`,
		);
		expect(stdout).not.toContain(homedir());
	});

	it("prints a confirmation rep's stage file with the reads it recorded", async () => {
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

		const stdout = await printed(
			`rep:stage:${fixture.groupId}/${repId}/build`,
			false,
			fixture.runsDirectory,
		);

		expect(stdout).toBe(
			await Bun.file(
				confirmationGroupPaths(fixture.runsDirectory, fixture.groupId)
					.rep(repId)
					.stageFile("build"),
			).text(),
		);
	});

	it("prints a session confirmation rep's attempt with the reads it recorded", async () => {
		const fixture = await writtenFixture();
		const repId = `${fixture.groupId}-rep-1`;
		await fixture.recordSessionGroupRepAttempt(
			fixture.groupId,
			repId,
			fixture.runsDirectory,
			[],
			[
				{
					path: "CLAUDE.md",
					half: "project",
					role: "project instructions",
					evidence: "declared",
				},
			],
		);

		const stdout = await printed(
			`rep:session:${fixture.groupId}/${repId}`,
			false,
			fixture.runsDirectory,
		);

		expect(stdout).toBe(
			await Bun.file(
				confirmationGroupPaths(fixture.runsDirectory, fixture.groupId).rep(
					repId,
				).attemptFile,
			).text(),
		);
	});

	it("prints the record that exists on disk for a run that stopped at a stage", async () => {
		const fixture = await writtenFixture();
		await fixture.writeStoppedRun();
		const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.stoppedRun);

		const stdout = await printed(
			`run:${fixture.stoppedRun}`,
			true,
			fixture.runsDirectory,
		);

		expect(stdout).toBe(await Bun.file(paths.stageFile("build")).text());
	});

	it("prints a stopped run's stage record rather than a run summary without --json", async () => {
		const fixture = await writtenFixture();
		await fixture.writeStoppedRun();
		const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.stoppedRun);

		const stdout = await printed(
			`run:${fixture.stoppedRun}`,
			false,
			fixture.runsDirectory,
		);

		expect(stdout).toBe(await Bun.file(paths.stageFile("build")).text());
	});

	it("refuses a run with no record of any kind by name, not with a raw filesystem error", async () => {
		const fixture = await writtenFixture();
		await fixture.writeNoRecordRun();

		const failure = await failureOf(
			runShow(
				{
					id: `run:${fixture.noRecordRun}`,
					json: true,
					runsDirectory: fixture.runsDirectory,
				},
				recordOutput().output,
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain(fixture.noRecordRun);
	});

	it("prints a run's stages, grades, verdict, and total cost without --json", async () => {
		const fixture = await writtenFixture();

		const stdout = await printed(
			`run:${fixture.replayableRun}`,
			false,
			fixture.runsDirectory,
		);

		expect(stdout).toContain("| stage | grade | verdict | cost |");
		expect(stdout).toContain("| build | B | CONTINUE | $2.00 |");
		expect(stdout).toContain("Final verdict PASS.");
		expect(stdout).toContain("Total cost $7.75.");
		expect(() => {
			JSON.parse(stdout);
		}).toThrow();
	});

	it("prints a comparison's paired deltas beside the control arm without --json", async () => {
		const fixture = await writtenFixture();

		const stdout = await printed(
			`comparison:${fixture.comparisonDigest}`,
			false,
			fixture.runsDirectory,
		);

		expect(stdout).toContain("| candidate − baseline | build |");
		expect(stdout).toContain("| candidate − control | build |");
		expect(stdout).toContain("| baseline − control | build |");
	});

	describe("when the group record was written without a case id", () => {
		it("names the legacy default case in its summary", async () => {
			const fixture = await writtenFixture();
			await fixture.writeGroupWithoutCaseId("group-legacy");
			await fixture.writeGroupReport("group-legacy");

			const stdout = await printed(
				"group:group-legacy",
				false,
				fixture.runsDirectory,
			);

			expect(stdout).toContain("Case audit-log");
			expect(stdout).toContain("success rate");
			expect(stdout).toContain("pass^k");
		});
	});

	describe("when a group's report is missing but its record is not", () => {
		it("names the report rather than claiming the group does not exist", async () => {
			const fixture = await writtenFixture();
			await fixture.writeGroupWithoutCaseId("group-no-report");
			const recorder = recordOutput();

			const failure = await failureOf(
				runShow(
					{
						id: "group:group-no-report",
						json: false,
						runsDirectory: fixture.runsDirectory,
					},
					recorder.output,
				),
			);

			expect(failure).toBeInstanceOf(RefusedPreconditionError);
			expect(failure.message).toContain("report.json");
			expect(failure.message).not.toContain("No record group:group-no-report");
		});

		it("still prints the group record's own bytes with --json", async () => {
			const fixture = await writtenFixture();
			await fixture.writeGroupWithoutCaseId("group-no-report");
			const paths = confirmationGroupPaths(
				fixture.runsDirectory,
				"group-no-report",
			);

			const stdout = await printed(
				"group:group-no-report",
				true,
				fixture.runsDirectory,
			);

			expect(stdout).toBe(await Bun.file(paths.groupFile).text());
		});
	});

	describe("when given a short id", () => {
		async function numberedFixture(): Promise<RecordedRunsFixture> {
			const fixture = await writtenFixture();
			await fixture.claim("audit-log", fixture.auditLogClaims);
			await fixture.claim("smoke", fixture.smokeClaims);

			return fixture;
		}

		it.each([true, false])(
			"prints what the Record ID prints for each kind it names, --json %p",
			async (json) => {
				const fixture = await numberedFixture();
				const { runsDirectory, replayableRun, stageAttempt, groupId } = fixture;
				const pairs = [
					["audit-log/r2", `run:${replayableRun}`],
					["audit-log/r2/s0", `checkpoint:${replayableRun}/initial`],
					["audit-log/r2/s2", `checkpoint:${replayableRun}/build`],
					[
						"audit-log/r3",
						`attempt:stage:${stageAttempt.lineage}/${stageAttempt.timestamp}`,
					],
					["audit-log/g4", `group:${groupId}`],
					[
						"smoke/r1",
						`attempt:session:${fixture.sessionAttempt.caseId}/${fixture.sessionAttempt.uuid}`,
					],
				] as const;
				await fixture.writeInitialCheckpoint(replayableRun);

				for (const [shortId, recordId] of pairs) {
					expect(await printed(shortId, json, runsDirectory)).toBe(
						await printed(recordId, json, runsDirectory),
					);
				}
			},
		);

		it("refuses a number no record holds, naming the id as typed", async () => {
			const fixture = await numberedFixture();

			const failure = await failureOf(
				runShow(
					{
						id: "audit-log/r99",
						json: false,
						runsDirectory: fixture.runsDirectory,
					},
					recordOutput().output,
				),
			);

			expect(failure).toBeInstanceOf(RefusedPreconditionError);
			expect(failure.message).toContain("audit-log/r99");
		});

		it("refuses a stage the run's pipeline does not have", async () => {
			const fixture = await numberedFixture();

			const failure = await failureOf(
				runShow(
					{
						id: "audit-log/r2/s9",
						json: false,
						runsDirectory: fixture.runsDirectory,
					},
					recordOutput().output,
				),
			);

			expect(failure).toBeInstanceOf(RefusedPreconditionError);
			expect(failure.message).toContain("audit-log/r2/s9");
		});

		it("refuses a stage of a record that is not a run, naming its kind", async () => {
			const fixture = await numberedFixture();

			const failure = await failureOf(
				runShow(
					{
						id: "audit-log/r3/s1",
						json: false,
						runsDirectory: fixture.runsDirectory,
					},
					recordOutput().output,
				),
			);

			expect(failure).toBeInstanceOf(RefusedPreconditionError);
			expect(failure.message).toContain("attempt:stage");
		});

		it("refuses a stage of a run whose manifest cannot be read", async () => {
			const fixture = await numberedFixture();
			await Bun.write(
				benchmarkRunPaths(fixture.runsDirectory, fixture.replayableRun)
					.manifestFile,
				"{ not json\n",
			);

			const failure = await failureOf(
				runShow(
					{
						id: "audit-log/r2/s1",
						json: false,
						runsDirectory: fixture.runsDirectory,
					},
					recordOutput().output,
				),
			);

			expect(failure).toBeInstanceOf(RefusedPreconditionError);
			expect(failure.message).toContain("manifest");
		});

		it("refuses a malformed case segment and creates or opens no path", async () => {
			const root = await mkdtemp(join(tmpdir(), "rehearse-show-"));
			roots.push(root);
			const runsDirectory = join(root, "runs");

			const failure = await failureOf(
				runShow(
					{ id: "../x/r1", json: false, runsDirectory },
					recordOutput().output,
				),
			);

			expect(failure).toBeInstanceOf(UsageError);
			expect(await readdir(root)).toEqual([]);
		});
	});

	describe("when the id is missing or malformed", () => {
		it("refuses no argument by naming every id form", async () => {
			const fixture = await writtenFixture();

			const failure = await failureOf(
				runShow(
					{
						id: undefined,
						json: false,
						runsDirectory: fixture.runsDirectory,
					},
					recordOutput().output,
				),
			);

			expect(failure).toBeInstanceOf(UsageError);
			expect(failure.message).toContain("checkpoint:<run>/<stage>");
			expect(failure.message).toContain("<case>/r<n>/s<k>");
		});

		it("refuses an unknown prefix as a usage error", async () => {
			const fixture = await writtenFixture();

			const failure = await failureOf(
				runShow(
					{ id: "nonsense", json: false, runsDirectory: fixture.runsDirectory },
					recordOutput().output,
				),
			);

			expect(failure).toBeInstanceOf(UsageError);
		});

		it("names the form a known prefix takes when its body is wrong", async () => {
			const fixture = await writtenFixture();

			const failure = await failureOf(
				runShow(
					{
						id: "checkpoint:only-one-part",
						json: false,
						runsDirectory: fixture.runsDirectory,
					},
					recordOutput().output,
				),
			);

			expect(failure).toBeInstanceOf(UsageError);
			expect(failure.message).toContain("checkpoint:<run>/<stage>");
		});
	});

	describe("when a well-formed id names no record", () => {
		it("refuses the precondition and prints nothing on stdout", async () => {
			const fixture = await writtenFixture();
			const recorder = recordOutput();

			const failure = await failureOf(
				runShow(
					{
						id: "run:absent",
						json: false,
						runsDirectory: fixture.runsDirectory,
					},
					recorder.output,
				),
			);

			expect(failure).toBeInstanceOf(RefusedPreconditionError);
			expect(failure.message).toContain("run:absent");
			expect(recorder.stdout).toEqual([]);
		});
	});
});

describe("list and show are read-only", () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
		);
	});

	async function digestOfTree(root: string): Promise<readonly string[]> {
		const entries = await readdir(root, {
			recursive: true,
			withFileTypes: true,
		});
		const digests: string[] = [];

		for (const entry of entries.toSorted((left, right) =>
			left.name < right.name ? -1 : 1,
		)) {
			const path = join(entry.parentPath, entry.name);
			digests.push(
				entry.isFile()
					? `${path}:${new Bun.CryptoHasher("sha256")
							.update(await Bun.file(path).bytes())
							.digest("hex")}`
					: `${path}:directory`,
			);
		}

		return digests.toSorted();
	}

	it("leaves every file under the runs directory byte-identical", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-readonly-"));
		roots.push(root);
		const corpus = await mkdtemp(join(tmpdir(), "rehearse-readonly-corpus-"));
		roots.push(corpus);
		await Bun.write(join(corpus, "CLAUDE.md"), "the instructions\n");
		await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "build\n");
		await Bun.write(join(corpus, "skills", "discuss", "SKILL.md"), "discuss\n");
		const fixture = new RecordedRunsFixture(root);
		await fixture.write();
		await fixture.recordGroupFrom(directorySource(corpus));
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
		const judgedAgainstCorpus: ShowDependencies = {
			resolveCorpus: () => Promise.resolve({ kind: "directory", root: corpus }),
		};
		const before = await digestOfTree(root);
		const recorder = recordOutput();

		for (const kind of LIST_KINDS) {
			await runList({ kind, runsDirectory: root }, recorder.output);
		}
		for (const id of [
			`run:${fixture.replayableRun}`,
			`checkpoint:${fixture.replayableRun}/build`,
			`group:${fixture.groupId}`,
			`rep:stage:${fixture.groupId}/${repId}/build`,
			`comparison:${fixture.comparisonDigest}`,
			`attempt:session:${fixture.sessionAttempt.caseId}/${fixture.sessionAttempt.uuid}`,
			`attempt:stage:${fixture.stageAttempt.lineage}/${fixture.stageAttempt.timestamp}`,
		]) {
			await runShow(
				{ id, json: true, runsDirectory: root },
				recorder.output,
				judgedAgainstCorpus,
			);
			await runShow(
				{ id, json: false, runsDirectory: root },
				recorder.output,
				judgedAgainstCorpus,
			);
		}

		expect(await digestOfTree(root)).toEqual(before);
	});
});

describe("show --checkout", () => {
	const resources = TestResources.forEachTest();

	interface CheckoutFixture {
		readonly runsDirectory: string;
		readonly targetDirectory: string;
		readonly resultSha: string;
		readonly checkoutPath: string;
	}

	async function retainedRun(): Promise<CheckoutFixture> {
		const target = await resources.createRepository();
		const runsDirectory = await mkdtemp(join(tmpdir(), "rehearse-runs-"));
		resources.track(runsDirectory);
		await Bun.write(
			benchmarkRunPaths(runsDirectory, RUN_NAME).artifactFile,
			JSON.stringify({
				status: "AWAITING_HUMAN_REVIEW",
				sourceRoot: target.directory,
				resultSha: target.sha,
			}),
		);
		await recordRetentionRef(target.directory, RUN_NAME, target.sha);
		const checkoutRoot = await mkdtemp(join(tmpdir(), "rehearse-checkout-"));
		resources.track(checkoutRoot);
		const checkoutPath = join(checkoutRoot, "candidate");
		resources.trackWorktree(target.directory, checkoutPath);

		return {
			runsDirectory,
			targetDirectory: target.directory,
			resultSha: target.sha,
			checkoutPath,
		};
	}

	it("adds a detached worktree of the retained candidate and prints its path", async () => {
		const fixture = await retainedRun();
		const { output, stdout, stderr } = recordOutput();

		await runShow(
			{
				id: `run:${RUN_NAME}`,
				json: false,
				runsDirectory: fixture.runsDirectory,
				checkout: fixture.checkoutPath,
			},
			output,
		);

		expect(stdout).toEqual([`${fixture.checkoutPath}\n`]);
		expect(stderr).toEqual([]);
		const head = await runCommand(
			["git", "rev-parse", "HEAD"],
			fixture.checkoutPath,
		);
		expect(head.trim()).toBe(fixture.resultSha);
	});

	it("refuses a directory that already exists and creates no worktree", async () => {
		const fixture = await retainedRun();
		await Bun.write(join(fixture.checkoutPath, "already"), "there\n");
		const { output, stdout } = recordOutput();

		const failure = await failureOf(
			runShow(
				{
					id: `run:${RUN_NAME}`,
					json: false,
					runsDirectory: fixture.runsDirectory,
					checkout: fixture.checkoutPath,
				},
				output,
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain(fixture.checkoutPath);
		expect(stdout).toEqual([]);
		const worktrees = await runCommand(
			["git", "worktree", "list"],
			fixture.targetDirectory,
		);
		expect(worktrees).not.toContain(fixture.checkoutPath);
	});

	it("refuses a target holding no retention ref for the run", async () => {
		const fixture = await retainedRun();
		await runCommand(
			["git", "update-ref", "-d", `refs/rehearse/${RUN_NAME}`],
			fixture.targetDirectory,
		);
		const { output } = recordOutput();

		const failure = await failureOf(
			runShow(
				{
					id: `run:${RUN_NAME}`,
					json: false,
					runsDirectory: fixture.runsDirectory,
					checkout: fixture.checkoutPath,
				},
				output,
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain(`refs/rehearse/${RUN_NAME}`);
	});

	/**
	 * A repository the artifact names and the command cannot read is not a run
	 * that retained nothing: the candidate may be intact under a different
	 * path. Saying so is the difference between going to find the repository
	 * and re-running the benchmark.
	 */
	it("refuses a target repository it cannot read, naming the path", async () => {
		const fixture = await retainedRun();
		await rm(fixture.targetDirectory, { force: true, recursive: true });
		const { output } = recordOutput();

		const failure = await failureOf(
			runShow(
				{
					id: `run:${RUN_NAME}`,
					json: false,
					runsDirectory: fixture.runsDirectory,
					checkout: fixture.checkoutPath,
				},
				output,
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain(fixture.targetDirectory);
		expect(failure.message).not.toContain("retained no candidate");
	});

	it("refuses --checkout on an id that is not a run", async () => {
		const fixture = await retainedRun();
		const { output } = recordOutput();

		const failure = await failureOf(
			runShow(
				{
					id: `case:${DEFAULT_CASE_ID}`,
					json: false,
					runsDirectory: fixture.runsDirectory,
					checkout: fixture.checkoutPath,
				},
				output,
			),
		);

		expect(failure).toBeInstanceOf(UsageError);
		expect(failure.message).toContain("--checkout");
		expect(failure.message).toContain("run id");
	});

	it("accepts the run under a bare name as well as run:<name>", async () => {
		const fixture = await retainedRun();
		const { output, stdout } = recordOutput();

		await runShow(
			{
				id: RUN_NAME,
				json: false,
				runsDirectory: fixture.runsDirectory,
				checkout: fixture.checkoutPath,
			},
			output,
		);

		expect(stdout).toEqual([`${fixture.checkoutPath}\n`]);
	});
});
