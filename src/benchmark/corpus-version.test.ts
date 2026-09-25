import { afterEach, beforeEach, describe, expect, it } from "bun:test";
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
import type { CorpusRoot } from "./corpus-file";
import {
	corpusVersionDigest,
	corpusVersionLog,
	CorpusVersionError,
	findCorpusVersion,
	measureCorpusVersion,
	readCorpusVersion,
	readCorpusVersionFile,
} from "./corpus-version";

let scratch: string;
let recordsDirectory: string;
let source: CorpusRoot;

beforeEach(async () => {
	scratch = await mkdtemp(join(tmpdir(), "rehearse-corpus-version-"));
	recordsDirectory = join(scratch, "records");
	source = { kind: "directory", root: join(scratch, "corpus") };
	await mkdir(join(source.root, "output-styles"), { recursive: true });
	await writeFile(join(source.root, "CLAUDE.md"), "instructions\n");
	await writeFile(join(source.root, "output-styles", "brief.md"), "brief\n");
});

afterEach(async () => {
	await rm(scratch, { recursive: true, force: true });
});

function versionDigest(
	measurement: Awaited<ReturnType<typeof measureCorpusVersion>>,
): string {
	if (measurement.kind !== "version") {
		throw new Error(`expected a version, got ${measurement.refusal}`);
	}

	return measurement.digest;
}

describe(measureCorpusVersion.name, () => {
	it("logs two measured states in the order they were measured", async () => {
		const first = versionDigest(
			await measureCorpusVersion(recordsDirectory, source),
		);
		await writeFile(join(source.root, "output-styles", "brief.md"), "edited\n");

		const second = versionDigest(
			await measureCorpusVersion(recordsDirectory, source),
		);

		expect(await corpusVersionLog(recordsDirectory, source)).toEqual([
			first,
			second,
		]);
	});

	it("keeps a version's file bytes after the source file is rewritten", async () => {
		const first = versionDigest(
			await measureCorpusVersion(recordsDirectory, source),
		);
		await writeFile(join(source.root, "output-styles", "brief.md"), "edited\n");

		const bytes = await readCorpusVersionFile(
			recordsDirectory,
			first,
			"output-styles/brief.md",
		);

		expect(new TextDecoder().decode(bytes)).toBe("brief\n");
	});

	it("adds no entry when the source has not changed since the latest one", async () => {
		const first = versionDigest(
			await measureCorpusVersion(recordsDirectory, source),
		);

		await measureCorpusVersion(recordsDirectory, source);

		expect(await corpusVersionLog(recordsDirectory, source)).toEqual([first]);
	});

	it("logs a revert as a new entry, since order is position rather than identity", async () => {
		const first = versionDigest(
			await measureCorpusVersion(recordsDirectory, source),
		);
		await writeFile(join(source.root, "output-styles", "brief.md"), "edited\n");
		const second = versionDigest(
			await measureCorpusVersion(recordsDirectory, source),
		);
		await writeFile(join(source.root, "output-styles", "brief.md"), "brief\n");

		await measureCorpusVersion(recordsDirectory, source);

		expect(await corpusVersionLog(recordsDirectory, source)).toEqual([
			first,
			second,
			first,
		]);
	});

	it("adds one entry when several processes measure one new state at once", async () => {
		const script = `
			import { measureCorpusVersion } from ${JSON.stringify(join(import.meta.dir, "corpus-version.ts"))};
			await measureCorpusVersion(${JSON.stringify(recordsDirectory)}, ${JSON.stringify(source)});
		`;

		const exits = await Promise.all(
			Array.from(
				{ length: 6 },
				() => Bun.spawn(["bun", "-e", script], { env: { ...Bun.env } }).exited,
			),
		);

		expect(exits).toEqual([0, 0, 0, 0, 0, 0]);
		expect(await corpusVersionLog(recordsDirectory, source)).toHaveLength(1);
	});

	it("keeps logging new states after an entry goes missing", async () => {
		const first = versionDigest(
			await measureCorpusVersion(recordsDirectory, source),
		);
		await writeFile(join(source.root, "output-styles", "brief.md"), "edited\n");
		const second = versionDigest(
			await measureCorpusVersion(recordsDirectory, source),
		);
		const logs = join(recordsDirectory, "corpus-versions", "logs");
		const [log] = await readdir(logs);
		await rm(join(logs, log ?? "", "1"));
		await writeFile(join(source.root, "output-styles", "brief.md"), "again\n");

		const third = versionDigest(
			await measureCorpusVersion(recordsDirectory, source),
		);

		expect(first).not.toBe(second);
		expect(await corpusVersionLog(recordsDirectory, source)).toEqual([
			second,
			third,
		]);
	});

	it("keeps the stored file bodies readable by their owner only", async () => {
		await measureCorpusVersion(recordsDirectory, source);
		const blobs = join(recordsDirectory, "corpus-versions", "blobs");

		const names = await readdir(blobs);
		const modes = await Promise.all(
			names.map(async (blob) => {
				const found = await stat(join(blobs, blob));

				return found.mode.toString(8).slice(-3);
			}),
		);

		expect(modes).toEqual(["600", "600"]);
	});

	it("logs a source reached through a symbolic link in the log of the directory it names", async () => {
		const alias = join(scratch, "alias");
		await symlink(source.root, alias);

		const digest = versionDigest(
			await measureCorpusVersion(recordsDirectory, {
				kind: "directory",
				root: alias,
			}),
		);

		expect(await corpusVersionLog(recordsDirectory, source)).toEqual([digest]);
	});

	it("names the same tree by the digest the corpus report showed for it", async () => {
		const root = join(scratch, "report-fixture");
		await mkdir(join(root, "skills", "build"), { recursive: true });
		await mkdir(join(root, "skills", "discuss"), { recursive: true });
		await writeFile(join(root, "CLAUDE.md"), "instructions\n");
		await writeFile(join(root, "skills", "build", "SKILL.md"), "build skill\n");
		await writeFile(
			join(root, "skills", "discuss", "SKILL.md"),
			"discuss skill\n",
		);

		const digest = versionDigest(
			await measureCorpusVersion(recordsDirectory, {
				kind: "directory",
				root,
			}),
		);

		expect(digest).toStartWith("4e196b");
		expect(digest).toHaveLength(64);
	});

	describe("when a layout entry is refused", () => {
		it("yields the refusal and logs no version", async () => {
			const outside = join(scratch, "outside.md");
			await writeFile(outside, "outside\n");
			await symlink(outside, join(source.root, "output-styles", "escape.md"));

			const measurement = await measureCorpusVersion(recordsDirectory, source);

			expect(measurement).toEqual({
				kind: "refused",
				refusal:
					"output-styles/escape.md resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
			});
			expect(await corpusVersionLog(recordsDirectory, source)).toEqual([]);
		});
	});
});

