import { afterEach, describe, expect, it, jest } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";

import type { SessionHistoryReport } from "#benchmark/session-history";
import { stubFetchByPath } from "#client/test-support/fetch-stub";

import {
	originalFetch,
	sessionHeaderEntry,
} from "./history-page-test-fixtures";
import type { SessionHistoryIdentity } from "./session-history-page";
import { SessionHistoryPage } from "./session-history-page";

const stageAttempt: SessionHistoryReport["attempt"] = {
	caseId: "audit-log",
	corpusFiles: [],
	kind: "stage",
	lineage: "lineage-1",
	model: "sonnet",
	run: "2026-09-06T21-58-29.508Z",
	stage: "build",
	upstream: "upstream-1",
};

const sessionAttempt: SessionHistoryReport["attempt"] = {
	caseId: "audit-log",
	corpusFiles: [],
	id: "attempt-a",
	kind: "session",
	model: "sonnet",
	outcome: "SUCCESSFUL",
};

const runHistory = {
	rows: [
		{
			checkpoints: [{ shortId: "audit-log/r4/s2", stage: "build" }],
			kind: "run",
			run: "2026-09-05T00-00-00.000Z",
			shortId: "audit-log/r4",
		},
		{
			checkpoints: [
				{ shortId: "audit-log/r5/s0", stage: "initial" },
				{ shortId: "audit-log/r5/s2", stage: "build" },
				{ shortId: "audit-log/r5/s3", stage: "review" },
			],
			kind: "run",
			run: "2026-09-06T21-58-29.508Z",
			shortId: "audit-log/r5",
		},
		{
			attempt: { count: 3, position: 1 },
			checkpointShortId: "audit-log/r4/s1",
			kind: "replay",
			lineage: "lineage-1",
			shortId: "audit-log/r8",
			timestamp: "2026-09-06T23-00-00.000Z",
		},
		{
			attempt: { count: 3, position: 2 },
			checkpointShortId: "audit-log/r5/s1",
			kind: "replay",
			lineage: "lineage-1",
			shortId: "audit-log/r6",
			timestamp: "2026-09-07T00-00-00.000Z",
		},
		{
			caseId: "audit-log",
			kind: "session-attempt",
			shortId: "audit-log/r7",
			uuid: "attempt-a",
		},
		{
			groupId: "group-a",
			kind: "group",
			repAttempts: [
				{ attempt: { count: 6, position: 1 }, repId: "group-a-rep-1" },
				{ attempt: { count: 6, position: 2 }, repId: "group-a-rep-2" },
			],
			shortId: "audit-log/g13",
		},
	],
	unreadable: [],
};

function renderNamed(
	identity: SessionHistoryIdentity,
	historyPath: string,
	attempt: SessionHistoryReport["attempt"],
): void {
	stubFetchByPath(
		new Map<string, unknown>([
			[
				historyPath,
				{
					attempt,
					attemptEvents: [],
					boundary: "known",
					boundaryUnknown: [],
					evidence: { state: "complete" },
					schemaVersion: 1,
					sources: [],
					startingContext: [],
					startingSources: [],
				},
			],
			["/api/run-listing", runHistory],
		]),
	);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<SessionHistoryPage identity={identity} />
		</QueryClientProvider>,
	);
}

afterEach(() => {
	jest.useRealTimers();
	globalThis.fetch = originalFetch;
});
describe(SessionHistoryPage.name, () => {
	describe("when run history names the record by short id", () => {
		it(
			"names a replay's stage in its selected evidence scope",
			namesAReplaySStageInItsSelectedEvidenceScope,
		);

		it(
			"explains missing saved evidence without suggesting filter recovery",
			explainsMissingSavedEvidenceWithoutSuggestingFilterRecovery,
		);

		it(
			"names a stage's run and the checkpoint it recorded by short id",
			namesAStageSRunAndTheCheckpointItRecordedByShortId,
		);

		it(
			"names a replay, the checkpoint it started from and which attempt there it is",
			namesAReplayTheCheckpointItStartedFromAndWhichAttemptThereItIs,
		);

		it(
			"names a session attempt by short id, with its attempt id beneath",
			namesASessionAttemptByShortIdWithItsAttemptIdBeneath,
		);

		it(
			"names a rep by its position in its group",
			namesARepByItsPositionInItsGroup,
		);
	});
});

