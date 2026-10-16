import { afterEach, describe, expect, it } from "bun:test";
import { renderAppWithStub } from "#client/test-support/render-app";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Immutable } from "#benchmark/contracts";
import type { ParsedConfirmationRepRecord } from "#benchmark/confirmation-record";
import type { ConfirmationGroupRow } from "#server/run-history";
import { recordStage, runRecord } from "#client/test-support/run-record";
import {
	UNREAD_GROUP_FIGURES,
	UNREAD_STALENESS,
} from "#client/test-support/run-figures";
import { GroupWorkspacePage } from "./group-workspace";
import type { GroupReads } from "./group-workspace";

const originalFetch = globalThis.fetch;
const GROUP = "group-a";
const RUN = "2026-09-06T21-58-29.508Z";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function group(
	overrides: Partial<ConfirmationGroupRow> = {},
): ConfirmationGroupRow {
	return {
		kind: "group",
		recordId: `group:${GROUP}`,
		...UNREAD_GROUP_FIGURES,
		groupId: GROUP,
		shortId: "g1",
		caseId: "audit-log",
		mode: "stage",
		startedAt: "2026-10-01T12:00:00Z",
		checkpoint: { run: RUN, stage: "build" },
		reps: 3,
		corpusVersion: { kind: "version", digest: "a".repeat(64) },
		staleness: UNREAD_STALENESS,
		repAttempts: [{ repId: "rep-1", attempt: { position: 2, count: 4 } }],
		links: [
			{
				state: "unavailable",
				label: "rep 1",
				reason: "a stage group has no session context",
			},
			{
				state: "unavailable",
				label: "rep 2",
				reason: "no attempt recorded for rep-2",
			},
		],
		stageSummaries: [
			{
				stage: "build",
				graded: 2,
				ungraded: { JUDGING_FAILED: 1 },
				grades: { state: "available", median: "B", lowest: "C", highest: "A" },
			},
		],
		finalOutcomes: { NOT_APPLICABLE: 3 },
		successful: 2,
		unreadReps: [{ repId: "rep-2", reason: "record unreadable" }],
		cost: {
			state: "available",
			usd: 6,
			parts: [],
			missing: [{ part: "rep-2", reason: "record unreadable" }],
		},
		wallTime: { state: "available", ms: 90_000 },
		pipelineStages: { state: "available", stages: ["shape", "build"] },
		...overrides,
	};
}

function serve(
	row: ConfirmationGroupRow,
	reads?: Immutable<GroupReads>,
	extra: ReadonlyMap<string, unknown> = new Map(),
): void {
	const source = runRecord({
		run: RUN,
		running: "build",
		stages: [
			recordStage("build", {
				status: "graded",
				grade: {
					state: "available",
					letter: "A",
					verdict: "CONTINUE",
					reachesMinimum: true,
				},
				sessionCost: { state: "available", usd: 1.2 },
				judgeCost: { state: "available", usd: 0.3 },
				wallTime: { state: "available", ms: 30_000 },
				corpusVersion: { kind: "version", digest: "b".repeat(64) },
			}),
		],
	});
	renderAppWithStub(
		`/groups/${GROUP}`,
		new Map<string, unknown>([
			["/api/runs", { rows: [row], launches: [], unreadable: [] }],
			[`/api/groups/${GROUP}/reads`, reads ?? { reps: [], reasons: [] }],
			[`/api/runs/${RUN}`, source],
			...extra,
		]),
	);
}

