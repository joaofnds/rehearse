import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { recordsDirectory } from "#benchmark/config";
import { liveCorpusSource, resolveCorpusFile } from "#benchmark/corpus-file";
import {
	CorpusSourceError,
	corpusLayoutEntries,
	linkCorpus,
	linkedCorpusSource,
	resolveCorpusSource,
	unlinkCorpus,
} from "#benchmark/corpus-source";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { UNLINK_CORPUS_COMMAND } from "#benchmark/settings";
import { TestResources } from "#benchmark/test-support";
import { failureOf } from "#cli/cli-test-support";

const resources = TestResources.forEachTest();

async function directoryCorpus(): Promise<string> {
	const root = await resources.createControlDirectory();
	await Bun.write(join(root, "output-styles/brief.md"), "variant\n");

	return root;
}

describe(resolveCorpusSource.name, () => {
	it("resolves a directory source to a directory-kind source rooted there", async () => {
		const root = await directoryCorpus();

		const source = await resolveCorpusSource(root);

		expect(source.kind).toBe("directory");
		expect(source.root).toBe(root);
	});

	it("resolves an absent source to the live install", async () => {
		const source = await resolveCorpusSource(undefined);

		expect(source).toEqual({
			kind: "live",
			root: join(homedir(), ".claude"),
			backingRoot: join(homedir(), ".agents"),
		});
	});
});

describe("resolving the corpus nobody names", () => {
	afterEach(async () => {
		await unlinkCorpus(recordsDirectory());
	});

	it("resolves to the linked directory", async () => {
		const root = await directoryCorpus();
		await linkCorpus(recordsDirectory(), root);

		const source = await resolveCorpusSource(undefined);

		expect(source).toEqual({ kind: "directory", root });
	});

	it("resolves to the live install once the corpus is unlinked", async () => {
		await linkCorpus(recordsDirectory(), await directoryCorpus());

		await unlinkCorpus(recordsDirectory());

		expect(await resolveCorpusSource(undefined)).toEqual(liveCorpusSource());
	});

	it("refuses a linked directory that is gone, naming the command that unlinks it", async () => {
		const root = await directoryCorpus();
		await linkCorpus(recordsDirectory(), root);
		await rm(root, { recursive: true });

		const failure = await failureOf(resolveCorpusSource(undefined));

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain(root);
		expect(failure.message).toContain(UNLINK_CORPUS_COMMAND);
	});
});

describe(linkCorpus.name, () => {
	async function records(): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-link-"));
		resources.track(directory);

		return directory;
	}

	it("stores the directory as the linked corpus", async () => {
		const directory = await records();
		const root = await directoryCorpus();

		await linkCorpus(directory, root);

		expect(await linkedCorpusSource(directory)).toEqual({
			kind: "directory",
			root,
		});
	});

	it("leaves the live install linked in records that never linked one", async () => {
		expect(await linkedCorpusSource(await records())).toEqual(
			liveCorpusSource(),
		);
	});

	it("refuses a directory holding no corpus and keeps the link it had", async () => {
		const directory = await records();
		const root = await directoryCorpus();
		await linkCorpus(directory, root);
		const notCorpus = await resources.createControlDirectory();

		const failure = await failureOf(linkCorpus(directory, notCorpus));

		expect(failure).toBeInstanceOf(CorpusSourceError);
		expect(await linkedCorpusSource(directory)).toEqual({
			kind: "directory",
			root,
		});
	});
});

