import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	MESSAGE_LIMIT_BYTES,
	readLaunchEnding,
	writeLaunchEnding,
} from "./launch-ending";
import { TestResources } from "./test-support";

const LAUNCH_ID = "8a1c0000-0000-4000-8000-000000000356";

const ENDED_AT = "2026-09-29T10:00:02.000Z";

/** "é" takes two bytes, so after this many the limit falls inside it. */
const ONE_BYTE_SHORT_OF_THE_LIMIT = 4095;

const testResources = TestResources.forEachTest();

async function recordsRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-launch-ending-"));
	testResources.track(root);

	return root;
}

async function endingMessage(message: string): Promise<string | undefined> {
	const records = await recordsRoot();
	await writeLaunchEnding(records, LAUNCH_ID, {
		endedAt: ENDED_AT,
		exitCode: 1,
		message,
	});

	const ending = await readLaunchEnding(records, LAUNCH_ID);

	return ending?.message;
}

describe(writeLaunchEnding.name, () => {
	it("keeps a message within the limit whole", async () => {
		const message = "x".repeat(MESSAGE_LIMIT_BYTES);

		expect(await endingMessage(message)).toBe(message);
	});

	it("keeps the opening of a longer message and marks the cut", async () => {
		const message = `${"x".repeat(MESSAGE_LIMIT_BYTES)}tail`;

		expect(await endingMessage(message)).toBe(
			`${"x".repeat(MESSAGE_LIMIT_BYTES)}\n[cut]`,
		);
	});

	it("never cuts a character in half", async () => {
		const message = `${"x".repeat(ONE_BYTE_SHORT_OF_THE_LIMIT)}é`;

		expect(await endingMessage(message)).toBe(
			`${"x".repeat(ONE_BYTE_SHORT_OF_THE_LIMIT)}\n[cut]`,
		);
	});
});
