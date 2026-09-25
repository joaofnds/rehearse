import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DirectoryCorpusRoot } from "#benchmark/corpus-file";
import { measureCorpusVersion } from "#benchmark/corpus-version";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { UsageError } from "#cli/commands";
import { runCorpusShow, runCorpusVersions } from "#cli/corpus-command";
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

async function measureThenEdit(): Promise<readonly string[]> {
	const digests: string[] = [];
	for (const text of ["brief\n", "edited\n"]) {
		await writeFile(join(source.root, "output-styles", "brief.md"), text);
		const measurement = await measureCorpusVersion(runsDirectory, source);
		if (measurement.kind === "version") {
			digests.push(measurement.digest);
		}
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
		const digests = await measureThenEdit();

		const failure = await failureOf(
			runCorpusShow(
				{ version: "corpus@", file: undefined, runsDirectory },
				recordOutput().output,
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		for (const digest of digests) {
			expect(failure.message).toContain(digest);
		}
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