describe(GroupWorkspacePage.name, () => {
	it("keeps Runs filters when returning explicitly from a group", async () => {
		const router = renderAppWithStub(
			"/?query=audit-log&kind=group&status=ended",
			new Map<string, unknown>([
				["/api/runs", { rows: [group()], launches: [], unreadable: [] }],
				[`/api/groups/${GROUP}/reads`, { reps: [], reasons: [] }],
			]),
		);
		fireEvent.click(await screen.findByRole("link", { name: "g1" }));
		fireEvent.click(await screen.findByRole("link", { name: "← Runs" }));

		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/");
			expect(router.state.location.search).toMatchObject({
				query: "audit-log",
				kind: "group",
				status: "ended",
			});
		});
		expect(
			await screen.findByRole("searchbox", { name: "Search runs" }),
		).toHaveValue("audit-log");
	});

	it("names a source step absent from the saved run", async () => {
		serve(group({ checkpoint: { run: RUN, stage: "deploy" } }));
		expect(
			await screen.findByText("The source run records no deploy step."),
		).toBeInTheDocument();
	});

	it("keeps missing source costs explicit instead of filling them with zero", async () => {
		serve(
			group(),
			undefined,
			new Map([
				[
					`/api/runs/${RUN}`,
					runRecord({
						run: RUN,
						running: "build",
						stages: [
							recordStage("build", {
								status: "graded",
								sessionCost: { state: "available", usd: 1.2 },
								judgeCost: {
									state: "unavailable",
									reasons: ["judge metrics absent"],
								},
							}),
						],
					}),
				],
			]),
		);
		expect(await screen.findByText(/^Source step build:/u)).toHaveTextContent(
			"Worker + Judge session $1.20 · judge cost not recorded: judge metrics absent",
		);
	});

	it("shows a source-read error while retaining the group results", async () => {
		serve(group(), undefined, new Map([[`/api/runs/${RUN}`, undefined]]));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Source step unavailable",
		);
		expect(
			screen.getByRole("heading", { name: "Step results" }),
		).toBeInTheDocument();
	});

	it("shows stage results beside a clearly exploratory source step and frozen reads", async () => {
		serve(group(), {
			reps: [
				{
					repId: "rep-1",
					stage: "build",
					readManifest: [
						{
							path: "skills/build/SKILL.md",
							half: "corpus",
							role: "stage skill",
							evidence: "declared",
							sha256: "c".repeat(64),
							state: "changed",
						},
					],
				},
			],
			reasons: [],
		});

		expect(
			await screen.findByRole("heading", {
				level: 1,
				name: "Group g1",
			}),
		).toBeInTheDocument();
		expect(
			screen.getAllByRole("link", { name: /source run/u })[0],
		).toHaveAttribute("href", `/runs/${RUN}?view=results&step=build`);
		expect(screen.getAllByText(/median B/u)).toHaveLength(2);
		expect(screen.getAllByText(/2 of 3 graded/u)).toHaveLength(2);
		expect(screen.getAllByText(/recorded group total \$6.00/iu)).toHaveLength(
			2,
		);
		expect(screen.getAllByText(/mean unavailable/u)).toHaveLength(2);
		expect(
			screen.getByRole("heading", { name: /exploratory/u }),
		).toBeInTheDocument();
		expect(screen.getByText(/no control/u)).toBeInTheDocument();
		expect(screen.getByText(/Source step build/u)).toHaveTextContent(/A/u);
		expect(screen.getByText(/\$1.50/u)).toBeInTheDocument();
		expect(
			await screen.findByText("skills/build/SKILL.md"),
		).toBeInTheDocument();
		expect(screen.getByText("changed")).toBeInTheDocument();
		expect(
			screen.getByText(/Group cost includes preflight and all reps/u),
		).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "Browse saved comparisons" }),
		).toHaveAttribute("href", "/comparisons");
	});

	it("shows each attempt's real context link or unavailable reason", async () => {
		serve(
			group({
				mode: "session",
				checkpoint: undefined,
				links: [
					{
						state: "available",
						label: "rep 1",
						href: `/groups/${GROUP}/reps/rep-1/attempt`,
					},
					{
						state: "unavailable",
						label: "rep 2",
						reason: "no attempt recorded for rep-2",
					},
				],
			}),
		);

		fireEvent.click(await screen.findByRole("button", { name: "Attempts" }));
		await screen.findByRole("table", { name: "Group attempts" });
		expect(
			within(screen.getByRole("table", { name: "Group attempts" })).getByRole(
				"link",
				{ name: "Results" },
			),
		).toHaveAttribute(
			"href",
			`/groups/${GROUP}/reps/rep-1/attempt?view=results`,
		);
		const list = screen.getByRole("table", { name: "Group attempts" });
		expect(
			within(list).getByRole("link", { name: "Context & cost" }),
		).toHaveAttribute(
			"href",
			`/groups/${GROUP}/reps/rep-1/attempt?view=context`,
		);
		expect(
			screen.getByText(/no attempt recorded for rep-2/u),
		).toBeInTheDocument();
		expect(screen.getByText(/record unreadable/u)).toBeInTheDocument();
	});

	it("links stage rep results even when session context is unavailable", async () => {
		serve(group());
		fireEvent.click(await screen.findByRole("button", { name: "Attempts" }));
		await screen.findByRole("table", { name: "Group attempts" });
		expect(
			within(screen.getByRole("table", { name: "Group attempts" })).getByRole(
				"link",
				{ name: "Results" },
			),
		).toHaveAttribute(
			"href",
			`/groups/${GROUP}/reps/rep-1/attempt?view=results`,
		);
		expect(
			screen.getByText(/a stage group has no session context/u),
		).toBeInTheDocument();
	});

	it("keeps whole-workflow outcomes independent of step grades in pipeline mode", async () => {
		serve(
			group({
				mode: "pipeline",
				checkpoint: undefined,
				finalOutcomes: { PASS: 2, FAIL: 1 },
				unreadReps: [],
				cost: { state: "available", usd: 9, parts: [], missing: [] },
			}),
		);

		expect(await screen.findByText("PASS: 2")).toBeInTheDocument();
		expect(screen.getByText("FAIL: 1")).toBeInTheDocument();
		expect(
			screen.getByText(/independently of the step judges/u),
		).toBeInTheDocument();
		expect(
			screen.getByText(/mean \$3.00 per requested rep/u),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("heading", { name: /Source & replay/u }),
		).not.toBeInTheDocument();
	});

	it("reports a group absent from history without inventing evidence", async () => {
		serve(group({ groupId: "other" }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"No saved group group-a was found",
		);
	});
	it("keeps an ungraded repetition's own missing cost and evidence qualification in one row", async () => {
		const repId = "group-a-rep-2";
		const rep: ParsedConfirmationRepRecord = {
			schemaVersion: 1,
			caseId: "audit-log",
			groupId: GROUP,
			repId,
			ordinal: 2,
			mode: "stage",
			worktreePath: "/work/rep",
			lineage: { kind: "SOURCE", sha: "c".repeat(40) },
			outcome: "UNSUCCESSFUL",
			stages: [
				{
					stage: "build",
					status: "NOT_REACHED",
					reason: "execution stopped earlier",
				},
			],
			finalOutcome: { status: "NOT_APPLICABLE" },
			metrics: {
				status: "MISSING",
				calls: [],
				missing: ["worker metrics absent"],
			},
			workerTrajectorySteps: 0,
			elapsedMs: 12_000,
		};
		serve(
			group({ repAttempts: [] }),
			undefined,
			new Map<string, unknown>([
				[
					"/api/groups/group-a/attempts",
					{ groupId: GROUP, repRecords: [{ repId, ordinal: 2 }] },
				],
				[`/api/groups/${GROUP}/reps/${repId}/attempt/result`, rep],
			]),
		);
		fireEvent.click(await screen.findByRole("button", { name: "Attempts" }));
		await screen.findByRole("table", { name: "Group attempts" });
		const table = screen.getByRole("table", { name: "Group attempts" });
		expect(
			await within(table).findByText("build: NOT REACHED"),
		).toBeInTheDocument();
		expect(within(table).getByText("Repetition 2")).toBeInTheDocument();
		expect(within(table).getByText("Cost unavailable")).toBeInTheDocument();
		expect(within(table).getByText("00:12")).toBeInTheDocument();
		expect(
			within(table).getByText("worker metrics absent"),
		).toBeInTheDocument();
		expect(
			within(table).queryByText(/Checks failed|Grade F/u),
		).not.toBeInTheDocument();
		expect(
			within(table).getByRole("link", { name: "Results" }),
		).toHaveAttribute(
			"href",
			`/groups/${GROUP}/reps/${repId}/attempt?view=results`,
		);
	});
});
