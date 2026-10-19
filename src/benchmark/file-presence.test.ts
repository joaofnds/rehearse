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

const NO_ACCESS_MODE = 0o000;
const OWNER_DIRECTORY_MODE = 0o700;
const READ_ONLY_FILE_MODE = 0o444;

const resources = TestResources.forEachTest();

const statIfExistsReportsAFileThatIsThere = async (): Promise<void> => {
	const directory = await resources.createControlDirectory();
	await Bun.write(join(directory, "present.md"), "here\n");

	const stats = await statIfExists(join(directory, "present.md"));

	expect(stats?.isFile()).toBe(true);
};

const statIfExistsReportsAbsenceForAPathThatIsNotThere =
	async (): Promise<void> => {
		expect(await statIfExists("/no/such/path/at/all")).toBeUndefined();
	};

const statIfExistsRaisesAFailureThatIsNotAbsenceRatherThanReportingAbsence =
	async (): Promise<void> => {
		const directory = await resources.createControlDirectory();
		await Bun.write(join(directory, "locked/inside.md"), "hidden\n");
		await chmod(join(directory, "locked"), NO_ACCESS_MODE);

		const failure = await failureOf(
			statIfExists(join(directory, "locked/inside.md")),
		);

		await chmod(join(directory, "locked"), OWNER_DIRECTORY_MODE);
		expect(failure.message).toContain("EACCES");
	};

describe(statIfExists.name, () => {
	it("reports a file that is there", statIfExistsReportsAFileThatIsThere);

	it(
		"reports absence for a path that is not there",
		statIfExistsReportsAbsenceForAPathThatIsNotThere,
	);

	/**
	 * A permission failure is not absence. Reading it as absence would refuse an
	 * unreadable corpus source for the wrong reason, and would let a checkpoint
	 * record partial state as truth.
	 */
	it(
		"raises a failure that is not absence rather than reporting absence",
		statIfExistsRaisesAFailureThatIsNotAbsenceRatherThanReportingAbsence,
	);
});

const lstatIfPresentReportsASymlinkAsASymlinkRatherThanFollowingIt =
	async (): Promise<void> => {
		const directory = await resources.createControlDirectory();
		await Bun.write(join(directory, "target.md"), "there\n");
		await symlink(join(directory, "target.md"), join(directory, "link.md"));

		const stats = await lstatIfPresent(join(directory, "link.md"));

		expect(stats?.isSymbolicLink()).toBe(true);
	};

const lstatIfPresentReportsAbsenceForAPathThatIsNotThere =
	async (): Promise<void> => {
		expect(await lstatIfPresent("/no/such/path/at/all")).toBeUndefined();
	};

const lstatIfPresentRaisesAFailureThatIsNotAbsenceRatherThanReportingAbsence =
	async (): Promise<void> => {
		const directory = await resources.createControlDirectory();
		await Bun.write(join(directory, "locked/inside.md"), "hidden\n");
		await chmod(join(directory, "locked"), READ_ONLY_FILE_MODE);

		const failure = await failureOf(
			lstatIfPresent(join(directory, "locked/inside.md")),
		);

		await chmod(join(directory, "locked"), OWNER_DIRECTORY_MODE);
		expect(failure.message).toContain("EACCES");
	};

describe(lstatIfPresent.name, () => {
	it(
		"reports a symlink as a symlink rather than following it",
		lstatIfPresentReportsASymlinkAsASymlinkRatherThanFollowingIt,
	);

	it(
		"reports absence for a path that is not there",
		lstatIfPresentReportsAbsenceForAPathThatIsNotThere,
	);

	/**
	 * A directory readable but not searchable lists its children through readdir
	 * and refuses to stat them. Reading that as absence drops a real file from a
	 * lineage that then reports itself complete.
	 */
	it(
		"raises a failure that is not absence rather than reporting absence",
		lstatIfPresentRaisesAFailureThatIsNotAbsenceRatherThanReportingAbsence,
	);
});

const pathExistsAnswersWhetherThePathIsThere = async (): Promise<void> => {
	const directory = await resources.createControlDirectory();
	await Bun.write(join(directory, "present.md"), "here\n");

	expect(await pathExists(join(directory, "present.md"))).toBe(true);
	expect(await pathExists(join(directory, "absent.md"))).toBe(false);
};

describe(pathExists.name, () => {
	it(
		"answers whether the path is there",
		pathExistsAnswersWhetherThePathIsThere,
	);
});

const removeUntilAbsentLeavesNothingBehindWhenAnotherRemoverWorksOnTheSameTree =
	async (): Promise<void> => {
		const directory = await resources.createControlDirectory();
		const tree = join(directory, "worktrees");
		const remaining: number[] = [];
		await Array.fromAsync(
			Array.from({ length: 20 }, (_value, index) => index),
			async (trial) => {
				await Array.fromAsync(["rep-1", "rep-2", "rep-3"], async (rep) => {
					await Array.fromAsync(
						Array.from({ length: 10 }, (_value, index) => index),
						async (folder) => {
							await mkdir(join(tree, rep, String(folder)), { recursive: true });
							await Array.fromAsync(
								Array.from({ length: 10 }, (_value, index) => index),
								async (file) => {
									await Bun.write(
										join(tree, rep, String(folder), String(file)),
										"x",
									);
								},
							);
						},
					);
				});

				const other = rm(tree, { force: true, recursive: true });
				try {
					await removeUntilAbsent(tree);
					if (await pathExists(tree)) {
						remaining.push(trial);
					}
				} finally {
					await other;
				}
			},
		);

		expect(remaining).toEqual([]);
	};

const removeUntilAbsentDoesNothingForAPathThatIsNotThere =
	async (): Promise<void> => {
		const directory = await resources.createControlDirectory();

		await removeUntilAbsent(join(directory, "never-made"));

		expect(await pathExists(join(directory, "never-made"))).toBe(false);
	};

describe(removeUntilAbsent.name, () => {
	/**
	 * Bun's recursive rm can resolve while another rm of the same tree is still
	 * removing it. A stop that exits once its own rm resolves would then leave
	 * rep worktrees behind, so each trial races a second remover.
	 */
	it(
		"leaves nothing behind when another remover works on the same tree",
		removeUntilAbsentLeavesNothingBehindWhenAnotherRemoverWorksOnTheSameTree,
	);

	it(
		"does nothing for a path that is not there",
		removeUntilAbsentDoesNothingForAPathThatIsNotThere,
	);
});
