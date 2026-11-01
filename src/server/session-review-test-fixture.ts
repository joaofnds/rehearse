import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sessionAttemptPaths } from "#benchmark/run-layout";
import runSessionJudge from "#benchmark/session-judge";
import type { SessionJudgeRecord } from "#benchmark/session-judge-contract";
import {
	sessionJudgeRequest,
	sessionJudgeResponse,
} from "#benchmark/session-judge-test-fixtures";
import type { SessionReview } from "#benchmark/session-review";
import SavedSessionRecordBuilder from "#server/saved-session-record-test-builder";
import { readSessionReview } from "#server/session-review";

const RESOURCE_DRAIN_START_INDEX = 0;
const roots: string[] = [];
const REVIEW_TIME = "2026-11-01T21:00:00.000Z";
interface ReviewFixture {
	readonly root: string;
	readonly paths: ReturnType<typeof sessionAttemptPaths>;
	readonly id: string;
}
async function savedAttempt(
	judge?: SessionJudgeRecord,
): Promise<ReviewFixture> {
	const root = await mkdtemp(join(tmpdir(), "session-review-"));
	roots.push(root);
	const paths = sessionAttemptPaths(root, {
		caseId: "case-a",
		uuid: "attempt-a",
	});
	await Bun.write(
		paths.recordFile,
		JSON.stringify(new SavedSessionRecordBuilder({ judge }).build()),
	);

	return { id: "attempt:session:case-a/attempt-a", paths, root };
}
async function reviewFor(fixture: ReviewFixture): Promise<SessionReview> {
	const source = await readSessionReview({
		id: fixture.id,
		runsDirectory: fixture.root,
	});
	return {
		requirements: source.requirements.map((id) => ({
			id,
			status: "FAIL" as const,
		})),
		sourceSha256: source.sourceSha256,
		summary: "The reply did not solve the task.",
		verdict: "FAIL" as const,
	};
}
async function clearReviewRoots(): Promise<void> {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

async function judgedAttempt(): Promise<ReviewFixture> {
	const judge = await runSessionJudge(
		sessionJudgeRequest(
			async () => await Promise.resolve(sessionJudgeResponse()),
		),
	);
	return await savedAttempt(judge);
}

async function unavailableJudgedAttempt(): Promise<ReviewFixture> {
	const request = sessionJudgeRequest(
		async () => await Promise.resolve(sessionJudgeResponse()),
	);
	return await savedAttempt(
		await runSessionJudge({
			...request,
			input: { files: [], unavailable: ["The saved final tree is missing"] },
		}),
	);
}

export {
	unavailableJudgedAttempt,
	judgedAttempt,
	savedAttempt,
	reviewFor,
	clearReviewRoots,
	REVIEW_TIME,
};
export type { ReviewFixture };
