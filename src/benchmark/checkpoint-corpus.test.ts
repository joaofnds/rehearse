import { describe, expect, it } from "bun:test";
import {
	lstat,
	mkdir,
	mkdtemp,
	readdir,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import {
	captureStageCorpus,
	installStageCorpusSnapshot,
	snapshotStageCorpus,
	stageCorpusRoots,
} from "./checkpoint";
import type { LiveCorpusRoot } from "./corpus-file";
import { SymlinkedEntryError } from "./file-presence";
import { TestResources } from "./test-support";
import { failureOf } from "#cli/cli-test-support";

const resources = TestResources.forEachTest();

async function installedCorpus(): Promise<LiveCorpusRoot> {
	const parent = await mkdtemp(join(tmpdir(), "rehearse-layout-"));
	resources.track(parent);
	const root = join(parent, "install");
	const backingRoot = join(parent, "backing");
	await mkdir(join(root, "skills", "build"), { recursive: true });
	await mkdir(backingRoot);
	await writeFile(join(root, "skills", "build", "SKILL.md"), "build skill");
	return { kind: "live", root, backingRoot };
}

async function fileContents(
	root: string,
): Promise<Readonly<Record<string, string>>> {
	const contents: Record<string, string> = {};
	for (const entry of await readdir(root, {
		recursive: true,
		withFileTypes: true,
	})) {
		if (entry.isFile()) {
			const path = join(entry.parentPath, entry.name);
			contents[relative(root, path)] = await Bun.file(path).text();
		}
	}

	return contents;
}

describe(captureStageCorpus.name, () => {
	it("retains hashes and layout names for a permitted backing directory and cross-layout alias", async () => {
		const source = await installedCorpus();
		await mkdir(join(source.root, "agents"));
		await writeFile(join(source.root, "agents", "review.md"), "review");
		await writeFile(join(source.root, "agents", "alias.md"), "build skill");
		const ordinary = await captureStageCorpus("build", "instructions", [
			source,
		]);
		await rm(join(source.root, "agents"), { recursive: true });
		await writeFile(join(source.backingRoot, "review.md"), "review");
		await symlink(
			join(source.root, "skills", "build", "SKILL.md"),
			join(source.backingRoot, "alias.md"),
		);
		await symlink(source.backingRoot, join(source.root, "agents"));

		const linked = await captureStageCorpus("build", "instructions", [source]);

		expect(linked).toEqual(ordinary);
	});

	describe("when a selected directory leaves its source", () => {
		it.each(["agents", "output-styles", "rulebook", "skills/build"])(
			"refuses %s beyond the declared backing tree",
			async (layoutPath) => {
				const source = await installedCorpus();
				const outside = `${source.backingRoot}-private`;
				await mkdir(outside);
				await writeFile(join(outside, "undisclosed.md"), "private contents");
				await rm(join(source.root, layoutPath), {
					recursive: true,
					force: true,
				});
				await symlink(outside, join(source.root, layoutPath));

				const failure = await failureOf(
					captureStageCorpus("build", "instructions", [source]),
				);

				expect(failure).toBeInstanceOf(SymlinkedEntryError);
				expect(failure.message).toContain(layoutPath);
				expect(failure.message).not.toContain(outside);
				expect(failure.message).not.toContain("undisclosed.md");
				expect(failure.message).not.toContain("private contents");
			},
		);

		it("refuses a skill reached through an escaping skills parent", async () => {
			const source = await installedCorpus();
			const outside = join(dirname(source.root), "outside");
			await mkdir(join(outside, "build"), { recursive: true });
			await writeFile(join(outside, "build", "SKILL.md"), "foreign skill");
			await rm(join(source.root, "skills"), { recursive: true });
			await symlink(outside, join(source.root, "skills"));

			const failure = await failureOf(
				captureStageCorpus("build", "instructions", [source]),
			);

			expect(failure).toBeInstanceOf(SymlinkedEntryError);
			expect(failure.message).toContain("skills/build");
		});

		it("refuses an escaping nested directory under an allowed linked root", async () => {
			const source = await installedCorpus();
			const outside = join(dirname(source.root), "outside");
			await mkdir(outside);
			await writeFile(join(outside, "secret.md"), "private contents");
			await symlink(outside, join(source.backingRoot, "escape"));
			await symlink(source.backingRoot, join(source.root, "agents"));

			const failure = await failureOf(
				captureStageCorpus("build", "instructions", [source]),
			);

			expect(failure).toBeInstanceOf(SymlinkedEntryError);
			expect(failure.message).toContain("agents/escape");
			expect(failure.message).not.toContain("secret.md");
		});

		it("refuses a project escape instead of falling through or borrowing live permission", async () => {
			const source = await installedCorpus();
			const target = join(dirname(source.root), "target");
			await mkdir(join(target, ".claude"), { recursive: true });
			await writeFile(join(source.backingRoot, "review.md"), "review");
			await symlink(source.backingRoot, join(target, ".claude", "agents"));
			await symlink(source.backingRoot, join(source.root, "agents"));

			const failure = await failureOf(
				captureStageCorpus(
					"build",
					"instructions",
					stageCorpusRoots(source, target),
				),
			);

			expect(failure).toBeInstanceOf(SymlinkedEntryError);
			expect(failure.message).toContain("agents");
		});
	});
});

describe(snapshotStageCorpus.name, () => {
	it("leaves the destination unchanged when a later selected skill escapes", async () => {
		const source = await installedCorpus();
		await mkdir(join(source.root, "agents"));
		await writeFile(join(source.root, "agents", "review.md"), "healthy agent");
		const outside = join(dirname(source.root), "outside");
		await mkdir(outside);
		await writeFile(join(outside, "SKILL.md"), "foreign skill");
		await rm(join(source.root, "skills", "build"), { recursive: true });
		await symlink(outside, join(source.root, "skills", "build"));
		const snapshot = join(dirname(source.root), "snapshot");
		await mkdir(snapshot);
		await writeFile(join(snapshot, "CLAUDE.md"), "previous instructions");

		const failure = await failureOf(
			snapshotStageCorpus("build", "instructions", [source], snapshot),
		);

		expect(failure).toBeInstanceOf(SymlinkedEntryError);
		expect(failure.message).toContain("skills/build");
		expect(await readdir(snapshot)).toEqual(["CLAUDE.md"]);
		expect(await Bun.file(join(snapshot, "CLAUDE.md")).text()).toBe(
			"previous instructions",
		);
	});

	it("installs captured linked inputs after the original trees disappear", async () => {
		const source = await installedCorpus();
		await writeFile(join(source.backingRoot, "review.md"), "captured agent");
		await symlink(source.backingRoot, join(source.root, "agents"));
		await symlink(
			join(source.backingRoot, "review.md"),
			join(source.root, "skills", "build", "alias.md"),
		);
		const snapshot = join(dirname(source.root), "snapshot");
		const target = join(dirname(source.root), "target");
		const frozen = await snapshotStageCorpus(
			"build",
			"instructions",
			[source],
			snapshot,
		);
		await rm(source.root, { recursive: true });
		await rm(source.backingRoot, { recursive: true });

		await installStageCorpusSnapshot(snapshot, target);
		const installed = await captureStageCorpus("build", "instructions", [
			{ kind: "directory", root: join(target, ".claude") },
		]);

		expect(installed).toEqual(frozen);
		expect(
			await Bun.file(join(target, ".claude", "agents", "review.md")).text(),
		).toBe("captured agent");
		expect(
			await Bun.file(
				join(target, ".claude", "skills", "build", "alias.md"),
			).text(),
		).toBe("captured agent");
	});

	it("copies no foreign bytes when a permitted layout contains an escaping entry", async () => {
		const source = await installedCorpus();
		const outside = join(dirname(source.root), "outside");
		await mkdir(outside);
		await writeFile(join(outside, "secret.md"), "private contents");
		await symlink(outside, join(source.backingRoot, "escape"));
		await symlink(source.backingRoot, join(source.root, "agents"));
		const snapshot = join(dirname(source.root), "snapshot");

		const failure = await failureOf(
			snapshotStageCorpus("build", "instructions", [source], snapshot),
		);

		expect(failure).toBeInstanceOf(SymlinkedEntryError);
		expect(failure.message).toContain("agents/escape");
		expect(
			await Bun.file(join(snapshot, "agents", "escape", "secret.md")).exists(),
		).toBe(false);
	});
});

describe(installStageCorpusSnapshot.name, () => {
	it("installs a directory variant's allowed links as independent files", async () => {
		const source = await installedCorpus();
		await writeFile(join(source.root, "CLAUDE.md"), "instructions");
		await mkdir(join(source.root, "shared"));
		await writeFile(join(source.root, "shared", "review.md"), "review");
		await symlink(join(source.root, "shared"), join(source.root, "agents"));
		const directory = { kind: "directory", root: source.root } as const;
		const captured = await captureStageCorpus("build", "instructions", [
			directory,
		]);
		const target = join(dirname(source.root), "target");

		await installStageCorpusSnapshot(source.root, target);
		await rm(source.root, { recursive: true });
		const installed = await captureStageCorpus("build", "instructions", [
			{ kind: "directory", root: join(target, ".claude") },
		]);

		expect(installed).toEqual(captured);
	});

	describe("when the target's .claude links to another directory", () => {
		async function linkedTarget(): Promise<{
			readonly snapshot: string;
			readonly linked: string;
			readonly target: string;
		}> {
			const source = await installedCorpus();
			await writeFile(join(source.root, "CLAUDE.md"), "stage instructions");
			const linked = join(dirname(source.root), "linked");
			await mkdir(join(linked, "skills", "precious"), { recursive: true });
			await writeFile(join(linked, "skills", "precious", "SKILL.md"), "kept");
			await writeFile(join(linked, "CLAUDE.md"), "live instructions");
			const target = join(dirname(source.root), "target");
			await mkdir(target);
			await symlink(linked, join(target, ".claude"));

			return { snapshot: source.root, linked, target };
		}

		it("leaves every file in the linked directory unchanged", async () => {
			const { snapshot, linked, target } = await linkedTarget();
			const before = await fileContents(linked);

			await installStageCorpusSnapshot(snapshot, target);

			expect(await fileContents(linked)).toEqual(before);
		});

		it("installs the stage corpus in a directory of the target's own", async () => {
			const { snapshot, target } = await linkedTarget();

			await installStageCorpusSnapshot(snapshot, target);

			const installed = await lstat(join(target, ".claude"));
			expect({
				link: installed.isSymbolicLink(),
				instructions: await Bun.file(
					join(target, ".claude", "CLAUDE.md"),
				).text(),
			}).toEqual({ link: false, instructions: "stage instructions" });
		});
	});
});