describe("refusing a source that names no corpus", () => {
	it("refuses a directory that does not exist, naming the root", async () => {
		const failure = await failureOf(
			resolveCorpusSource("/no/such/corpus/directory"),
		);

		expect(failure).toBeInstanceOf(CorpusSourceError);
		expect(failure.message).toContain("/no/such/corpus/directory");
		expect(failure.message).toContain("directory in corpus layout");
	});

	it("refuses a directory holding none of the corpus layout entries, naming the root", async () => {
		const root = await resources.createControlDirectory();
		await Bun.write(join(root, "notes.md"), "not corpus\n");

		const failure = await failureOf(resolveCorpusSource(root));

		expect(failure).toBeInstanceOf(CorpusSourceError);
		expect(failure.message).toContain(root);
	});

	it.each([
		"CLAUDE.md",
		"skills/build/SKILL.md",
		"agents/reviewer.md",
		"rulebook/coding-style.md",
	])("accepts a directory holding %s alone", async (layoutPath) => {
		const root = await resources.createControlDirectory();
		await Bun.write(join(root, layoutPath), "corpus\n");

		const source = await resolveCorpusSource(root);

		expect(source.kind).toBe("directory");
	});

	/**
	 * A corpus source is a directory in corpus layout. Anything else is refused
	 * in those terms, so a source naming some other scheme is told what a corpus
	 * source is rather than what it is not.
	 */
	it.each(["dotfiles:HEAD", "git://example.com/corpus", "scheme:"])(
		"refuses %p, naming the source and what a corpus source is",
		async (source) => {
			const failure = await failureOf(resolveCorpusSource(source));

			expect(failure).toBeInstanceOf(CorpusSourceError);
			expect(failure.message).toContain(source);
			expect(failure.message).toContain("directory in corpus layout");
		},
	);
});

describe("resolving a corpus file against a source", () => {
	it("reads a layout path from the directory source's root", async () => {
		const root = await directoryCorpus();

		expect(
			resolveCorpusFile(
				await resolveCorpusSource(root),
				"output-styles/brief.md",
			),
		).toBe(join(root, "output-styles/brief.md"));
	});

	it("reads a layout path from the live install when the source is live", async () => {
		expect(
			resolveCorpusFile(
				await resolveCorpusSource(undefined),
				"output-styles/brief.md",
			),
		).toBe(join(homedir(), ".claude/output-styles/brief.md"));
	});
});

describe(corpusLayoutEntries.name, () => {
	/**
	 * A home tree is not corpus layout. The enumerator reads corpus layout and
	 * nothing else, so a source carrying both a home tree's `.agents/skills` and
	 * a corpus's `skills` yields only the corpus one.
	 */
	it("enumerates the corpus layout entry and not the home tree beside it", async () => {
		const root = await resources.createControlDirectory();
		await Bun.write(join(root, ".agents/skills/style/SKILL.md"), "home tree\n");
		await Bun.write(join(root, "skills/style/SKILL.md"), "corpus\n");

		const entries = await corpusLayoutEntries(await resolveCorpusSource(root));

		expect(entries).toEqual([
			{ layoutPath: "skills/style", sourcePath: join(root, "skills/style") },
		]);
	});

	/**
	 * The corpus instructions live at the root of corpus layout. A source keeping
	 * a CLAUDE.md anywhere else is carrying a file this corpus does not declare.
	 */
	it("enumerates no instructions entry for a CLAUDE.md kept under .claude", async () => {
		const root = await resources.createControlDirectory();
		await Bun.write(join(root, "output-styles/brief.md"), "variant\n");
		await Bun.write(join(root, ".claude/CLAUDE.md"), "home tree\n");

		const entries = await corpusLayoutEntries(await resolveCorpusSource(root));

		expect(entries.map((entry) => entry.layoutPath)).not.toContain("CLAUDE.md");
	});

	it("lists a directory source's own layout entries", async () => {
		const root = await resources.createControlDirectory();
		await Bun.write(join(root, "output-styles/brief.md"), "variant\n");
		await Bun.write(join(root, "CLAUDE.md"), "instructions\n");

		const entries = await corpusLayoutEntries(await resolveCorpusSource(root));

		expect(entries.map((entry) => entry.layoutPath).toSorted()).toEqual([
			"CLAUDE.md",
			"output-styles/brief.md",
		]);
	});
});
