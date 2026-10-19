import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { SHELL_BASELINE } from "#client/test-support/render-app";

import { GROUP, group } from "./group-workspace-test-fixtures";

const row = group({
	checkpoint: undefined,
	mode: "session",
	repAttempts: [{ attempt: { count: 2, position: 1 }, repId: "rep-1" }],
	reps: 2,
	successful: 2,
	unreadReps: [],
});

const listing = { launches: [], rows: [row], unreadable: [] };

interface SessionEvidenceGates {
	readonly index: Readonly<PromiseWithResolvers<Response>>;
	readonly missing: Readonly<PromiseWithResolvers<Response>>;
}

function servePendingSessionEvidence(): SessionEvidenceGates {
	stubFetchByPath(
		new Map<string, unknown>([
			...SHELL_BASELINE,
			["/api/runs", listing],
			["/api/run-listing", listing],
		]),
	);
	const answer = globalThis.fetch;
	const index = Promise.withResolvers<Response>();
	const missing = Promise.withResolvers<Response>();
	const stub = async (request: string | URL | Request): Promise<Response> => {
		const { pathname } = new URL(
			request instanceof Request ? request.url : request,
			"http://localhost",
		);
		switch (pathname) {
			case "/api/groups/group-a/attempts": {
				return await index.promise;
			}
			case "/api/attempt-evidence/rep%3Asession%3Agroup-a%2Frep-1": {
				return Response.json({
					kind: "session",
					record: {
						caseId: "audit-log",
						checks: [],
						outcome: "SUCCESSFUL",
						stateResults: [
							{ detail: "Retained.", name: "retained", status: "PASS" },
						],
					},
					state: "available",
				});
			}
			case "/api/attempt-evidence/rep%3Asession%3Agroup-a%2Frep-2": {
				return await missing.promise;
			}
			default: {
				return await answer(request);
			}
		}
	};
	stub.preconnect = fetch.preconnect;
	globalThis.fetch = stub;
	return { index, missing };
}

const SESSION_ATTEMPT_INDEX = {
	caseId: "audit-log",
	groupId: GROUP,
	repRecords: [
		{ ordinal: 1, repId: "rep-1" },
		{ ordinal: 2, repId: "rep-2" },
	],
};

const MISSING_STATE_EVIDENCE = {
	reason: "Saved state evidence missing.",
	state: "unavailable",
};

export {
	MISSING_STATE_EVIDENCE,
	servePendingSessionEvidence,
	SESSION_ATTEMPT_INDEX,
};

export type { SessionEvidenceGates };
