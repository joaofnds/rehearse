import { afterEach, describe, expect, it } from "bun:test";

import { z } from "zod";

import { sessionAttemptPaths } from "#benchmark/run-layout";
import type { SessionReview } from "#benchmark/session-review";
import { sameOrigin } from "#server/app-test-driver";
import { appServer, clearAppRoots } from "#server/app-test-fixture";
import SavedSessionRecordBuilder from "#server/saved-session-record-test-builder";

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const HTTP_FORBIDDEN = 403;
const ID = "attempt:session:case-a/attempt-a";
const PATH = `/api/session-reviews/${encodeURIComponent(ID)}`;
afterEach(clearAppRoots);

async function serverWithAttempt(): Promise<
	Awaited<ReturnType<typeof appServer>>
> {
	const server = await appServer();
	const paths = sessionAttemptPaths(server.runsRoot, {
		caseId: "case-a",
		uuid: "attempt-a",
	});
	await Bun.write(
		paths.recordFile,
		JSON.stringify(new SavedSessionRecordBuilder().build()),
	);

	return server;
}
async function reviewBody(
	response: Readonly<Response>,
): Promise<SessionReview> {
	const { sourceSha256 } = z
		.object({ sourceSha256: z.string() })
		.parse(await response.json());
	return {
		requirements: [],
		sourceSha256,
		summary: "The task is solved.",
		verdict: "PASS",
	};
}

describe("/api/session-reviews/:id", () => {
	it(
		"records and reads a session review through the guarded application",
		recordsAndReadsASessionReviewThroughTheGuardedApplication,
	);
	it(
		"refuses a second review without replacing the first",
		refusesASecondReviewWithoutReplacingTheFirst,
	);
	it(
		"refuses malformed grades without exposing a save",
		refusesMalformedGradesWithoutExposingASave,
	);
	it(
		"refuses a cross-origin write before creating a review",
		refusesACrossOriginWriteBeforeCreatingAReview,
	);
	it.each([
		"attempt:session:../attempt-a",
		"rep:session:../rep-a",
		"attempt:stage:lineage/time",
	])("refuses unsafe or unsupported identity %s", async (id) => {
		const server = await serverWithAttempt();

		const response = await server.driver.read(
			`/api/session-reviews/${encodeURIComponent(id)}`,
		);

		expect(response.status).toBe(HTTP_BAD_REQUEST);
	});
});

async function recordsAndReadsASessionReviewThroughTheGuardedApplication(): Promise<void> {
	const server = await serverWithAttempt();
	const body = await reviewBody(await server.driver.read(PATH));

	const response = await server.driver.writeJson({ body, path: PATH });
	const read = await server.driver.read(PATH);
	const evidence = await server.driver.read(
		`/api/attempt-evidence/${encodeURIComponent(ID)}`,
	);

	expect(response.status).toBe(HTTP_CREATED);
	expect(await evidence.json()).toMatchObject({
		sourceSha256: body.sourceSha256,
	});
	expect(read.status).toBe(HTTP_OK);
	expect(await read.json()).toMatchObject({
		review: { sourceId: ID, summary: body.summary, verdict: "PASS" },
		stale: false,
	});
}

async function refusesASecondReviewWithoutReplacingTheFirst(): Promise<void> {
	const server = await serverWithAttempt();
	const body = await reviewBody(await server.driver.read(PATH));
	await server.driver.writeJson({ body, path: PATH });

	const response = await server.driver.writeJson({
		body: { ...body, summary: "Replace it." },
		path: PATH,
	});
	const read = await server.driver.read(PATH);

	expect(response.status).toBe(HTTP_CONFLICT);
	expect(await read.json()).toMatchObject({
		review: { summary: body.summary },
	});
}

async function refusesMalformedGradesWithoutExposingASave(): Promise<void> {
	const server = await serverWithAttempt();

	const response = await server.driver.writeJson({
		body: { verdict: "MAYBE" },
		path: PATH,
	});
	const read = await server.driver.read(PATH);

	expect(response.status).toBe(HTTP_BAD_REQUEST);
	expect(await read.json()).not.toHaveProperty("review");
}

async function refusesACrossOriginWriteBeforeCreatingAReview(): Promise<void> {
	const server = await serverWithAttempt();
	const body = await reviewBody(await server.driver.read(PATH));

	const response = await server.driver.writeJson({
		body,
		headers: { ...sameOrigin, origin: "https://foreign.example" },
		path: PATH,
	});
	const read = await server.driver.read(PATH);

	expect(response.status).toBe(HTTP_FORBIDDEN);
	expect(await read.json()).not.toHaveProperty("review");
}
