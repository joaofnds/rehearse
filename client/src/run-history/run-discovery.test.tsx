import { afterEach, expect, it } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderAppWithStub } from "#client/test-support/render-app";
import {
	UNREAD_GROUP_FIGURES,
	UNREAD_RUN_FIGURES,
	UNREAD_SESSION_ATTEMPT_FIGURES,
	UNREAD_REPLAY_FIGURES,
} from "#client/test-support/run-figures";
import type {
	ConfirmationGroupRow,
	PipelineRunRow,
	SessionAttemptRow,
	ReplayRow,
} from "#server/run-history";
import { matchesDiscovery } from "./run-discovery";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

function run(
	id: string,
	verdict?: "PASS" | "FAIL",
	current = true,
): PipelineRunRow {
	return {
		...UNREAD_RUN_FIGURES,
		kind: "run",
		recordId: `run:${id}`,
		run: id,
		shortId: `audit/${id}`,
		caseId: "audit",
		status: "COMPLETE",
		stage: "build",
		grade: "A",
		launchId: undefined,
		checkpoints: [],
		links: [],
		corpusVersion: { kind: "version", digest: "abc" },
		corpusChangedDuringRun: false,
		staleness: {
			state: "available",
			stale: !current,
			causes: [],
			changedFiles: [],
			onlyCorpusFiles: false,
			readManifest: [],
			distance: { kind: "measured", versions: current ? 0 : 1 },
		},
		progress: { state: "recorded" },
		finalOutcome:
			verdict === undefined
				? UNREAD_RUN_FIGURES.finalOutcome
				: { state: "available", status: "JUDGED", verdict },
	};
}

it.each([
	["SUCCESSFUL", false, true],
	["UNSUCCESSFUL", true, false],
	["NO_REPLY", false, false],
	["EXECUTION_FAILED", false, false],
] as const)(
	"separates session %s quality from execution gaps",
	(status, failed, passed) => {
		const row: SessionAttemptRow = {
			...UNREAD_SESSION_ATTEMPT_FIGURES,
			kind: "session-attempt",
			recordId: "attempt:session:case:uuid",
			uuid: "uuid",
			caseId: "case",
			shortId: undefined,
			status,
			corpusVersion: undefined,
			staleness: run("reference").staleness,
			links: [],
		};

		expect(matchesDiscovery(row, { status: "failed" })).toBe(failed);
		expect(matchesDiscovery(row, { status: "passed" })).toBe(passed);
		expect(matchesDiscovery(row, { status: "ended" })).toBe(true);
	},
);

it.each([
	["STOP", true, false],
	["CONTINUE", false, true],
] as const)(
	"classifies replay %s from its recorded verdict",
	(status, failed, passed) => {
		const row: ReplayRow = {
			...UNREAD_REPLAY_FIGURES,
			kind: "replay",
			recordId: "attempt:stage:lineage:timestamp",
			lineage: "lineage",
			timestamp: "timestamp",
			shortId: undefined,
			checkpointShortId: undefined,
			attempt: undefined,
			caseId: "case",
			stage: "build",
			grade: "C",
			status,
			corpusVersion: undefined,
			staleness: run("reference").staleness,
			links: [],
		};

		expect(matchesDiscovery(row, { status: "failed" })).toBe(failed);
		expect(matchesDiscovery(row, { status: "passed" })).toBe(passed);
	},
);

it("keeps stale corpus selection separate from current and unmeasured corpus", () => {
	const stale = run("old", "PASS", false);
	const current = run("current", "PASS");
	const unknown = {
		...stale,
		staleness: {
			state: "unavailable",
			reasons: ["No corpus measurement"],
		} as const,
	};

	expect(matchesDiscovery(stale, { corpus: "stale" })).toBe(true);
	expect(matchesDiscovery(current, { corpus: "stale" })).toBe(false);
	expect(matchesDiscovery(unknown, { corpus: "stale" })).toBe(false);
});

it("intersects Failed and current corpus, searches IDs, and clears an empty result", async () => {
	renderAppWithStub(
		"/",
		new Map([
			[
				"/api/runs",
				{
					rows: [
						run("failed", "FAIL"),
						run("old", "FAIL", false),
						run("missing"),
						{ ...run("error"), status: "FAILED" },
						run("passed", "PASS"),
					],
					launches: [],
					unreadable: [],
				},
			],
		]),
	);
	await screen.findByRole("table", { name: "Run history" });
	fireEvent.click(screen.getByRole("button", { name: "Failed" }));
	fireEvent.click(screen.getByRole("button", { name: "Current corpus" }));
	await waitFor(() => {
		const table = screen.getByRole("table", { name: "Run history" });
		expect(within(table).getAllByRole("row")).toHaveLength(2);
		expect(within(table).getByText("failed")).toBeInTheDocument();
	});
	fireEvent.change(screen.getByRole("searchbox", { name: "Search runs" }), {
		target: { value: "no-match" },
	});
	await screen.findByText("No record matches this filter and search.");
	fireEvent.click(screen.getByRole("button", { name: "Clear" }));
	await waitFor(() => {
		expect(
			within(screen.getByRole("table", { name: "Run history" })).getAllByRole(
				"row",
			),
		).toHaveLength(6);
	});
	fireEvent.change(screen.getByRole("searchbox", { name: "Search runs" }), {
		target: { value: "audit/passed" },
	});
	await waitFor(() => {
		expect(
			within(screen.getByRole("table", { name: "Run history" })).getAllByRole(
				"row",
			),
		).toHaveLength(2);
	});
});

