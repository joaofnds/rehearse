import { afterEach, describe, expect, it } from "bun:test";
import { renderWithRouter } from "#client/test-support/render-app";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react";
import type { ReplayRow, SessionAttemptRow } from "#server/run-history";
import type { ParsedConfirmationRepRecord } from "#benchmark/confirmation-record";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import {
	UNREAD_REPLAY_FIGURES,
	UNREAD_SESSION_ATTEMPT_FIGURES,
	UNREAD_STALENESS,
} from "#client/test-support/run-figures";
import { AttemptWorkspacePage } from "./attempt-workspace";
import type { SessionHistoryIdentity } from "./session-history-page";

const originalFetch = globalThis.fetch;
const sha = "a".repeat(64);

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function show(
	identity: SessionHistoryIdentity,
	view: "results" | "context",
	routes: ReadonlyMap<string, unknown>,
): void {
	stubFetchByPath(routes);
	renderWithRouter(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<AttemptWorkspacePage identity={identity} view={view} />
		</QueryClientProvider>,
	);
}

function standaloneRow(): SessionAttemptRow {
	return {
		kind: "session-attempt",
		recordId: "attempt:session:case-a/attempt-a",
		caseId: "case-a",
		uuid: "attempt-a",
		shortId: "s01",
		status: "UNSUCCESSFUL",
		corpusVersion: { kind: "version", digest: sha },
		staleness: UNREAD_STALENESS,
		links: [
			{
				state: "available",
				label: "context",
				href: "/attempts/session/case-a/attempt-a",
			},
		],
		...UNREAD_SESSION_ATTEMPT_FIGURES,
		startedAt: "2026-10-01T12:00:00Z",
		checks: { state: "available", passed: 2, declared: 3 },
		cost: { state: "available", usd: 0.37, parts: [], missing: [] },
		wallTime: { state: "available", ms: 72_000 },
	};
}

function replayRow(): ReplayRow {
	return {
		kind: "replay",
		recordId: "attempt:stage:lineage-a/2026-10-01T12:00:00Z",
		lineage: "lineage-a",
		timestamp: "2026-10-01T12:00:00Z",
		shortId: "r01",
		checkpointShortId: "c01",
		attempt: { position: 2, count: 3 },
		caseId: "case-a",
		stage: "build",
		grade: "B",
		status: "CONTINUE",
		corpusVersion: { kind: "version", digest: sha },
		staleness: UNREAD_STALENESS,
		links: [
			{
				state: "available",
				label: "context",
				href: "/replays/lineage-a/2026-10-01T12%3A00%3A00Z",
			},
		],
		...UNREAD_REPLAY_FIGURES,
		cost: { state: "available", usd: 1.24, parts: [], missing: [] },
		wallTime: { state: "available", ms: 45_000 },
		finalOutcome: {
			state: "available",
			status: "NOT_APPLICABLE",
			reason: "A replay grades only this step.",
		},
	};
}

function workflowRep(mode: "stage" | "pipeline"): ParsedConfirmationRepRecord {
	const evidence = { resultSha: "b".repeat(40), recordFile: "result.json" };
	return {
		schemaVersion: 1,
		caseId: "case-a",
		groupId: "group-a",
		repId: "group-a-rep-1",
		ordinal: 1,
		mode,
		worktreePath: "/work/rep",
		lineage: { kind: "SOURCE", sha: "c".repeat(40) },
		outcome: "SUCCESSFUL",
		stages: [
			{
				stage: "build",
				status: "JUDGED",
				grade: "A",
				verdict: "CONTINUE",
				elapsedMs: 30_000,
				evidence,
			},
		],
		finalOutcome:
			mode === "pipeline"
				? { status: "JUDGED", verdict: "PASS", evidence }
				: { status: "NOT_APPLICABLE" },
		metrics: {
			status: "COMPLETE",
			calls: [
				{
					role: "worker",
					metrics: {
						costUsd: 0.04,
						inputTokens: 10,
						outputTokens: 2,
						cacheReadTokens: 0,
						cacheWriteTokens: 0,
						turns: 1,
					},
				},
			],
		},
		workerTrajectorySteps: 1,
		elapsedMs: 40_000,
	};
}

