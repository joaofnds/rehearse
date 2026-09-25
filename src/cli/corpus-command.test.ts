import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DirectoryCorpusRoot } from "#benchmark/corpus-file";
import { measureCorpusVersion } from "#benchmark/corpus-version";
import {
	liveStageSettings,
	RecordedRunsFixture,
} from "#benchmark/run-records-test-support";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { UsageError } from "#cli/commands";
import {
	runCorpusInvalidation,
	runCorpusShow,
	runCorpusVersions,
} from "#cli/corpus-command";
import { RefusedPreconditionError } from "#cli/interactive-stdin";

let scratch: string;
let runsDirectory: string;
let source: DirectoryCorpusRoot;

beforeEach(async () => {
	scratch = await mkdtemp(join(tmpdir(), "rehearse-corpus-command-"));
	runsDirectory = join(scratch, "records");
	source = { kind: "directory", root: join(scratch, "corpus") };
	await mkdir(join(source.root, "output-styles"), { recursive: true });
	await writeFile(join(source.root, "CLAUDE.md"), "instructions\n");
	await writeFile(join(source.root, "output-styles", "brief.md"), "brief\n");
});

afterEach(async () => {
	await rm(scratch, { recursive: true, force: true });
});

async function measureThenEdit(
	edited = "edited\n",
): Promise<readonly string[]> {
	const digests: string[] = [];
	for (const text of ["brief\n", edited]) {
		await writeFile(join(source.root, "output-styles", "brief.md"), text);
		const measurement = await measureCorpusVersion(runsDirectory, source);
		if (measurement.kind !== "version") {
			throw new Error(`expected a version, got ${measurement.refusal}`);
		}
		digests.push(measurement.digest);
	}

	return digests;
}

describe(runCorpusVersions.name, () => {
	it("lists the named source's versions in log order by their corpus@ labels", async () => {
		const [first = "", second = ""] = await measureThenEdit();
		const recorder = recordOutput();

		await runCorpusVersions(
			{ corpus: source.root, runsDirectory },
			{ output: recorder.output },
		);

		expect(recorder.stdout.join("")).toBe(
			`1\tcorpus@${first.slice(0, 6)}\t${first}\n2\tcorpus@${second.slice(0, 6)}\t${second}\n`,
		);
	});

	it("refuses a corpus source that is not a directory in corpus layout", async () => {
		const failure = await failureOf(
			runCorpusVersions(
				{ corpus: join(scratch, "absent"), runsDirectory },
				{ output: recordOutput().output },
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
	});
});

describe(runCorpusInvalidation.name, () => {
	it("prints each file's read-by and invalidated counts, then the rows the last edit invalidated by id", async () => {
		// The fixture's replay also read the build skill and its session
		// attempt the brief style, so each is read by two distinct rows.
		await mkdir(join(source.root, "skills", "build"), { recursive: true });
		await mkdir(join(source.root, "skills", "discuss"), { recursive: true });
		await writeFile(
			join(source.root, "skills", "build", "SKILL.md"),
			"build\n",
		);
		await writeFile(
			join(source.root, "skills", "discuss", "SKILL.md"),
			"discuss\n",
		);
		const fixture = new RecordedRunsFixture(runsDirectory, {
			settingsFile: await liveStageSettings(),
		});
		await fixture.write();
		await fixture.recordCorpusFrom(source);
		const measured = await fixture.recordVersionFrom(source);
		const previous = measured.kind === "version" ? measured.digest : "";
		await writeFile(
			join(source.root, "skills", "build", "SKILL.md"),
			"build, edited\n",
		);
		const recorder = recordOutput();

		await runCorpusInvalidation(
			{ corpus: source.root, runsDirectory },
			{ output: recorder.output },
		);

		expect(recorder.stdout.join("")).toBe(
			[
				"1\t0\tCLAUDE.md\n",
				"2\t1\tskills/build/SKILL.md\n",
				"1\t0\tskills/discuss/SKILL.md\n",
				"2\t0\toutput-styles/brief.md\n",
				`last edit from corpus@${previous.slice(0, 6)} invalidated 1 row\n`,
				`run:${fixture.replayableRun}\n`,
			].join(""),
		);
	});

	it("says the last edit is not recorded when the log holds no earlier version", async () => {
		const recorder = recordOutput();

		await runCorpusInvalidation(
			{ corpus: source.root, runsDirectory },
			{ output: recorder.output },
		);

		expect(recorder.stdout.join("")).toBe(
			"0\t0\tCLAUDE.md\n0\t0\toutput-styles/brief.md\nlast edit not recorded: the corpus under test has no earlier version in its log to compare against\n",
		);
	});
});

describe(runCorpusShow.name, () => {
	it("prints a file's bytes as an older version held them, after the source changed", async () => {
		const [first = ""] = await measureThenEdit();
		const recorder = recordOutput();

		await runCorpusShow(
			{
				version: `corpus@${first.slice(0, 6)}`,
				file: "output-styles/brief.md",
				runsDirectory,
			},
			recorder.output,
		);

		expect(recorder.stdout.join("")).toBe("brief\n");
	});

	it("lists a version's files with their hashes when no file is named", async () => {
		const [first = ""] = await measureThenEdit();
		const recorder = recordOutput();

		await runCorpusShow(
			{ version: first.slice(0, 6), file: undefined, runsDirectory },
			recorder.output,
		);

		expect(recorder.stdout.join("")).toMatch(
			/^[0-9a-f]{64}\tCLAUDE\.md\n[0-9a-f]{64}\toutput-styles\/brief\.md\n$/u,
		);
	});

	it("refuses a prefix several versions share, naming each candidate", async () => {
		// Both versions of this fixed tree start with "d".
		await measureThenEdit("edit 4\n");

		const failure = await failureOf(
			runCorpusShow(
				{ version: "corpus@d", file: undefined, runsDirectory },
				recordOutput().output,
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toBe(
			"Corpus version corpus@d is ambiguous; it matches d86658fcc2d40b287a828747950f2d2ec902111a794516b112ff0e90dfd3842c, dcae610193682abd5ab633e4fd0773af6cb7b86abb09e2c671cc520234c23849",
		);
	});

	it("refuses a prefix no version starts with", async () => {
		await measureThenEdit();

		const failure = await failureOf(
			runCorpusShow(
				{ version: "corpus@zzzzzz", file: undefined, runsDirectory },
				recordOutput().output,
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
	});

	it("refuses a file the version does not hold", async () => {
		const [first = ""] = await measureThenEdit();

		const failure = await failureOf(
			runCorpusShow(
				{ version: first, file: "skills/absent.md", runsDirectory },
				recordOutput().output,
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
	});

	it("takes the version as a usage error when none is given", async () => {
		const failure = await failureOf(
			runCorpusShow(
				{ version: undefined, file: undefined, runsDirectory },
				recordOutput().output,
			),
		);

		expect(failure).toBeInstanceOf(UsageError);
	});
});
