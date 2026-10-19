import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { hashDirectory } from "#benchmark/checkpoint";
import type { ResolvedCorpusFile } from "#benchmark/corpus-file";
import { sessionLineage } from "#benchmark/session-lineage";
import { TestResources, historyFixture } from "#benchmark/test-support";

import {
	SessionLineageCaseBuilder,
	settings,
} from "./session-lineage-case-test-builder";

const SHA256_HEX_CHARACTERS = 64;

const GIT_SHA_HEX_CHARACTERS = 40;

const testResources = TestResources.forEachTest();

function corpus(sha256: string): readonly ResolvedCorpusFile[] {
	return [
		{ path: "output-styles/brief.md", resolvedPath: "/style.md", sha256 },
	];
}

const ORIGINAL = "a".repeat(SHA256_HEX_CHARACTERS);

const sessionLineageIsUnchangedWhenAFileBesideTheFixtureTreeChanges =
	async (): Promise<void> => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-lineage-"));
		testResources.track(root);
		const fixture = join(root, "fixture");
		await mkdir(fixture, { recursive: true });
		await writeFile(join(fixture, "declared.md"), "declared\n");

		const before = await sessionLineage(
			new SessionLineageCaseBuilder({ fixturePath: fixture }).build(),
			corpus(ORIGINAL),
			settings,
		);
		await writeFile(join(root, "beside.md"), "beside\n");
		const after = await sessionLineage(
			new SessionLineageCaseBuilder({ fixturePath: fixture }).build(),
			corpus(ORIGINAL),
			settings,
		);

		expect(after).toBe(before);
	};

const sessionLineageChangesWhenTheFixtureTreesBytesChange =
	async (): Promise<void> => {
		const fixture = await mkdtemp(join(tmpdir(), "rehearse-lineage-"));
		testResources.track(fixture);
		await writeFile(join(fixture, "seed.md"), "one\n");
		const before = await sessionLineage(
			new SessionLineageCaseBuilder({ fixturePath: fixture }).build(),
			corpus(ORIGINAL),
			settings,
		);

		await writeFile(join(fixture, "seed.md"), "two\n");
		const after = await sessionLineage(
			new SessionLineageCaseBuilder({ fixturePath: fixture }).build(),
			corpus(ORIGINAL),
			settings,
		);

		expect(after).not.toBe(before);
	};

const sessionLineageIsUnchangedAcrossTwoReadingsOfOneFixturesCommittedHistory =
	async (): Promise<void> => {
		const fixture = await historyFixture(["first", "second"]);
		testResources.track(fixture.path);

		const [before, after] = await Promise.all([
			sessionLineage(
				new SessionLineageCaseBuilder({ fixturePath: fixture.path }).build(),
				corpus(ORIGINAL),
				settings,
			),
			sessionLineage(
				new SessionLineageCaseBuilder({ fixturePath: fixture.path }).build(),
				corpus(ORIGINAL),
				settings,
			),
		]);

		expect(after).toBe(before);
	};

const sessionLineageChangesWhenOnlyTheFixturesCommittedHistoryChanges =
	async (): Promise<void> => {
		const fixture = await historyFixture(["first"]);
		testResources.track(fixture.path);
		const before = await sessionLineage(
			new SessionLineageCaseBuilder({ fixturePath: fixture.path }).build(),
			corpus(ORIGINAL),
			settings,
		);

		await writeFile(
			join(fixture.path, "dot-git", "refs", "heads", "main"),
			`${"0".repeat(GIT_SHA_HEX_CHARACTERS)}\n`,
		);

		const after = await sessionLineage(
			new SessionLineageCaseBuilder({ fixturePath: fixture.path }).build(),
			corpus(ORIGINAL),
			settings,
		);

		expect(after).not.toBe(before);
	};

const sessionLineageHashesEveryFileTheFixturesCommittedHistoryHolds =
	async (): Promise<void> => {
		const lowerBoundForHistoryCount = 0;

		const fixture = await historyFixture(["first"]);
		testResources.track(fixture.path);

		const hashed = await hashDirectory(fixture.path, "", {
			rootMayBeALink: false,
		});

		const history = hashed
			.map((file) => file.path)
			.filter((path) => path.startsWith("dot-git/"));

		expect(history.length).toBeGreaterThan(lowerBoundForHistoryCount);
		const onDisk = await readdir(join(fixture.path, "dot-git"), {
			recursive: true,
			withFileTypes: true,
		});
		expect(new Set(history)).toEqual(
			new Set(
				onDisk
					.filter((entry) => entry.isFile())
					.map((entry) =>
						join(
							"dot-git",
							relative(join(fixture.path, "dot-git"), entry.parentPath),
							entry.name,
						),
					),
			),
		);
	};
describe("session fixture and committed history lineage", () => {
	it(
		"is unchanged when a file beside the fixture tree changes",
		sessionLineageIsUnchangedWhenAFileBesideTheFixtureTreeChanges,
	);
	it(
		"changes when the fixture tree's bytes change",
		sessionLineageChangesWhenTheFixtureTreesBytesChange,
	);
	it(
		"is unchanged across two readings of one fixture's committed history",
		sessionLineageIsUnchangedAcrossTwoReadingsOfOneFixturesCommittedHistory,
	);
	it(
		"changes when only the fixture's committed history changes",
		sessionLineageChangesWhenOnlyTheFixturesCommittedHistoryChanges,
	);
	it(
		"hashes every file the fixture's committed history holds",
		sessionLineageHashesEveryFileTheFixturesCommittedHistoryHolds,
	);
});