it("restores discovery from the Runs navigation after inspecting a run", async () => {
	const router = renderAppWithStub(
		"/",
		new Map([
			[
				"/api/runs",
				{
					rows: [run("failed", "FAIL"), run("passed", "PASS")],
					launches: [],
					unreadable: [],
				},
			],
		]),
	);
	await screen.findByRole("table", { name: "Run history" });
	fireEvent.click(screen.getByRole("button", { name: "Failed" }));
	fireEvent.click(screen.getByRole("button", { name: "Current corpus" }));
	fireEvent.change(screen.getByRole("searchbox", { name: "Search runs" }), {
		target: { value: "audit/failed" },
	});
	await waitFor(() => {
		expect(router.state.location.search).toMatchObject({
			query: "audit/failed",
			status: "failed",
			corpus: "current",
		});
	});
	fireEvent.click(
		within(screen.getByRole("table", { name: "Run history" })).getByRole(
			"link",
			{ name: "failed" },
		),
	);
	await waitFor(() => {
		expect(router.state.location.pathname).toBe("/runs/failed");
	});
	fireEvent.click(
		within(screen.getByRole("navigation", { name: "Sections" })).getByRole(
			"link",
			{ name: /^Runs/u },
		),
	);
	expect(
		await screen.findByRole("searchbox", { name: "Search runs" }),
	).toHaveValue("audit/failed");
	expect(screen.getByRole("button", { name: "Failed" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	expect(
		screen.getByRole("button", { name: "Current corpus" }),
	).toHaveAttribute("aria-pressed", "true");
});

it("includes stopped steps only when their recorded grade falls below the run's own minimum", async () => {
	function stopped(
		id: string,
		minimum: string,
		letter: string,
		reachesMinimum: boolean,
	): PipelineRunRow {
		return {
			...run(id),
			status: "STOPPED:build",
			minimumGrade: { state: "available", letter: minimum },
			stageGrades: {
				state: "available",
				grades: [
					{
						stage: "build",
						status: "stopped",
						grade: {
							state: "available",
							letter,
							verdict: reachesMinimum ? "STOP" : "CONTINUE",
							reachesMinimum,
						},
					},
				],
			},
		};
	}
	renderAppWithStub(
		"/?status=failed",
		new Map([
			[
				"/api/runs",
				{
					rows: [
						stopped("below-high-minimum", "A+", "A", false),
						stopped("above-low-minimum", "D", "C", true),
						{ ...run("unjudged-stop"), status: "STOPPED:build" },
						{
							...stopped("missing-minimum", "A+", "A", false),
							minimumGrade: UNREAD_RUN_FIGURES.minimumGrade,
						},
					],
					launches: [],
					unreadable: [],
				},
			],
		]),
	);
	const table = await screen.findByRole("table", { name: "Run history" });
	expect(within(table).getAllByRole("row")).toHaveLength(2);
	expect(within(table).getByText("below-high-minimum")).toBeInTheDocument();
});

it("finds failed stage and session groups without classifying unjudged errors as quality failures", async () => {
	function group(
		groupId: string,
		mode: "stage" | "session",
		qualityFailures: number,
	): ConfirmationGroupRow {
		return {
			...UNREAD_GROUP_FIGURES,
			kind: "group",
			recordId: `group:${groupId}`,
			groupId,
			shortId: undefined,
			caseId: "audit",
			mode,
			reps: 2,
			corpusVersion: undefined,
			staleness: run("scope").staleness,
			checkpoint: undefined,
			repAttempts: [],
			links: [],
			finalOutcomes: { NOT_APPLICABLE: 2 },
			qualityFailures,
		};
	}
	renderAppWithStub(
		"/?status=failed&kind=group",
		new Map([
			[
				"/api/runs",
				{
					rows: [
						group("stage-failure", "stage", 1),
						group("checks-failure", "session", 1),
						group("missing-judgment", "stage", 0),
					],
					launches: [],
					unreadable: [],
				},
			],
		]),
	);
	const table = await screen.findByRole("table", { name: "Run history" });
	expect(within(table).getAllByRole("row")).toHaveLength(3);
	expect(within(table).getByText("stage-failure")).toBeInTheDocument();
	expect(within(table).getByText("checks-failure")).toBeInTheDocument();
	expect(within(table).queryByText("missing-judgment")).not.toBeInTheDocument();
});
