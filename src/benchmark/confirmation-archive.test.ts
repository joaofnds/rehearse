import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
	archiveConfirmation,
	ConfirmationArchiveRefusalError,
	listConfirmationArchives,
	restoreConfirmation,
} from "./confirmation-archive";
import { confirmationGroupPaths } from "./run-layout";
import {
	RecordedRunsFixture,
	nothingRunning,
} from "./run-records-test-support";
import { operatorStopRecord } from "./operator-stop";
import { runListing } from "#server/run-history";
import { runShow } from "#cli/show-command";
import { recordOutput, failureOf } from "#cli/cli-test-support";
import { listRecords } from "#cli/list-command";

const GROUP = "incomplete-group";
const WHEN = "2026-10-18T12:00:00.000Z";

describe("incomplete confirmation archive", () => {
	const roots: string[] = [];
	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
		);
	});
	async function records(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-archive-"));
		roots.push(root);
		await mkdir(confirmationGroupPaths(root, GROUP).inputsDirectory, {
			recursive: true,
		});
		await Bun.write(
			join(confirmationGroupPaths(root, GROUP).inputsDirectory, "input.txt"),
			"unchanged input\n",
		);
		return root;
	}
	it("archives and restores an unknown group without changing its saved inputs", async () => {
		const root = await records();
		const paths = confirmationGroupPaths(root, GROUP);
		const listingBefore = await listRecords("groups", root);
		expect(listingBefore.unreadable.map(({ id }) => id)).toEqual([
			`group:${GROUP}`,
		]);

		await archiveConfirmation({
			runsDirectory: root,
			groupId: GROUP,
			archivedAt: WHEN,
		});

		expect(await listConfirmationArchives(root)).toEqual({
			archived: [{ groupId: GROUP, archivedAt: WHEN }],
			unreadable: [],
		});
		expect(await listRecords("groups", root)).toEqual({
			entries: [],
			unreadable: [],
		});
		expect(await listRecords("archived-groups", root)).toEqual({
			entries: [{ id: `group:${GROUP}`, fields: [WHEN, "no saved summary"] }],
			unreadable: [],
		});
		expect(
			await Bun.file(join(paths.inputsDirectory, "input.txt")).text(),
		).toBe("unchanged input\n");
		expect(await readdir(paths.directory)).toEqual(["inputs"]);

		await restoreConfirmation({ runsDirectory: root, groupId: GROUP });

		expect(await listConfirmationArchives(root)).toEqual({
			archived: [],
			unreadable: [],
		});
		const listingAfter = await listRecords("groups", root);
		expect(listingAfter.unreadable.map(({ id }) => id)).toEqual([
			`group:${GROUP}`,
		]);
		expect(
			await Bun.file(join(paths.inputsDirectory, "input.txt")).text(),
		).toBe("unchanged input\n");
	});
	it("removes the archived group's actionable Runs warning and returns it on restore", async () => {
		const root = await records();
		await new RecordedRunsFixture(root).writeSessionGroup("neighbor", 1);
		const before = await runListing(root, nothingRunning);
		expect(before.unreadable).toEqual([
			{
				kind: "group",
				id: `group:${GROUP}`,
				reason: "incomplete: no group.json recorded",
				incompleteConfirmation: { groupId: GROUP },
			},
		]);

		await archiveConfirmation({
			runsDirectory: root,
			groupId: GROUP,
			archivedAt: WHEN,
		});

		const archived = await runListing(root, nothingRunning);
		expect(archived.unreadable).toEqual([]);
		expect(archived.rows.map(({ recordId }) => recordId)).toEqual([
			"group:neighbor",
		]);
		await restoreConfirmation({ runsDirectory: root, groupId: GROUP });
		const restored = await runListing(root, nothingRunning);
		expect(restored.unreadable).toEqual(before.unreadable);
		expect(restored.rows.map(({ recordId }) => recordId)).toEqual([
			"group:neighbor",
		]);
	});

	it("cleans its temporary file after a rejected write and can retry", async () => {
		const root = await records();
		const request = { runsDirectory: root, groupId: GROUP, archivedAt: WHEN };
		const code = `import { archiveConfirmation } from ${JSON.stringify(import.meta.resolve("./confirmation-archive"))};
try { await archiveConfirmation(${JSON.stringify(request)}); }
catch (error) { console.log(JSON.stringify({ code: error.code })); process.exitCode = 1; }`;

		const child = Bun.spawn(
			[
				"/bin/sh",
				"-c",
				'trap "" XFSZ; ulimit -f 0; exec "$@"',
				"archive-write-probe",
				process.execPath,
				"--eval",
				code,
			],
			{ env: { ...Bun.env }, stdout: "pipe", stderr: "pipe" },
		);
		const [exit, output, errors] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);

		expect(exit).toBe(1);
		expect(errors).toBe("");
		expect(
			z.object({ code: z.literal("EFBIG") }).parse(JSON.parse(output)),
		).toEqual({ code: "EFBIG" });
		expect(await readdir(join(root, "confirmation-archives"))).toEqual([]);
		expect(
			await Bun.file(
				join(confirmationGroupPaths(root, GROUP).inputsDirectory, "input.txt"),
			).text(),
		).toBe("unchanged input\n");
		await archiveConfirmation(request);
		expect(await listConfirmationArchives(root)).toEqual({
			archived: [{ groupId: GROUP, archivedAt: WHEN }],
			unreadable: [],
		});
	});

	it("restores idempotently without requiring a still-missing group summary", async () => {
		const root = await records();
		await archiveConfirmation({
			runsDirectory: root,
			groupId: GROUP,
			archivedAt: WHEN,
		});
		await Bun.write(
			confirmationGroupPaths(root, GROUP).groupFile,
			"broken summary",
		);

		await restoreConfirmation({ runsDirectory: root, groupId: GROUP });
		await restoreConfirmation({ runsDirectory: root, groupId: GROUP });

		expect(await readdir(join(root, "confirmation-archives"))).toEqual([]);
		expect(
			await Bun.file(confirmationGroupPaths(root, GROUP).groupFile).text(),
		).toBe("broken summary");
	});
	it("keeps independent archives when a different group is restored", async () => {
		const root = await records();
		await mkdir(confirmationGroupPaths(root, "another-group").directory);
		await archiveConfirmation({
			runsDirectory: root,
			groupId: GROUP,
			archivedAt: WHEN,
		});
		await archiveConfirmation({
			runsDirectory: root,
			groupId: "another-group",
			archivedAt: WHEN,
		});

		await restoreConfirmation({ runsDirectory: root, groupId: GROUP });

		expect(await listConfirmationArchives(root)).toEqual({
			archived: [{ groupId: "another-group", archivedAt: WHEN }],
			unreadable: [],
		});
	});
	it("shows a later valid summary normally despite existing archive metadata", async () => {
		const root = await records();
		await archiveConfirmation({
			runsDirectory: root,
			groupId: GROUP,
			archivedAt: WHEN,
		});
		const fixture = new RecordedRunsFixture(root);
		await fixture.writeSessionGroup(GROUP, 1);

		const cli = await listRecords("groups", root);
		const history = await runListing(root, nothingRunning);

		expect(cli.entries.map(({ id }) => id)).toContain(`group:${GROUP}`);
		expect(history.rows.map(({ recordId }) => recordId)).toContain(
			`group:${GROUP}`,
		);
		expect(await listConfirmationArchives(root)).toEqual({
			archived: [],
			unreadable: [],
		});
	});
	it("shows a later malformed summary instead of concealing it as archived", async () => {
		const root = await records();
		await archiveConfirmation({
			runsDirectory: root,
			groupId: GROUP,
			archivedAt: WHEN,
		});
		await Bun.write(confirmationGroupPaths(root, GROUP).groupFile, "not json");

		const cli = await listRecords("groups", root);
		const history = await runListing(root, nothingRunning);

		expect(cli.unreadable.map(({ id }) => id)).toContain(`group:${GROUP}`);
		expect(history.unreadable.map(({ id }) => id)).toContain(`group:${GROUP}`);
		expect(
			history.unreadable.find(({ id }) => id === `group:${GROUP}`)
				?.incompleteConfirmation,
		).toBeUndefined();
		expect(await listConfirmationArchives(root)).toEqual({
			archived: [],
			unreadable: [],
		});
	});
	it("gives a saved summary precedence even over corrupt archive metadata", async () => {
		const root = await records();
		await Bun.write(
			join(root, "confirmation-archives", `${GROUP}.json`),
			"broken metadata",
		);
		const fixture = new RecordedRunsFixture(root);
		await fixture.writeSessionGroup(GROUP, 1);

		const cli = await listRecords("groups", root);
		const history = await runListing(root, nothingRunning);

		expect(cli.entries.map(({ id }) => id)).toContain(`group:${GROUP}`);
		expect(history.rows.map(({ recordId }) => recordId)).toContain(
			`group:${GROUP}`,
		);
		expect(await listConfirmationArchives(root)).toEqual({
			archived: [],
			unreadable: [],
		});
	});
	it("reports an unreadable existing summary symlink instead of suppressing the group", async () => {
		const root = await records();
		await archiveConfirmation({
			runsDirectory: root,
			groupId: GROUP,
			archivedAt: WHEN,
		});
		await symlink(
			join(root, "absent-summary"),
			confirmationGroupPaths(root, GROUP).groupFile,
		);

		const cli = await listRecords("groups", root);
		const history = await runListing(root, nothingRunning);

		expect(cli.unreadable.map(({ id }) => id)).toContain(`group:${GROUP}`);
		expect(history.unreadable.map(({ id }) => id)).toContain(`group:${GROUP}`);
		expect(
			history.unreadable.find(({ id }) => id === `group:${GROUP}`)
				?.incompleteConfirmation,
		).toBeUndefined();
		expect(await listConfirmationArchives(root)).toEqual({
			archived: [],
			unreadable: [],
		});
	});

	it.each([
		"not-json",
		JSON.stringify({
			schemaVersion: 1,
			groupId: "wrong-identity",
			archivedAt: WHEN,
		}),
		JSON.stringify({ schemaVersion: 9, groupId: GROUP, archivedAt: WHEN }),
	])(
		"clears invalid regular metadata %s and restores the ordinary incomplete action",
		async (contents) => {
			const root = await records();
			await Bun.write(
				join(root, "confirmation-archives", `${GROUP}.json`),
				contents,
			);
			const before = await listConfirmationArchives(root);
			expect(
				before.unreadable.map(({ id, groupId }) => ({ id, groupId })),
			).toEqual([{ id: GROUP, groupId: GROUP }]);

			await restoreConfirmation({ runsDirectory: root, groupId: GROUP });

			expect(await listConfirmationArchives(root)).toEqual({
				archived: [],
				unreadable: [],
			});
			const history = await runListing(root, nothingRunning);
			expect(history.unreadable).toContainEqual({
				kind: "group",
				id: `group:${GROUP}`,
				reason: "incomplete: no group.json recorded",
				incompleteConfirmation: { groupId: GROUP },
			});
			expect(
				await Bun.file(
					join(
						confirmationGroupPaths(root, GROUP).inputsDirectory,
						"input.txt",
					),
				).text(),
			).toBe("unchanged input\n");
		},
	);

	it("leaves explicit lookup honest about the absent summary", async () => {
		const root = await records();
		await archiveConfirmation({
			runsDirectory: root,
			groupId: GROUP,
			archivedAt: WHEN,
		});
		const output = recordOutput();

		const error = await failureOf(
			runShow(
				{ runsDirectory: root, id: `group:${GROUP}`, json: true },
				output.output,
			),
		);

		expect(error).toBeInstanceOf(Error);
		expect(output.stdout).toEqual([]);
	});
	it("preserves partial rep evidence and broad confirmation discovery", async () => {
		const root = await records();
		const stage = join(
			confirmationGroupPaths(root, GROUP).rep("1").stagesDirectory,
			"shape.json",
		);
		await Bun.write(stage, "partial stage evidence\n");

		await archiveConfirmation({
			runsDirectory: root,
			groupId: GROUP,
			archivedAt: WHEN,
		});
		await restoreConfirmation({ runsDirectory: root, groupId: GROUP });

		expect(await Bun.file(stage).text()).toBe("partial stage evidence\n");
	});
	describe("when archive data or paths are invalid", () => {
		it.each(["../escape", "a/b", ".", "", String.raw`a\b`])(
			"refuses identity %s",
			async (groupId) => {
				const root = await records();

				expect(
					await failureOf(
						archiveConfirmation({
							runsDirectory: root,
							groupId,
							archivedAt: WHEN,
						}),
					),
				).toBeInstanceOf(ConfirmationArchiveRefusalError);
				expect(
					await failureOf(
						restoreConfirmation({ runsDirectory: root, groupId }),
					),
				).toBeInstanceOf(ConfirmationArchiveRefusalError);
			},
		);
		it("refuses a missing group without creating metadata", async () => {
			const root = await records();

			expect(
				await failureOf(
					archiveConfirmation({
						runsDirectory: root,
						groupId: "missing",
						archivedAt: WHEN,
					}),
				),
			).toBeInstanceOf(ConfirmationArchiveRefusalError);

			expect(await listConfirmationArchives(root)).toEqual({
				archived: [],
				unreadable: [],
			});
		});
		it.each(["{}", "not-json"])(
			"refuses an existing summary containing %s",
			async (summary) => {
				const root = await records();
				await Bun.write(confirmationGroupPaths(root, GROUP).groupFile, summary);

				expect(
					await failureOf(
						archiveConfirmation({
							runsDirectory: root,
							groupId: GROUP,
							archivedAt: WHEN,
						}),
					),
				).toBeInstanceOf(ConfirmationArchiveRefusalError);

				expect(await listConfirmationArchives(root)).toEqual({
					archived: [],
					unreadable: [],
				});
			},
		);
		it("preserves existing operator-stop exclusion", async () => {
			const root = await records();
			await Bun.write(
				confirmationGroupPaths(root, GROUP).operatorStopFile,
				operatorStopRecord("SIGTERM"),
			);

			expect(
				await failureOf(
					archiveConfirmation({
						runsDirectory: root,
						groupId: GROUP,
						archivedAt: WHEN,
					}),
				),
			).toBeInstanceOf(ConfirmationArchiveRefusalError);

			expect(await listRecords("groups", root)).toEqual({
				entries: [],
				unreadable: [],
			});
		});
		it.each([
			"not-json",
			JSON.stringify({ schemaVersion: 1, groupId: "other", archivedAt: WHEN }),
			JSON.stringify({ schemaVersion: 2, groupId: GROUP, archivedAt: WHEN }),
		])(
			"isolates invalid metadata %s without suppressing its group",
			async (contents) => {
				const root = await records();
				await Bun.write(
					join(root, "confirmation-archives", `${GROUP}.json`),
					contents,
				);
				await mkdir(confirmationGroupPaths(root, "good-archive").directory);
				await archiveConfirmation({
					runsDirectory: root,
					groupId: "good-archive",
					archivedAt: WHEN,
				});

				const archives = await listConfirmationArchives(root);
				const groups = await listRecords("groups", root);

				expect(archives.archived).toEqual([
					{ groupId: "good-archive", archivedAt: WHEN },
				]);
				expect(archives.unreadable.map(({ id }) => id)).toEqual([GROUP]);
				expect(groups.unreadable.map(({ id }) => id)).toContain(
					`group:${GROUP}`,
				);
			},
		);
		it.each(["confirmations", "confirmation-archives"])(
			"refuses a symlinked %s directory",
			async (name) => {
				const root = await records();
				const outside = await records();
				await rm(join(root, name), { recursive: true, force: true });
				await symlink(join(outside, "confirmations"), join(root, name));

				expect(
					await failureOf(
						archiveConfirmation({
							runsDirectory: root,
							groupId: GROUP,
							archivedAt: WHEN,
						}),
					),
				).toBeInstanceOf(ConfirmationArchiveRefusalError);

				expect(
					await readdir(confirmationGroupPaths(outside, GROUP).directory),
				).toEqual(["inputs"]);
			},
		);
		it("refuses an operator-stop symlink before reading outside group evidence", async () => {
			const root = await records();
			const outside = join(root, "outside-stop.json");
			await Bun.write(outside, operatorStopRecord("SIGTERM"));
			await symlink(
				outside,
				confirmationGroupPaths(root, GROUP).operatorStopFile,
			);

			const error = await failureOf(
				archiveConfirmation({
					runsDirectory: root,
					groupId: GROUP,
					archivedAt: WHEN,
				}),
			);

			expect(error).toBeInstanceOf(ConfirmationArchiveRefusalError);
			expect(error.message).toBe(
				"Confirmation operator stop must be a regular file",
			);
			expect(await Bun.file(outside).text()).toBe(
				operatorStopRecord("SIGTERM"),
			);
		});

		it("refuses a symlinked group directory", async () => {
			const root = await records();
			const outside = await records();
			await rm(confirmationGroupPaths(root, GROUP).directory, {
				recursive: true,
			});
			await symlink(
				confirmationGroupPaths(outside, GROUP).directory,
				confirmationGroupPaths(root, GROUP).directory,
			);

			expect(
				await failureOf(
					archiveConfirmation({
						runsDirectory: root,
						groupId: GROUP,
						archivedAt: WHEN,
					}),
				),
			).toBeInstanceOf(ConfirmationArchiveRefusalError);
		});
		it("refuses symlinked metadata on read, write and restore", async () => {
			const root = await records();
			const outside = join(root, "untouched.json");
			await Bun.write(
				outside,
				JSON.stringify({ schemaVersion: 1, groupId: GROUP, archivedAt: WHEN }),
			);
			await mkdir(join(root, "confirmation-archives"));
			await symlink(
				outside,
				join(root, "confirmation-archives", `${GROUP}.json`),
			);

			const archives = await listConfirmationArchives(root);

			expect(archives.archived).toEqual([]);
			expect(archives.unreadable.map(({ id }) => id)).toEqual([GROUP]);
			expect(archives.unreadable[0]?.groupId).toBeUndefined();
			expect(
				await failureOf(
					archiveConfirmation({
						runsDirectory: root,
						groupId: GROUP,
						archivedAt: WHEN,
					}),
				),
			).toBeInstanceOf(ConfirmationArchiveRefusalError);
			expect(
				await failureOf(
					restoreConfirmation({ runsDirectory: root, groupId: GROUP }),
				),
			).toBeInstanceOf(ConfirmationArchiveRefusalError);
			expect(await Bun.file(outside).text()).toBe(
				JSON.stringify({ schemaVersion: 1, groupId: GROUP, archivedAt: WHEN }),
			);
		});
		it("keeps groups visible when metadata cannot be written", async () => {
			const root = await records();
			await Bun.write(join(root, "confirmation-archives"), "not a directory");

			expect(
				await failureOf(
					archiveConfirmation({
						runsDirectory: root,
						groupId: GROUP,
						archivedAt: WHEN,
					}),
				),
			).toBeInstanceOf(ConfirmationArchiveRefusalError);
			const groups = await listRecords("groups", root);

			expect(groups.unreadable.map(({ id }) => id)).toEqual([`group:${GROUP}`]);
			expect(
				await Bun.file(
					join(
						confirmationGroupPaths(root, GROUP).inputsDirectory,
						"input.txt",
					),
				).text(),
			).toBe("unchanged input\n");
		});
	});
});
