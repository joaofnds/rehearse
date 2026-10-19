import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import {
	preserveStateEvidence,
	restoreStateEvidence,
	runAgainstStateEvidence,
} from "#benchmark/session-state-evidence";

import {
	attemptWithLinks,
	directory,
	resources,
} from "./session-state-evidence-test-fixtures";

resources.registerCleanup();

async function keepsNoLinkIntoThePreservedEvidence(): Promise<void> {
	const attempt = await attemptWithLinks();
	const evidence = await preserveStateEvidence(
		attempt,
		await directory("rehearse-state-record-"),
	);

	expect(await Bun.file(join(evidence, "stolen.txt")).exists()).toBe(false);
	expect(
		await Bun.file(join(evidence, "escape", "operator-secret.txt")).exists(),
	).toBe(false);
}

async function keepsTheFilesTheSessionActuallyWrote(): Promise<void> {
	const attempt = await attemptWithLinks();
	const evidence = await preserveStateEvidence(
		attempt,
		await directory("rehearse-state-record-"),
	);

	expect(await Bun.file(join(evidence, "own-work.txt")).text()).toBe(
		"the session's own\n",
	);
}

async function givesAScorerNoPathToWhatTheLinkPointedAt(): Promise<void> {
	const attempt = await attemptWithLinks();
	const evidence = await preserveStateEvidence(
		attempt,
		await directory("rehearse-state-record-"),
	);
	const restored = await restoreStateEvidence(
		evidence,
		await directory("rehearse-state-restore-"),
	);

	const seen = await runAgainstStateEvidence(
		["sh", "-c", "cat stolen.txt 2>&1 || true"],
		restored,
	);

	expect(seen).not.toContain("not the session's");
}

describe("a link the session left pointing out of its attempt directory", () => {
	it(
		"keeps no link into the preserved evidence",
		keepsNoLinkIntoThePreservedEvidence,
	);
	it(
		"keeps the files the session actually wrote",
		keepsTheFilesTheSessionActuallyWrote,
	);
	it(
		"gives a scorer no path to what the link pointed at",
		givesAScorerNoPathToWhatTheLinkPointedAt,
	);
});
