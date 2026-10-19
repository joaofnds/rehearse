import { mkdir, rename } from "node:fs/promises";
import { join } from "node:path";

import { CommandError, runCommand } from "./command";
import STORED_GIT_DIRECTORY from "./git-directory-name";
import SessionInputError from "./session-attempt-preparation-contract";

const EMPTY_COLLECTION_LENGTH = 0;

async function refuseScorerInHistory(
	fixturePath: string,
	attemptDirectory: string,
	scorer: readonly string[],
): Promise<void> {
	if (scorer.length === EMPTY_COLLECTION_LENGTH) {
		return;
	}

	const git = async (args: readonly string[]): Promise<string> =>
		await fixtureHistoryOutput(fixturePath, attemptDirectory, ["git", ...args]);
	const { touched, names } = await storedFixtureObjects(git);

	const exposed: string[] = [];
	await Array.fromAsync(scorer, async (file) => {
		const blob = await git([
			"hash-object",
			"--no-filters",
			"--",
			join(fixturePath, file),
		]);
		if (touched.includes(file) || names.has(blob.trim())) {
			exposed.push(file);
		}
	});

	if (exposed.length > EMPTY_COLLECTION_LENGTH) {
		throw new SessionInputError(
			`Fixture ${fixturePath} holds the scorer ${exposed.join(", ")} in its history, where the session could read how it is graded`,
		);
	}
}

async function openFixtureHistory(
	fixturePath: string,
	attemptDirectory: string,
): Promise<void> {
	const gitDirectory = join(attemptDirectory, ".git");

	await rename(join(attemptDirectory, STORED_GIT_DIRECTORY), gitDirectory);
	await mkdir(join(gitDirectory, "refs", "heads"), { recursive: true });
	await mkdir(join(gitDirectory, "refs", "tags"), { recursive: true });

	await checkFixtureHistory(fixturePath, attemptDirectory);
}

async function checkFixtureHistory(
	fixturePath: string,
	attemptDirectory: string,
): Promise<void> {
	const toplevel = await fixtureHistoryOutput(fixturePath, attemptDirectory, [
		"git",
		"rev-parse",
		"--show-toplevel",
	]);
	if (toplevel.trim() !== attemptDirectory) {
		throw new SessionInputError(
			`Fixture ${fixturePath} seeds a git directory that resolves to ${toplevel.trim()} rather than the attempt directory`,
		);
	}

	await fixtureHistoryOutput(fixturePath, attemptDirectory, [
		"git",
		"log",
		"--format=%H",
	]);
	await fixtureHistoryOutput(fixturePath, attemptDirectory, [
		"git",
		"status",
		"--short",
	]);
}

async function fixtureHistoryOutput(
	fixturePath: string,
	attemptDirectory: string,
	command: readonly string[],
): Promise<string> {
	try {
		return await runCommand(command, attemptDirectory);
	} catch (error) {
		if (error instanceof CommandError) {
			throw new SessionInputError(
				`Fixture ${fixturePath} seeds a git directory that ${command.join(" ")} rejects: ${error.stderr.trim()}`,
			);
		}

		throw error;
	}
}

type FixtureGit = (args: readonly string[]) => Promise<string>;

interface StoredFixtureObjects {
	readonly touched: readonly string[];
	readonly names: ReadonlySet<string | undefined>;
}

async function storedFixtureObjects(
	git: FixtureGit,
): Promise<StoredFixtureObjects> {
	const objects = await git([
		"cat-file",
		"--batch-all-objects",
		"--batch-check=%(objectname) %(objecttype)",
	]);
	const stored = objects.split("\n").map((line) => line.split(" "));
	const commits = stored
		.filter(([, type]) => type === "commit")
		.map(([name]) => name ?? "");
	const touched: string[] = [];
	if (commits.length > EMPTY_COLLECTION_LENGTH) {
		const log = await git([
			"log",
			"--no-walk=unsorted",
			"--root",
			"-m",
			"--format=",
			"--name-only",
			...commits,
			"--",
		]);
		touched.push(...log.split("\n"));
	}
	return { names: new Set(stored.map(([name]) => name)), touched };
}

export { refuseScorerInHistory, openFixtureHistory };
