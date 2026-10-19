import { mkdtemp, readdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { runCommand } from "#benchmark/command";
import { TestResources } from "#benchmark/test-support";

const EXECUTABLE_FILE_MODE = 0o755;

const resources = new TestResources();

async function evidenceDigest(evidenceDirectory: string): Promise<string> {
	const hasher = new Bun.CryptoHasher("sha256");
	const entries = await readdir(evidenceDirectory, {
		recursive: true,
		withFileTypes: true,
	});

	await Array.fromAsync(
		entries.toSorted((left, right) =>
			join(left.parentPath, left.name).localeCompare(
				join(right.parentPath, right.name),
			),
		),
		async (entry) => {
			const path = join(entry.parentPath, entry.name);
			hasher.update(relative(evidenceDirectory, path));
			if (entry.isFile()) {
				hasher.update(await Bun.file(path).arrayBuffer());
			}
		},
	);

	return hasher.digest("hex");
}

async function directory(prefix: string): Promise<string> {
	const path = await mkdtemp(join(tmpdir(), prefix));
	resources.track(path);

	return path;
}

async function attemptWithHistory(): Promise<string> {
	const fixture = await resources.createHistory(["first", "second"]);
	const attempt = await directory("rehearse-state-attempt-");
	await runCommand(["cp", "-R", `${fixture.path}/.`, attempt], attempt);
	await runCommand(["mv", "dot-git", ".git"], attempt);
	await runCommand(
		["mkdir", "-p", ".git/refs/heads", ".git/refs/tags"],
		attempt,
	);

	await Bun.write(join(attempt, "first.md"), "first, edited\n");
	await Bun.write(join(attempt, "untracked.txt"), "untracked\n");
	await Bun.write(join(attempt, ".gitignore"), "ignored/\n");
	await Bun.write(join(attempt, "ignored", "secret.txt"), "ignored\n");

	return attempt;
}

async function attemptWithLinks(): Promise<string> {
	const outside = await directory("rehearse-state-outside-");
	await Bun.write(join(outside, "operator-secret.txt"), "not the session's\n");

	const attempt = await directory("rehearse-state-attempt-");
	await Bun.write(join(attempt, "own-work.txt"), "the session's own\n");
	await symlink(
		join(outside, "operator-secret.txt"),
		join(attempt, "stolen.txt"),
	);
	await symlink(outside, join(attempt, "escape"));

	return attempt;
}

async function attemptExecutingOn(
	plant: (gitDirectory: string) => Promise<void>,
): Promise<string> {
	const attempt = await attemptWithHistory();
	await plant(join(attempt, ".git"));

	return attempt;
}
export {
	EXECUTABLE_FILE_MODE,
	resources,
	evidenceDigest,
	directory,
	attemptWithHistory,
	attemptWithLinks,
	attemptExecutingOn,
};