describe(AttemptWorkspacePage.name, () => {
	it("shows unavailable cost when a rep recorded no provider calls", async () => {
		show(
			{ kind: "confirmation", groupId: "group-a", repId: "group-a-rep-1" },
			"results",
			new Map([
				[
					"/api/groups/group-a/reps/group-a-rep-1/attempt/result",
					{
						...workflowRep("stage"),
						metrics: {
							status: "MISSING",
							calls: [],
							missing: ["worker metrics absent"],
						},
					},
				],
			]),
		);
		expect(
			await screen.findByText("Unavailable: no call metrics recorded"),
		).toBeInTheDocument();
		expect(screen.queryByText(/\$0\.00/u)).not.toBeInTheDocument();
	});

	it("refuses a response naming a different confirmation attempt", async () => {
		show(
			{ kind: "confirmation", groupId: "group-a", repId: "group-a-rep-1" },
			"results",
			new Map([
				[
					"/api/groups/group-a/reps/group-a-rep-1/attempt/result",
					{
						...workflowRep("stage"),
						repId: "another-rep",
					},
				],
			]),
		);
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Individual rep result unavailable",
		);
		expect(screen.queryByText("$0.04")).not.toBeInTheDocument();
	});

	it("shows a standalone attempt's own saved checks and measurements", async () => {
		show(
			{ kind: "standalone", caseId: "case-a", uuid: "attempt-a" },
			"results",
			new Map([
				[
					"/api/runs",
					{ rows: [standaloneRow()], launches: [], unreadable: [] },
				],
			]),
		);

		expect(await screen.findByText("2 of 3 checks passed")).toBeTruthy();
		expect(screen.getByText("UNSUCCESSFUL")).toBeTruthy();
		expect(screen.getByText("$0.37")).toBeTruthy();
		expect(screen.getByText("01:12")).toBeTruthy();
		expect(screen.getByText("corpus@aaaaaa")).toBeTruthy();
		expect(
			screen.getByRole("link", { name: "Context & cost" }).getAttribute("href"),
		).toBe("/attempts/session/case-a/attempt-a?view=context");
	});

	it("shows a replay's step grade and actual source run without a workflow verdict", async () => {
		show(
			{
				kind: "replay",
				lineage: "lineage-a",
				timestamp: "2026-10-01T12:00:00Z",
			},
			"results",
			new Map([
				["/api/runs", { rows: [replayRow()], launches: [], unreadable: [] }],
				[
					"/api/replays/lineage-a/2026-10-01T12%3A00%3A00Z/history",
					{
						schemaVersion: 1,
						attempt: { kind: "stage", run: "source-run", stage: "build" },
						evidence: {
							state: "unavailable",
							reasons: ["replay retains none"],
						},
						boundary: "known",
						startingContext: [],
						attemptEvents: [],
						boundaryUnknown: [],
						startingSources: [],
						sources: [],
					},
				],
			]),
		);

		expect(await screen.findByText(/Grade B · CONTINUE/u)).toBeTruthy();
		expect(screen.getByText("A replay grades only this step.")).toBeTruthy();
		expect(screen.queryByText("Final workflow outcome")).toBeNull();
		const sourceStepLink = await screen.findByRole("link", {
			name: "Source step",
		});
		expect(sourceStepLink.getAttribute("href")).toBe(
			"/runs/source-run?view=results&step=build",
		);
	});

	it("shows a confirmation rep's own cost and elapsed time, never group totals", async () => {
		const rep = {
			schemaVersion: 2,
			caseId: "case-a",
			groupId: "group-a",
			repId: "group-a-rep-1",
			ordinal: 1,
			mode: "session",
			lineage: { kind: "SESSION", lineage: "session-lineage" },
			outcome: "SUCCESSFUL",
			stages: [
				{
					stage: "checks",
					status: "JUDGED",
					grade: "A",
					verdict: "CONTINUE",
					elapsedMs: 10_000,
					evidence: { recordFile: "attempt.json" },
				},
			],
			finalOutcome: { status: "NOT_APPLICABLE" },
			metrics: {
				status: "COMPLETE",
				calls: [
					{
						role: "worker",
						metrics: {
							costUsd: 0.02,
							inputTokens: 10,
							outputTokens: 2,
							cacheReadTokens: 0,
							cacheWriteTokens: 0,
							turns: 1,
						},
					},
				],
			},
			workerTrajectorySteps: 1,
			elapsedMs: 12_000,
		};
		show(
			{ kind: "confirmation", groupId: "group-a", repId: "group-a-rep-1" },
			"results",
			new Map<string, unknown>([
				[
					"/api/runs",
					{
						rows: [
							{
								kind: "group",
								groupId: "group-a",
								cost: { state: "available", usd: 99 },
								wallTime: { state: "available", ms: 999_000 },
							},
						],
						launches: [],
						unreadable: [],
					},
				],
				["/api/groups/group-a/reps/group-a-rep-1/attempt/result", rep],
			]),
		);

		expect(await screen.findByText("$0.02")).toBeTruthy();
		expect(screen.getByText("00:12")).toBeTruthy();
		expect(screen.getByText("Grade A · CONTINUE")).toBeTruthy();
		expect(screen.queryByText("$99.00")).toBeNull();
		expect(
			screen.getByRole("link", { name: "Group results" }).getAttribute("href"),
		).toBe("/groups/group-a");
	});

	it("labels a missing individual rep record without borrowing group totals", async () => {
		show(
			{ kind: "confirmation", groupId: "group-a", repId: "group-a-rep-2" },
			"results",
			new Map([
				[
					"/api/runs",
					{
						rows: [
							{
								kind: "group",
								groupId: "group-a",
								cost: { state: "available", usd: 99 },
								wallTime: { state: "available", ms: 999_000 },
							},
						],
						launches: [],
						unreadable: [],
					},
				],
			]),
		);

		expect(
			await screen.findByText(
				"Individual rep result unavailable from its saved record.",
			),
		).toBeTruthy();
		expect(screen.queryByText("$99.00")).toBeNull();
		expect(screen.queryByText("16:39")).toBeNull();
	});

	it("shows a pipeline rep's step and independently judged final outcome", async () => {
		show(
			{ kind: "confirmation", groupId: "group-a", repId: "group-a-rep-1" },
			"results",
			new Map([
				[
					"/api/groups/group-a/reps/group-a-rep-1/attempt/result",
					workflowRep("pipeline"),
				],
			]),
		);

		expect(await screen.findByText("Grade A · CONTINUE")).toBeTruthy();
		expect(screen.getByText("PASS")).toBeTruthy();
		expect(screen.getByText("$0.04")).toBeTruthy();
		expect(screen.getByText("00:40")).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Show parsed saved result JSON" }),
		).toBeTruthy();
	});

	it("shows a stage rep's own result without a final workflow outcome", async () => {
		const identity = {
			kind: "confirmation",
			groupId: "group-a",
			repId: "group-a-rep-1",
		} as const;
		const routes = new Map<string, unknown>([
			[
				"/api/groups/group-a/reps/group-a-rep-1/attempt/result",
				workflowRep("stage"),
			],
		]);
		show(identity, "results", routes);
		expect(await screen.findByText("Grade A · CONTINUE")).toBeTruthy();
		expect(screen.getByText("Not applicable to this rep mode")).toBeTruthy();
	});

	it("does not offer invented session context for a workflow rep", async () => {
		show(
			{ kind: "confirmation", groupId: "group-a", repId: "group-a-rep-1" },
			"context",
			new Map([
				[
					"/api/groups/group-a/reps/group-a-rep-1/attempt/result",
					workflowRep("pipeline"),
				],
			]),
		);
		expect(
			await screen.findByText(
				/pipeline rep has no saved session context view/u,
			),
		).toBeTruthy();
		expect(screen.queryByText("Context & cost · saved evidence")).toBeNull();
	});

	it("embeds saved context with a return to the same attempt's Results", async () => {
		show(
			{ kind: "standalone", caseId: "case-a", uuid: "attempt-a" },
			"context",
			new Map([
				[
					"/api/runs",
					{ rows: [standaloneRow()], launches: [], unreadable: [] },
				],
			]),
		);
		expect(
			await screen.findByText("Context & cost · saved evidence"),
		).toBeTruthy();
		expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
		expect(
			screen.getByRole("link", { name: "Results" }).getAttribute("href"),
		).toBe("/attempts/session/case-a/attempt-a?view=results");

		// The record disclosure belongs to Results, where it is a secondary
		// source of complete evidence, not a second context timeline.
		expect(
			screen.queryByRole("button", { name: "Show saved record JSON" }),
		).toBeNull();
	});

	it("renders saved JSON as text when requested", async () => {
		show(
			{ kind: "standalone", caseId: "case-a", uuid: "attempt-a" },
			"results",
			new Map([
				[
					"/api/runs",
					{ rows: [standaloneRow()], launches: [], unreadable: [] },
				],
				[
					"/api/records/attempt%3Asession%3Acase-a%2Fattempt-a",
					{ reply: "<script>alert(1)</script>" },
				],
			]),
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "Show saved record JSON" }),
		);
		const record = await screen.findByTestId("saved-record-json");
		expect(record.textContent).toContain("<script>alert(1)</script>");
		expect(record.querySelector("script")).toBeNull();
	});
});