describe(findCorpusVersion.name, () => {
	it("finds a version by a unique prefix of its digest, with or without the corpus@ label", async () => {
		const digest = versionDigest(
			await measureCorpusVersion(recordsDirectory, source),
		);

		const found = await Promise.all([
			findCorpusVersion(recordsDirectory, digest.slice(0, 6)),
			findCorpusVersion(recordsDirectory, `corpus@${digest.slice(0, 6)}`),
		]);

		expect(found).toEqual([
			{ kind: "found", digest },
			{ kind: "found", digest },
		]);
	});

	it("matches no version by an empty prefix, even when only one is recorded", async () => {
		await measureCorpusVersion(recordsDirectory, source);

		const found = await Promise.all([
			findCorpusVersion(recordsDirectory, ""),
			findCorpusVersion(recordsDirectory, "corpus@"),
		]);

		expect(found).toEqual([{ kind: "missing" }, { kind: "missing" }]);
	});

	it("reports a prefix no version starts with as missing", async () => {
		await measureCorpusVersion(recordsDirectory, source);

		expect(await findCorpusVersion(recordsDirectory, "corpus@zz")).toEqual({
			kind: "missing",
		});
	});

	it("names every candidate a prefix shared by several versions matches", async () => {
		const digests: string[] = [];
		for (let edit = 0; edit <= 16; edit += 1) {
			await writeFile(
				join(source.root, "output-styles", "brief.md"),
				`edit ${String(edit)}\n`,
			);
			digests.push(
				versionDigest(await measureCorpusVersion(recordsDirectory, source)),
			);
		}
		const shared = digests.find((digest) =>
			digests.some(
				(other) => other !== digest && other.startsWith(digest.slice(0, 1)),
			),
		);
		const prefix = shared?.slice(0, 1) ?? "";

		const found = await findCorpusVersion(recordsDirectory, prefix);

		expect(found).toEqual({
			kind: "ambiguous",
			candidates: digests
				.filter((digest) => digest.startsWith(prefix))
				.toSorted(),
		});
	});
});

describe(readCorpusVersion.name, () => {
	it("refuses a name that is not a full version digest before reading any file", async () => {
		await mkdir(recordsDirectory, { recursive: true });
		await writeFile(
			join(recordsDirectory, "planted.json"),
			JSON.stringify({ files: [] }),
		);

		const reading = readCorpusVersion(recordsDirectory, "../../planted");

		expect(reading).rejects.toThrow(CorpusVersionError);
	});
});

describe(corpusVersionDigest.name, () => {
	it("changes when one file's hash changes", () => {
		const before = corpusVersionDigest([
			{ path: "CLAUDE.md", sha256: "a".repeat(64) },
		]);
		const after = corpusVersionDigest([
			{ path: "CLAUDE.md", sha256: "b".repeat(64) },
		]);

		expect(after).not.toBe(before);
	});

	it("is independent of file order", () => {
		const files = [
			{ path: "CLAUDE.md", sha256: "a".repeat(64) },
			{ path: "skills/build.md", sha256: "b".repeat(64) },
		];

		expect(corpusVersionDigest(files)).toBe(
			corpusVersionDigest(files.toReversed()),
		);
	});
});
