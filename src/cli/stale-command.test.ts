import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	directorySource,
	liveStageSettings,
	RecordedRunsFixture,
} from "#benchmark/run-records-test-support";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import { runStale } from "#cli/stale-command";
import { CorpusConfigurationError } from "#benchmark/corpus-file";

const HALF_WRITTEN_UUID = "0f6b6f2a-0000-4000-8000-00000000000f";
const SMOKE_ATTEMPT =
	"attempt:session:smoke/0f6b6f2a-0000-4000-8000-000000000001";
const REPLAY_ATTEMPT = "attempt:stage:lineage-discuss/2026-09-03T01-00-00.000Z";

async function treeOf(root: string): Promise<readonly string[]> {
	const entries = await readdir(root, { recursive: true });

	return entries.toSorted((left, right) => (left < right ? -1 : 1));
}

describe(runStale.name, () => {
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
		const root = await temporaryDirectory("rehearse-stale-cli-corpus-");
		for (const skill of ["build", "discuss", "doctrine"]) {
			await mkdir(join(root, "skills", skill), { recursive: true });
			await Bun.write(
				join(root, "skills", skill, "SKILL.md"),
				skill === "build" ? buildSkill : `${skill} skill\n`,
			);
		}
		await mkdir(join(root, "output-styles"), { recursive: true });
		await Bun.write(join(root, "output-styles", "brief.md"), "brief style\n");
		await Bun.write(join(root, "CLAUDE.md"), "the instructions\n");

		return root;
	}

	/**
	 * Records the live root settings digest, because the checkpoint assertions
	 * below read staleness and `deriveStaleness` compares the recorded digest
	 * against the one it loads from that file.
	 */
	async function fixtureRecordedAgainst(
		corpusRoot: string,
	): Promise<RecordedRunsFixture> {
		const root = await temporaryDirectory("rehearse-stale-cli-");
		const fixture = new RecordedRunsFixture(root, {
			settingsFile: await liveStageSettings(),
		});
		await fixture.write();
		await fixture.recordCorpusFrom(directorySource(corpusRoot));
		await fixture.recordReplayFrom(directorySource(corpusRoot));
		await fixture.writeAttemptReading(corpusRoot, "smoke", [
			"output-styles/brief.md",
		]);

		return fixture;
	}

	it("classifies invalid live corpus configuration as a refused precondition", async () => {
		const failure = await failureOf(
			runStale(
				{ corpus: undefined, runsDirectory: "/unused" },
				{
					output: recordOutput().output,
					resolveCorpus: () =>
						Promise.reject(
							new CorpusConfigurationError("invalid backing root"),
						),
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain("invalid backing root");
	});

	it("names each stale checkpoint with its causes, and no fresh one", async () => {
		const fixture = await fixtureRecordedAgainst(
			await corpusDirectory("build skill\n"),
		);
		const recorder = recordOutput();

		await runStale(
			{
				corpus: await corpusDirectory("build skill, edited\n"),
				runsDirectory: fixture.runsDirectory,
			},
			{ output: recorder.output },
		);

		const printed = recorder.stdout.join("").trimEnd().split("\n");
		expect(printed.map((printedLine) => printedLine.split("\t")[0])).toEqual([
			`checkpoint:${fixture.replayableRun}/build`,
			REPLAY_ATTEMPT,
		]);
		expect(printed.at(0)).toContain("skills/build/SKILL.md changed");
	});

	it("names a stale checkpoint by its short id beside its Record ID", async () => {
		const fixture = await fixtureRecordedAgainst(
			await corpusDirectory("build skill\n"),
		);
		await fixture.claim("audit-log", fixture.auditLogClaims);
		const recorder = recordOutput();

		await runStale(
			{
				corpus: await corpusDirectory("build skill, edited\n"),
				runsDirectory: fixture.runsDirectory,
			},
			{ output: recorder.output },
		);

		expect(recorder.stdout.join("").trimEnd().split("\n")).toEqual([
			`checkpoint:${fixture.replayableRun}/build\taudit-log/r2/s2\tdistance not recorded\tskills/build/SKILL.md changed`,
			`${REPLAY_ATTEMPT}\taudit-log/r3\tdistance not recorded\tskills/build/SKILL.md changed`,
		]);
	});

	it("prints how many versions a stale checkpoint sits behind the corpus under test", async () => {
		const corpus = await corpusDirectory("build skill\n");
		const fixture = await fixtureRecordedAgainst(corpus);
		await fixture.recordVersionFrom(directorySource(corpus));
		await Bun.write(
			join(corpus, "skills", "build", "SKILL.md"),
			"build skill, edited\n",
		);
		const recorder = recordOutput();

		await runStale(
			{ corpus, runsDirectory: fixture.runsDirectory },
			{ output: recorder.output },
		);

		expect(recorder.stdout.join("").trimEnd().split("\n")).toEqual([
			`checkpoint:${fixture.replayableRun}/build\t-\tdistance 1\tskills/build/SKILL.md changed`,
			`${REPLAY_ATTEMPT}\t-\tdistance 1\tskills/build/SKILL.md changed`,
		]);
	});

	it("names no checkpoint when the corpus holds the recorded bytes", async () => {
		const corpus = await corpusDirectory("build skill\n");
		const fixture = await fixtureRecordedAgainst(corpus);
		const recorder = recordOutput();

		await runStale(
			{
				corpus,
				runsDirectory: fixture.runsDirectory,
			},
			{ output: recorder.output },
		);

		expect(recorder.stdout).toEqual([]);
	});

	it("names an initial-only stopped run when its settings are stale", async () => {
		const corpus = await corpusDirectory("build skill\n");
		const fixture = await fixtureRecordedAgainst(corpus);
		await fixture.writeStoppedRun();
		await fixture.writeInitialCheckpoint(fixture.stoppedRun, {
			path: "stage-settings.json",
			sha256: "0".repeat(64),
		});
		const recorder = recordOutput();

		await runStale(
			{ corpus, runsDirectory: fixture.runsDirectory },
			{ output: recorder.output },
		);

		expect(recorder.stdout.join("").trimEnd().split("\n")).toEqual([
			`checkpoint:${fixture.stoppedRun}/initial\t-\tdistance not recorded\tstage settings file stage-settings.json changed`,
		]);
	});

	it("names a stale session attempt beside the stale checkpoints", async () => {
		const fixture = await fixtureRecordedAgainst(
			await corpusDirectory("build skill\n"),
		);
		const edited = await corpusDirectory("build skill, edited\n");
		await Bun.write(
			join(edited, "output-styles", "brief.md"),
			"brief style, edited\n",
		);
		const recorder = recordOutput();

		await runStale(
			{
				corpus: edited,
				runsDirectory: fixture.runsDirectory,
			},
			{ output: recorder.output },
		);

		// An output style joins every stage's corpus, the same as a global
		// skill: editing it stales the discuss checkpoint too, not only build's.
		const printed = recorder.stdout.join("").trimEnd().split("\n");
		expect(printed.map((line) => line.split("\t")[0])).toEqual([
			`checkpoint:${fixture.replayableRun}/discuss`,
			`checkpoint:${fixture.replayableRun}/build`,
			SMOKE_ATTEMPT,
			REPLAY_ATTEMPT,
		]);
		expect(printed.at(0)).toContain("output-styles/brief.md changed");
		expect(printed.at(2)).toContain("output-styles/brief.md changed");
	});

	it("starts no session, runs no command, and writes no file", async () => {
		const corpus = await corpusDirectory("build skill, edited\n");
		const fixture = await fixtureRecordedAgainst(
			await corpusDirectory("build skill\n"),
		);
		const before = await treeOf(fixture.runsDirectory);

		await runStale(
			{
				corpus,
				runsDirectory: fixture.runsDirectory,
			},
			{ output: recordOutput().output },
		);

		expect(await treeOf(fixture.runsDirectory)).toEqual(before);
	});

	describe("when the session names a model the run was not recorded at", () => {
		it("names every checkpoint stale on the model, corpus unchanged", async () => {
			const corpus = await corpusDirectory("build skill\n");
			const fixture = await fixtureRecordedAgainst(corpus);
			const recorder = recordOutput();

			await runStale(
				{
					corpus,
					model: "opus",
					effort: undefined,
					runsDirectory: fixture.runsDirectory,
				},
				{ output: recorder.output },
			);

			const printed = recorder.stdout.join("").trimEnd().split("\n");
			expect(printed.map((line) => line.split("\t")[0])).toEqual([
				`checkpoint:${fixture.replayableRun}/discuss`,
				`checkpoint:${fixture.replayableRun}/build`,
				REPLAY_ATTEMPT,
			]);
			expect(printed.at(0)).toContain("model sonnet is now opus");
			expect(printed.at(2)).toContain("model sonnet is now opus");
		});
	});

	describe("when one attempt record cannot be read", () => {
		it("still prints the stale checkpoints and names it on stderr", async () => {
			const fixture = await fixtureRecordedAgainst(
				await corpusDirectory("build skill\n"),
			);
			await fixture.writeUnreadableAttempt("smoke", HALF_WRITTEN_UUID);
			const recorder = recordOutput();

			await runStale(
				{
					corpus: await corpusDirectory("build skill, edited\n"),
					runsDirectory: fixture.runsDirectory,
				},
				{ output: recorder.output },
			);

			expect(
				recorder.stdout
					.join("")
					.trimEnd()
					.split("\n")
					.map((printed) => printed.split("\t")[0]),
			).toEqual([`checkpoint:${fixture.replayableRun}/build`, REPLAY_ATTEMPT]);
			expect(recorder.stderr.join("")).toContain(
				`attempt:session:smoke/${HALF_WRITTEN_UUID}`,
			);
		});
	});

	describe("when the corpus holds no CLAUDE.md", () => {
		it("answers for the session cases when no run recorded a checkpoint", async () => {
			const root = await temporaryDirectory("rehearse-stale-cases-only-");
			const fixture = new RecordedRunsFixture(root);
			await fixture.writeAttemptReading(
				await corpusDirectory("build skill\n"),
				"smoke",
				["output-styles/brief.md"],
			);
			const styles = await temporaryDirectory("rehearse-stale-styles-");
			await Bun.write(
				join(styles, "output-styles", "brief.md"),
				"brief style, edited\n",
			);
			const recorder = recordOutput();

			await runStale(
				{ corpus: styles, runsDirectory: root },
				{ output: recorder.output },
			);

			expect(recorder.stdout.join("").trimEnd().split("\n")).toEqual([
				`${SMOKE_ATTEMPT}\t-\tdistance not recorded\toutput-styles/brief.md changed`,
			]);
		});

		it("names no absolute filesystem path when the corpus lacks the declared file", async () => {
			const root = await temporaryDirectory("rehearse-stale-cli-missing-");
			const fixture = new RecordedRunsFixture(root);
			await fixture.writeAttemptReading(
				await corpusDirectory("build skill\n"),
				"smoke",
				["output-styles/brief.md"],
			);
			const empty = await temporaryDirectory("rehearse-stale-cli-empty-");
			await Bun.write(join(empty, "CLAUDE.md"), "the instructions\n");
			const recorder = recordOutput();

			await runStale(
				{ corpus: empty, runsDirectory: root },
				{ output: recorder.output },
			);

			expect(recorder.stdout.join("")).toContain(SMOKE_ATTEMPT);
			expect(recorder.stdout.join("")).not.toContain(empty);
		});

		describe("and a run recorded a checkpoint", () => {
			/**
			 * Every checkpoint hashed an instruction file, so a corpus that has
			 * none cannot reproduce any of them. That is what the command exists
			 * to report, and it is the same answer its other half already gives a
			 * case whose declared file the corpus lacks, so it is a cause here
			 * too rather than a refusal that takes every other record with it.
			 */
			it("names the instruction file the corpus lacks as a cause", async () => {
				const corpus = await corpusDirectory("build skill\n");
				const fixture = await fixtureRecordedAgainst(corpus);
				const styles = await temporaryDirectory("rehearse-stale-styles-only-");
				await Bun.write(
					join(styles, "output-styles", "brief.md"),
					"brief style\n",
				);
				const recorder = recordOutput();

				await runStale(
					{ corpus: styles, runsDirectory: fixture.runsDirectory },
					{ output: recorder.output },
				);

				const printed = recorder.stdout.join("");
				expect(printed).toContain(`checkpoint:${fixture.replayableRun}/build`);
				expect(printed).toContain(
					"Corpus file CLAUDE.md is not in the corpus under test",
				);
				expect(printed).not.toContain(styles);
			});
		});
	});

	describe("when no --corpus is given, which is the live install", () => {
		/**
		 * The branch a user gets by typing `rehearse stale`. Every other test
		 * hands it a directory, and this one differs: the source resolves to the
		 * live install and the instructions come from the control repository.
		 */
		it("compares a case against the live install, not a corpus root", async () => {
			const root = await temporaryDirectory("rehearse-stale-live-cli-");
			const fixture = new RecordedRunsFixture(root);
			await fixture.writeAttemptReading(
				await corpusDirectory("build skill\n"),
				"smoke",
				["output-styles/brief.md"],
			);
			const recorder = recordOutput();

			await runStale(
				{ corpus: undefined, runsDirectory: root },
				{ output: recorder.output },
			);

			expect(recorder.stdout.join("")).toContain(SMOKE_ATTEMPT);
			expect(recorder.stdout.join("")).toContain("output-styles/brief.md");
		});
	});

	describe("when --corpus names a directory that does not exist", () => {
		it("refuses the precondition and prints nothing on stdout", async () => {
			const fixture = await fixtureRecordedAgainst(
				await corpusDirectory("build skill\n"),
			);
			const recorder = recordOutput();

			const failure = await failureOf(
				runStale(
					{
						corpus: join(await temporaryDirectory("rehearse-absent-"), "gone"),
						model: undefined,
						effort: undefined,
						runsDirectory: fixture.runsDirectory,
					},
					{ output: recorder.output },
				),
			);

			expect(failure).toBeInstanceOf(RefusedPreconditionError);
			expect(failure.message).toContain("gone");
			expect(recorder.stdout).toEqual([]);
		});
	});
	describe("when a corpus layout directory holds a symlink out of the tree", () => {
		it("prints the records it could derive rather than refusing the whole report", async () => {
			const corpus = await corpusDirectory("build skill\n");
			const fixture = await fixtureRecordedAgainst(corpus);
			await symlink(
				join(corpus, "CLAUDE.md"),
				join(corpus, "skills", "build", "escape.md"),
			);
			const recorder = recordOutput();

			await runStale(
				{ corpus, runsDirectory: fixture.runsDirectory },
				{ output: recorder.output },
			);

			expect(recorder.stdout.join("")).toContain(
				`checkpoint:${fixture.replayableRun}/build`,
			);
		});

		it("names the entry that could not be hashed as the cause", async () => {
			const corpus = await corpusDirectory("build skill\n");
			const fixture = await fixtureRecordedAgainst(corpus);
			await symlink(
				join(corpus, "CLAUDE.md"),
				join(corpus, "skills", "build", "escape.md"),
			);
			const recorder = recordOutput();

			await runStale(
				{ corpus, runsDirectory: fixture.runsDirectory },
				{ output: recorder.output },
			);

			expect(recorder.stdout.join("")).toContain("skills/build/escape.md");
		});
	});

	it("names a CLAUDE.md that is a symlink out of the root as a cause, carrying neither its target nor its bytes", async () => {
		const fixture = await fixtureRecordedAgainst(
			await corpusDirectory("build skill\n"),
		);
		const linked = await corpusDirectory("build skill\n");
		const outside = await temporaryDirectory("rehearse-stale-cli-outside-");
		await Bun.write(join(outside, "secret.md"), "SECRET BYTES\n");
		await rm(join(linked, "CLAUDE.md"));
		await symlink(join(outside, "secret.md"), join(linked, "CLAUDE.md"));
		const recorder = recordOutput();

		await runStale(
			{ corpus: linked, runsDirectory: fixture.runsDirectory },
			{ output: recorder.output },
		);

		const printed = recorder.stdout.join("");
		expect(printed).toContain(`checkpoint:${fixture.replayableRun}/build`);
		expect(printed).toContain("CLAUDE.md resolves outside the corpus source");
		expect(printed).not.toContain("SECRET BYTES");
		expect(printed).not.toContain(outside);
	});
});
