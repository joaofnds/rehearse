import { describe, expect, it } from "bun:test";
import { chmod, mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import {
	lstatIfPresent,
	pathExists,
	removeUntilAbsent,
	statIfExists,
} from "#benchmark/file-presence";
import { TestResources } from "#benchmark/test-support";
import { failureOf } from "#cli/cli-test-support";

const resources = TestResources.forEachTest();

describe(statIfExists.name, () => {
	it("reports a file that is there", async () => {
		const directory = await resources.createControlDirectory();
		await Bun.write(join(directory, "present.md"), "here\n");

		const stats = await statIfExists(join(directory, "present.md"));

		expect(stats?.isFile()).toBe(true);
	});

	it("reports absence for a path that is not there", async () => {
		expect(await statIfExists("/no/such/path/at/all")).toBeUndefined();
	});

	/**
	 * A permission failure is not absence. Reading it as absence would refuse an
	 * unreadable corpus source for the wrong reason, and would let a checkpoint
	 * record partial state as truth.
	 */
	it("raises a failure that is not absence rather than reporting absence", async () => {
		const directory = await resources.createControlDirectory();
		await Bun.write(join(directory, "locked/inside.md"), "hidden\n");
		await chmod(join(directory, "locked"), 0o000);

		const failure = await failureOf(
			statIfExists(join(directory, "locked/inside.md")),
		);

		await chmod(join(directory, "locked"), 0o700);
		expect(failure.message).toContain("EACCES");
	});
});

describe(lstatIfPresent.name, () => {
	it("reports a symlink as a symlink rather than following it", async () => {
		const directory = await resources.createControlDirectory();
		await Bun.write(join(directory, "target.md"), "there\n");
		await symlink(join(directory, "target.md"), join(directory, "link.md"));

		const stats = await lstatIfPresent(join(directory, "link.md"));

		expect(stats?.isSymbolicLink()).toBe(true);
	});

	it("reports absence for a path that is not there", async () => {
		expect(await lstatIfPresent("/no/such/path/at/all")).toBeUndefined();
	});

	/**
	 * A directory readable but not searchable lists its children through readdir
	 * and refuses to stat them. Reading that as absence drops a real file from a
	 * lineage that then reports itself complete.
	 */
	it("raises a failure that is not absence rather than reporting absence", async () => {
		const directory = await resources.createControlDirectory();
		await Bun.write(join(directory, "locked/inside.md"), "hidden\n");
		await chmod(join(directory, "locked"), 0o444);

		const failure = await failureOf(
			lstatIfPresent(join(directory, "locked/inside.md")),
		);

		await chmod(join(directory, "locked"), 0o700);
		expect(failure.message).toContain("EACCES");
	});
});

describe(pathExists.name, () => {
	it("answers whether the path is there", async () => {
		const directory = await resources.createControlDirectory();
		await Bun.write(join(directory, "present.md"), "here\n");

		expect(await pathExists(join(directory, "present.md"))).toBe(true);
		expect(await pathExists(join(directory, "absent.md"))).toBe(false);
	});
});

describe(removeUntilAbsent.name, () => {
	/**
	 * Bun's recursive rm can resolve while another rm of the same tree is still
	 * removing it. A stop that exits once its own rm resolves would then leave
	 * rep worktrees behind, so each trial races a second remover.
	 */
	it("leaves nothing behind when another remover works on the same tree", async () => {
		const directory = await resources.createControlDirectory();
		const tree = join(directory, "worktrees");
		const remaining: number[] = [];
		for (let trial = 0; trial < 20; trial += 1) {
			for (const rep of ["rep-1", "rep-2", "rep-3"]) {
				for (let folder = 0; folder < 10; folder += 1) {
					await mkdir(join(tree, rep, String(folder)), { recursive: true });
					for (let file = 0; file < 10; file += 1) {
						await Bun.write(join(tree, rep, String(folder), String(file)), "x");
					}
				}
			}

			const other = rm(tree, { force: true, recursive: true });
			await removeUntilAbsent(tree);
			if (await pathExists(tree)) {
				remaining.push(trial);
			}
			await other;
		}

		expect(remaining).toEqual([]);
	});

	it("does nothing for a path that is not there", async () => {
		const directory = await resources.createControlDirectory();

		await removeUntilAbsent(join(directory, "never-made"));

		expect(await pathExists(join(directory, "never-made"))).toBe(false);
	});
});
