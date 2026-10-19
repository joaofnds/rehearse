import { afterEach, describe, expect, it } from "bun:test";
import { symlink } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { z } from "zod";

import LaunchHttpDriver from "#server/launch-http-test-driver";
import {
	LaunchFixture,
	NOTHING_RUNNING,
	refusalSchema,
} from "#server/launch-http-test-fixture";

const launchFixture = new LaunchFixture();

const { temporaryDirectory } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

const OVERSIZED_REASON_CHARACTERS = 1000;

const sizeSchema = z.object({ bytes: z.number() });

describe("GET /api/settings/records", () => {
	it(
		"sums the bytes of the regular files under the records directory",
		verifySumsTheBytesOfTheRegularFilesUnderThe,
	);
	it(
		"reads a records directory that does not exist yet as empty",
		verifyReadsARecordsDirectoryThatDoesNotExistYet,
	);
	it(
		"refuses a records directory it cannot read, naming the directory",
		verifyRefusesARecordsDirectoryItCannotReadNamingThe,
	);
});

async function verifySumsTheBytesOfTheRegularFilesUnderThe(): Promise<void> {
	const runsDirectory = await temporaryDirectory("rehearse-sized-runs-");
	await Promise.all([
		Bun.write(join(runsDirectory, "settings.json"), "123"),
		Bun.write(join(runsDirectory, "runs", "a", "manifest.json"), "12345"),
	]);
	const outside = await temporaryDirectory("rehearse-sized-outside-");
	await Bun.write(
		join(outside, "large.bin"),
		"x".repeat(OVERSIZED_REASON_CHARACTERS),
	);
	await symlink(join(outside, "large.bin"), join(runsDirectory, "link"));
	await symlink(outside, join(runsDirectory, "runs", "linked-directory"));
	const { get } = new LaunchHttpDriver({
		casesRoot: outside,
		liveness: NOTHING_RUNNING,
		runsDirectory,
	});

	const response = await get("/api/settings/records");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(sizeSchema.parse(await response.json())).toEqual({ bytes: 8 });
}

async function verifyReadsARecordsDirectoryThatDoesNotExistYet(): Promise<void> {
	const absent = join(
		await temporaryDirectory("rehearse-sized-parent-"),
		"runs",
	);
	const { get } = new LaunchHttpDriver({
		casesRoot: absent,
		liveness: NOTHING_RUNNING,
		runsDirectory: absent,
	});

	const response = await get("/api/settings/records");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(sizeSchema.parse(await response.json())).toEqual({ bytes: 0 });
}

async function verifyRefusesARecordsDirectoryItCannotReadNamingThe(): Promise<void> {
	const runsDirectory = await temporaryDirectory("rehearse-sized-runs-");
	const locked = join(runsDirectory, "locked");
	await launchFixture.lockDirectory(locked);
	const { get } = new LaunchHttpDriver({
		casesRoot: runsDirectory,
		liveness: NOTHING_RUNNING,
		runsDirectory,
	});

	const response = await get("/api/settings/records");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toContain("locked");
}
