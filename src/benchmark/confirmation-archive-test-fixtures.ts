import { afterEach } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ArchiveConfirmationRequest } from "./confirmation-archive";
import { confirmationGroupPaths } from "./run-layout";

const CLEANUP_START_INDEX = 0;
const GROUP = "incomplete-group";
const WHEN = "2026-10-18T12:00:00.000Z";

class ConfirmationArchiveFixture {
	private readonly roots: string[] = [];
	public static forEachTest(): ConfirmationArchiveFixture {
		const fixture = new ConfirmationArchiveFixture();
		afterEach(async () => {
			await Promise.all(
				fixture.roots.splice(CLEANUP_START_INDEX).map(async (root) => {
					await rm(root, { force: true, recursive: true });
				}),
			);
		});
		return fixture;
	}
	public async records(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-archive-"));
		this.roots.push(root);
		await mkdir(confirmationGroupPaths(root, GROUP).inputsDirectory, {
			recursive: true,
		});
		await Bun.write(
			join(confirmationGroupPaths(root, GROUP).inputsDirectory, "input.txt"),
			"unchanged input\n",
		);

		return root;
	}
	public static async metadataSymlink(root: string): Promise<string> {
		const outside = join(root, "untouched.json");
		await Bun.write(
			outside,
			JSON.stringify({ archivedAt: WHEN, groupId: GROUP, schemaVersion: 1 }),
		);
		await mkdir(join(root, "confirmation-archives"));
		await symlink(
			outside,
			join(root, "confirmation-archives", `${GROUP}.json`),
		);

		return outside;
	}
}

async function rejectedArchiveWrite(
	request: ArchiveConfirmationRequest,
): Promise<{
	readonly exit: number;
	readonly output: string;
	readonly errors: string;
}> {
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
		{ env: { ...Bun.env }, stderr: "pipe", stdout: "pipe" },
	);
	const [exit, output, errors] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return { errors, exit, output };
}

export { ConfirmationArchiveFixture, GROUP, WHEN, rejectedArchiveWrite };
