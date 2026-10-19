import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { resolveCorpusSource } from "#benchmark/corpus-source";
import {
	installSessionCorpusSnapshot,
	snapshotSessionCorpus,
} from "#benchmark/session-corpus";

import { directoryCorpus, resources } from "./session-corpus-test-fixtures";

resources.registerCleanup();

/**
 * A declared instruction file lands at `<attempt>/.claude/CLAUDE.md`, which is
 * the path a session reads its project instructions from. Measured on claude
 * 2.1.278: a session run there with `--setting-sources project` reported the
 * overlaid file's marker.
 */
/**
 * A skill is a directory, not a file: its `SKILL.md` refers to the supporting
 * files beside it. Installing only the declared file leaves the session with a
 * skill whose references do not resolve, and `--setting-sources project` means
 * the user-level copy cannot supply them either, so the arm would measure a
 * truncated variant while the record says the declared skill was delivered.
 */
async function overlaysTheSupportingFilesBesideADeclaredSkill(): Promise<void> {
	const root = await directoryCorpus({
		"skills/style/SKILL.md": "read references/notes.md\n",
		"skills/style/references/notes.md": "SUPPORTING_NOTES\n",
	});
	const destination = await resources.createControlDirectory();
	const snapshot = await snapshotSessionCorpus(
		await resolveCorpusSource(root),
		join(destination, "corpus"),
		["skills/style/SKILL.md"],
	);
	const attemptDirectory = await resources.createControlDirectory();

	await installSessionCorpusSnapshot(snapshot, attemptDirectory);

	expect(
		await Bun.file(
			join(attemptDirectory, ".claude/skills/style/references/notes.md"),
		).text(),
	).toBe("SUPPORTING_NOTES\n");
}

async function overlaysADeclaredCLAUDEMdAndSkillAndLeavesAnUndeclaredSiblingOut(): Promise<void> {
	const root = await directoryCorpus({
		"CLAUDE.md": "OVERLAID_INSTRUCTIONS\n",
		"skills/other/SKILL.md": "UNDECLARED_SKILL\n",
		"skills/verify/SKILL.md": "OVERLAID_SKILL\n",
	});
	const destination = await resources.createControlDirectory();
	const snapshot = await snapshotSessionCorpus(
		await resolveCorpusSource(root),
		join(destination, "corpus"),
		["CLAUDE.md", "skills/verify/SKILL.md"],
	);
	const attemptDirectory = await resources.createControlDirectory();

	await installSessionCorpusSnapshot(snapshot, attemptDirectory);

	expect(
		await Bun.file(join(attemptDirectory, ".claude/CLAUDE.md")).text(),
	).toBe("OVERLAID_INSTRUCTIONS\n");
	expect(
		await Bun.file(
			join(attemptDirectory, ".claude/skills/verify/SKILL.md"),
		).text(),
	).toBe("OVERLAID_SKILL\n");
	expect(
		await Bun.file(
			join(attemptDirectory, ".claude/skills/other/SKILL.md"),
		).exists(),
	).toBe(false);
}

async function writesTheSnapshotSOutputStylesAndAgentsUnderTheAttemptSClaude(): Promise<void> {
	const root = await directoryCorpus({
		"agents/reviewer.md": "variant reviewer\n",
		"output-styles/brief.md": "variant brief\n",
	});
	const destination = await resources.createControlDirectory();
	const snapshot = await snapshotSessionCorpus(
		await resolveCorpusSource(root),
		join(destination, "corpus"),
		["output-styles/brief.md", "agents/reviewer.md"],
	);
	const attemptDirectory = await resources.createControlDirectory();

	await installSessionCorpusSnapshot(snapshot, attemptDirectory);

	expect(
		await Bun.file(
			join(attemptDirectory, ".claude/output-styles/brief.md"),
		).text(),
	).toBe("variant brief\n");
	expect(
		await Bun.file(join(attemptDirectory, ".claude/agents/reviewer.md")).text(),
	).toBe("variant reviewer\n");
}

async function writesTheSnapshotSDeclaredRulebookFileUnderTheAttemptSClaude(): Promise<void> {
	const root = await directoryCorpus({
		"rulebook/coding-style.md": "variant coding style\n",
	});
	const destination = await resources.createControlDirectory();
	const snapshot = await snapshotSessionCorpus(
		await resolveCorpusSource(root),
		join(destination, "corpus"),
		["rulebook/coding-style.md"],
	);
	const attemptDirectory = await resources.createControlDirectory();

	await installSessionCorpusSnapshot(snapshot, attemptDirectory);

	expect(
		await Bun.file(
			join(attemptDirectory, ".claude/rulebook/coding-style.md"),
		).text(),
	).toBe("variant coding style\n");
}

async function installsNothingForALiveSourceWhoseFilesTheSessionAlreadyReads(): Promise<void> {
	const destination = await resources.createControlDirectory();
	const snapshot = await snapshotSessionCorpus(
		await resolveCorpusSource(),
		join(destination, "corpus"),
		[],
	);
	const attemptDirectory = await resources.createControlDirectory();

	await installSessionCorpusSnapshot(snapshot, attemptDirectory);

	expect(await Bun.file(join(attemptDirectory, ".claude")).exists()).toBe(
		false,
	);
}

describe(installSessionCorpusSnapshot.name, () => {
	it(
		"overlays the supporting files beside a declared skill",
		overlaysTheSupportingFilesBesideADeclaredSkill,
	);

	it(
		"overlays a declared CLAUDE.md and skill, and leaves an undeclared sibling out",
		overlaysADeclaredCLAUDEMdAndSkillAndLeavesAnUndeclaredSiblingOut,
	);
});

describe(installSessionCorpusSnapshot.name, () => {
	it(
		"writes the snapshot's output styles and agents under the attempt's .claude",
		writesTheSnapshotSOutputStylesAndAgentsUnderTheAttemptSClaude,
	);

	it(
		"writes the snapshot's declared rulebook file under the attempt's .claude",
		writesTheSnapshotSDeclaredRulebookFileUnderTheAttemptSClaude,
	);

	it(
		"installs nothing for a live source, whose files the session already reads",
		installsNothingForALiveSourceWhoseFilesTheSessionAlreadyReads,
	);
});