async function namesAReplaySStageInItsSelectedEvidenceScope(): Promise<void> {
	renderNamed(
		{
			kind: "replay",
			lineage: "lineage-1",
			timestamp: "2026-09-07T00-00-00.000Z",
		},
		"/api/replays/lineage-1/2026-09-07T00-00-00.000Z/history",
		stageAttempt,
	);

	const scope = await screen.findByRole("region", {
		name: "Selected scope readings",
	});
	expect(scope).toHaveTextContent("Saved evidence · audit-log / build");
	expect(scope).not.toHaveTextContent("/ attempt");
}

async function explainsMissingSavedEvidenceWithoutSuggestingFilterRecovery(): Promise<void> {
	renderNamed(
		{
			kind: "replay",
			lineage: "lineage-1",
			timestamp: "2026-09-07T00-00-00.000Z",
		},
		"/api/replays/lineage-1/2026-09-07T00-00-00.000Z/history",
		stageAttempt,
	);

	expect(
		await screen.findByText("No sources are available in this saved evidence."),
	).toBeInTheDocument();
	expect(
		screen.getByRole("listbox", { name: "Attempt events" }),
	).toHaveTextContent("No events are available in this evidence scope.");
	expect(
		screen.queryByText("No sources match this search."),
	).not.toBeInTheDocument();
	expect(
		screen.queryByText(/Choose All records to include raw chronology/u),
	).not.toBeInTheDocument();
}

async function namesAStageSRunAndTheCheckpointItRecordedByShortId(): Promise<void> {
	renderNamed(
		{ kind: "stage", run: "2026-09-06T21-58-29.508Z", stage: "build" },
		"/api/runs/2026-09-06T21-58-29.508Z/stages/build/history",
		stageAttempt,
	);

	await waitFor(async () => {
		expect(await sessionHeaderEntry("Run")).toHaveTextContent(
			"audit-log/r52026-09-06T21-58-29.508Z",
		);
	});
	expect(await sessionHeaderEntry("Checkpoint")).toHaveTextContent(
		"audit-log/r5/s2",
	);
}

async function namesAReplayTheCheckpointItStartedFromAndWhichAttemptThereItIs(): Promise<void> {
	renderNamed(
		{
			kind: "replay",
			lineage: "lineage-1",
			timestamp: "2026-09-07T00-00-00.000Z",
		},
		"/api/replays/lineage-1/2026-09-07T00-00-00.000Z/history",
		stageAttempt,
	);

	await waitFor(async () => {
		expect(await sessionHeaderEntry("Replay")).toHaveTextContent(
			"audit-log/r62026-09-07T00-00-00.000Z",
		);
	});
	expect(await sessionHeaderEntry("Started from")).toHaveTextContent(
		"audit-log/r5/s1",
	);
	expect(await sessionHeaderEntry("Attempt")).toHaveTextContent(
		"attempt 2 of 3",
	);
	expect(await sessionHeaderEntry("Run")).toHaveTextContent(
		"audit-log/r52026-09-06T21-58-29.508Z",
	);
}

async function namesASessionAttemptByShortIdWithItsAttemptIdBeneath(): Promise<void> {
	renderNamed(
		{ caseId: "audit-log", kind: "standalone", uuid: "attempt-a" },
		"/api/attempts/session/audit-log/attempt-a/history",
		sessionAttempt,
	);

	await waitFor(async () => {
		expect(await sessionHeaderEntry("Attempt")).toHaveTextContent(
			"audit-log/r7attempt-a",
		);
	});
}

async function namesARepByItsPositionInItsGroup(): Promise<void> {
	renderNamed(
		{ groupId: "group-a", kind: "confirmation", repId: "group-a-rep-2" },
		"/api/groups/group-a/reps/group-a-rep-2/attempt/history",
		sessionAttempt,
	);

	await waitFor(async () => {
		expect(await sessionHeaderEntry("Attempt")).toHaveTextContent(
			"attempt 2 of 6 of audit-log/g13attempt-a",
		);
	});
}
