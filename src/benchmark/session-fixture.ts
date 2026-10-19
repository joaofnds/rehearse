import type { Dirent } from "node:fs";
import { cp, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import STORED_GIT_DIRECTORY from "./git-directory-name";
import SessionInputError from "./session-attempt-preparation-contract";
import {
	openFixtureHistory,
	refuseScorerInHistory,
} from "./session-fixture-history";

const FIXTURE_HOOKS_DIRECTORY = join(STORED_GIT_DIRECTORY, "hooks");

async function seedFixture(
	fixturePath: string,
	attemptDirectory: string,
	scorer: readonly string[],
): Promise<void> {
	const entries = await readdir(fixturePath, {
		recursive: true,
		withFileTypes: true,
	});

	let carriesHistory = false;
	for (const entry of entries) {
		carriesHistory = validateFixtureEntry(fixturePath, entry) || carriesHistory;
	}

	const withheld = new Set(scorer.map((file) => join(fixturePath, file)));
	await cp(fixturePath, attemptDirectory, {
		filter: (source) => !withheld.has(source),
		recursive: true,
	});

	if (carriesHistory) {
		await openFixtureHistory(fixturePath, attemptDirectory);
		await refuseScorerInHistory(fixturePath, attemptDirectory, scorer);
	}
}

function validateFixtureEntry(
	fixturePath: string,
	entry: Readonly<Dirent>,
): boolean {
	const entryPath = relative(fixturePath, join(entry.parentPath, entry.name));
	if (entry.isSymbolicLink()) {
		throw new SessionInputError(
			`Fixture entry ${entryPath} is a symlink, which would lead out of the attempt directory`,
		);
	}

	if (entryPath === FIXTURE_HOOKS_DIRECTORY) {
		throw new SessionInputError(
			`Fixture entry ${entryPath} holds git hooks, which the harness would run on this machine outside the case's declared tools`,
		);
	}

	if (entryPath === STORED_GIT_DIRECTORY) {
		if (!entry.isDirectory()) {
			throw new SessionInputError(
				`Fixture entry ${entryPath} is not a directory; a case's history is the bytes it carries, not a pointer to a git directory elsewhere on this machine`,
			);
		}

		return true;
	}
	return false;
}

export { seedFixture as default };
