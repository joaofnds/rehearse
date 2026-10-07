import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { StageJudge } from "#server/stage-judge";
import type { StageAttempts } from "#server/stage-attempts";
import type { StageSession } from "#server/stage-session";
import type { RunRecord, RunRecordStage } from "#server/run-record";
import { RUN, renderRunDetail, stoppedAtBuild } from "./run-detail-fixtures";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

/** The stopped run with shape's checkpoint, wall time and cost recorded. */
function stoppedWithFigures(): RunRecord {
	const record = stoppedAtBuild();
	const figures: Partial<RunRecordStage> = {
		checkpointShortId: { state: "available", shortId: "c-0147-1" },
		wallTime: { state: "available", ms: 242_000 },
		sessionCost: { state: "available", usd: 1.02 },
		judgeCost: { state: "available", usd: 0.1 },
	};

	const [first, ...later] = record.stages;

	return {
		...record,
		stages: first === undefined ? [] : [{ ...first, ...figures }, ...later],
	};
}

const BUILD_JUDGE = `/api/runs/${RUN}/stages/build/judge`;

const BUILD_SESSION = `/api/runs/${RUN}/stages/build/session`;

const SKILL_HASH = "a41c7e".padEnd(64, "0");

/** The stopped run with build's figures and reads recorded. */
function stoppedWithBuildFigures(
	figures: Partial<RunRecordStage> = {},
): RunRecord {
	const record = stoppedAtBuild();
	const recorded: Partial<RunRecordStage> = {
		wallTime: { state: "available", ms: 242_000 },
		sessionCost: { state: "available", usd: 1 },
		judgeCost: { state: "available", usd: 0.12 },
		readManifest: {
			state: "available",
			entries: [
				{
					path: "skills/implement/SKILL.md",
					half: "corpus",
					role: "stage skill",
					evidence: "declared and observed",
					sha256: SKILL_HASH,
					state: "unchanged",
				},
				{
					path: "skills/review/SKILL.md",
					half: "corpus",
					role: "read for context",
					evidence: "observed",
					sha256: "9f30d1".padEnd(64, "0"),
					state: "changed",
				},
				{
					path: "CLAUDE.md",
					half: "project",
					role: "project instructions",
					evidence: "observed",
					sha256: "77aa01".padEnd(64, "0"),
				},
				{
					path: "CLAUDE.md",
					half: "corpus",
					role: "global instructions",
					evidence: "declared",
				},
				{
					path: "skills/plan/SKILL.md",
					half: "corpus",
					role: "read for context",
					evidence: "observed",
					sha256: "5be0c2".padEnd(64, "0"),
				},
			],
		},
		...figures,
	};
	const [first, second, ...later] = record.stages;

	return {
		...record,
		stages:
			first === undefined || second === undefined
				? []
				: [first, { ...second, ...recorded }, ...later],
	};
}

function buildJudged(): StageJudge {
	return {
		state: "judged",
		hardBlockers: [
			{
				id: "scope-declared-before-edit",
				status: "FAIL",
				evidence: [
					{
						source: "transcript",
						path: "transcript",
						claim: "The agent chose a scope without asking",
						quote: "I'll take the small scope",
						place: "exchange 3 message, characters 0-25",
					},
				],
			},
			{ id: "no-secrets-in-diff", status: "PASS", evidence: [] },
			{
				id: "tests-pass-before-handoff",
				status: "FAIL",
				evidence: [
					{
						source: "diff",
						path: "src/auth/tokens.ts",
						claim: "The handoff left a failing test",
					},
				],
			},
		],
		dimensions: [
			{
				id: "scope-discipline",
				grade: "C",
				evidence: [
					{
						source: "diff",
						path: "src/a.ts",
						claim: "Edits files outside the declared scope",
						place: "src/a.ts:3-4",
					},
					{
						source: "transcript",
						path: "transcript",
						claim: "Never restates the scope",
					},
				],
			},
			{ id: "test-quality", grade: "B", evidence: [] },
		],
	};
}

function closedSession(): StageSession {
	return {
		state: "closed",
		spans: [],
		lineCount: 1284,
		transcriptPath: `.benchmark-runs/${RUN}.build.session/transcript.jsonl`,
	};
}

function renderBuildReport(
	record: RunRecord = stoppedWithBuildFigures(),
	session: StageSession = closedSession(),
): void {
	renderRunDetail(
		new Map<string, unknown>([
			[`/api/runs/${RUN}`, record],
			[BUILD_JUDGE, buildJudged()],
			[BUILD_SESSION, session],
		]),
	);
}

async function stepReport(): Promise<HTMLElement> {
	const report = await screen.findByRole("region", { name: "Step report" });
	await within(report).findByRole("list", { name: "Hard blockers" });

	return report;
}

async function stepButtons(): Promise<readonly HTMLElement[]> {
	const steps = await screen.findByRole("region", { name: "Steps" });

	return within(
		within(steps).getByRole("list", { name: "Steps and checkpoints" }),
	).getAllByRole("button");
}

describe("Step rail", () => {
	it("lists every stage in order with its number, name, grade, status, checkpoint, wall time and cost", async () => {
		renderRunDetail(new Map([[`/api/runs/${RUN}`, stoppedWithFigures()]]));

		const [first, second, third] = await stepButtons();

		expect(first).toHaveTextContent(
			/^01shapeA✓acceptedc-0147-1 · 4m02s · \$1\.12$/u,
		);
		expect(second).toHaveTextContent(/^02buildD◼stopped/u);
		expect(third).toHaveTextContent(/^03verify.*○never ran$/u);
	});

	it("marks the selected stage as the current step", async () => {
		renderRunDetail();

		const buttons = await stepButtons();

		expect(
			buttons.map((button) => button.getAttribute("aria-current")),
		).toEqual([null, "step", null]);
	});

	it("shows the report of the stage chosen and writes it to the URL", async () => {
		const router = renderRunDetail();
		await stepButtons();

		fireEvent.click(screen.getByRole("button", { name: /^shape/u }));

		expect(
			await screen.findByRole("heading", { level: 2, name: "Step 1 · shape" }),
		).toBeInTheDocument();
		await waitFor(() => {
			expect(router.state.location.search).toEqual({ step: "shape" });
		});
	});

	describe("step report", () => {
		it("titles the report with the stage's skill, wall time, cost and transcript lines", async () => {
			renderBuildReport();

			const report = await stepReport();

			expect(
				await within(report).findByText(
					"skills/implement/SKILL.md · 4m02s · $1.12 · 1,284 transcript lines",
				),
			).toBeInTheDocument();
		});

		it("states the grade against the run's minimum and counts the blockers that fired", async () => {
			renderBuildReport();

			const report = await stepReport();

			expect(
				within(report).getByRole("group", { name: "Grade" }),
			).toHaveTextContent("GradeDmin B");
			expect(
				within(report).getByRole("group", { name: "Verdict" }),
			).toHaveTextContent("Verdict◼stopped2 blockers fired");
		});

		it("lists each hard blocker as fired or clear", async () => {
			renderBuildReport();

			const report = await stepReport();
			const rows = within(
				within(report).getByRole("list", { name: "Hard blockers" }),
			).getAllByRole("listitem");

			expect(rows.map((row) => row.textContent)).toEqual([
				"✕scope-declared-before-editfired1 cited",
				"✓no-secrets-in-diffclearno evidence",
				"✕tests-pass-before-handofffired1 cited",
			]);
		});

		it("lists each quality dimension with its grade and the judge's first claim as its note", async () => {
			renderBuildReport();

			const report = await stepReport();
			const rows = within(
				within(report).getByRole("list", { name: "Quality dimensions" }),
			).getAllByRole("listitem");

			expect(rows.map((row) => row.textContent)).toEqual([
				"scope-disciplineEdits files outside the declared scope▮▮▮▯▯C2 cited",
				"test-quality▮▮▮▮▯Bno evidence",
			]);
		});

		it("reads each instruction file the stage read with its hash and whether it changed since the run", async () => {
			renderBuildReport();

			const report = await stepReport();
			const rows = within(
				within(report).getByRole("table", {
					name: "Instructions this step read",
				}),
			).getAllByRole("row");

			expect(rows.map((row) => row.textContent)).toEqual([
				"PathHashSince this run",
				"skills/implement/SKILL.mda41c7e✓unchanged",
				"skills/review/SKILL.md9f30d1⚠changed since this run",
				"CLAUDE.md77aa01not compared · a project file is not part of the corpus",
				"CLAUDE.mdno hashnot compared · no hash was recorded",
				"skills/plan/SKILL.md5be0c2not compared · the corpus under test cannot compare it",
			]);
		});

		it("reads the instructions a stage read as not recorded when its reads are unavailable", async () => {
			renderBuildReport(
				stoppedWithBuildFigures({
					readManifest: {
						state: "unavailable",
						reasons: ["the stage recorded no reads"],
					},
				}),
			);

			const report = await stepReport();

			expect(
				await within(report).findByText(
					"Instructions read not recorded: the stage recorded no reads",
				),
			).toBeInTheDocument();
		});

		it("reads a figure the records lack as not recorded with its reason", async () => {
			renderBuildReport(
				stoppedWithBuildFigures({
					wallTime: {
						state: "unavailable",
						reasons: ["the stage record has no elapsed time"],
					},
				}),
				{ state: "closed", spans: [] },
			);

			const report = await stepReport();

			expect(
				await within(report).findByText(
					"skills/implement/SKILL.md · wall time not recorded: the stage record has no elapsed time · $1.12 · transcript not recorded: Rehearse kept no copy of this step's session",
				),
			).toBeInTheDocument();
		});

		it("reads the cost a record lacks part of as each part, not a partial sum", async () => {
			renderBuildReport(
				stoppedWithBuildFigures({
					sessionCost: {
						state: "unavailable",
						reasons: ["the provider reported no session cost"],
					},
				}),
			);

			const report = await stepReport();

			expect(
				await within(report).findByText(
					/session cost not recorded: the provider reported no session cost · judge \$0\.12/u,
				),
			).toBeInTheDocument();
		});

		it("reads an old stop's transcript link as not recorded", async () => {
			renderBuildReport(stoppedWithBuildFigures(), {
				state: "closed",
				spans: [],
			});

			const report = await stepReport();

			expect(
				await within(report).findByText(
					"Session on disk: not recorded: Rehearse kept no copy of this step's session",
				),
			).toBeInTheDocument();
			expect(within(report).queryByRole("link")).toBeNull();
		});

		it("says a judge or session it could not read, without an alert", async () => {
			renderRunDetail(
				new Map<string, unknown>([
					[`/api/runs/${RUN}`, stoppedWithBuildFigures()],
				]),
			);

			const report = await screen.findByRole("region", {
				name: "Step report",
			});

			expect(
				await within(report).findByText("Could not read this step's judge."),
			).toBeInTheDocument();
			expect(
				await within(report).findByText(
					/transcript not read: could not read this step's session/u,
				),
			).toBeInTheDocument();
			expect(within(report).queryByRole("alert")).toBeNull();
		});

		it("links the stage's transcript on disk", async () => {
			renderBuildReport();

			const report = await stepReport();

			expect(
				await within(report).findByRole("link", {
					name: `.benchmark-runs/${RUN}.build.session/transcript.jsonl`,
				}),
			).toHaveAttribute("href", `/runs/${RUN}/stages/build`);
		});

		it("opens several rows' evidence at once, each item with its source, place or path, and quote", async () => {
			renderBuildReport();

			const report = await stepReport();
			for (const toggle of within(report).getAllByRole("button", {
				name: "1 cited",
			})) {
				fireEvent.click(toggle);
			}

			const open = within(report).getAllByRole("button", {
				name: "hide evidence",
			});
			expect(open).toHaveLength(2);
			expect(open[0]).toHaveAttribute("aria-expanded", "true");
			expect(report).toHaveTextContent(
				"transcriptexchange 3 message, characters 0-25I'll take the small scope",
			);
			expect(report).toHaveTextContent("diffsrc/auth/tokens.ts");
			expect(
				within(report).getAllByRole("button", { name: "no evidence" })[0],
			).toHaveAttribute("aria-disabled", "true");
		});

		it("styles nothing on a stopped run as an error", async () => {
			renderBuildReport();

			await stepReport();
			const rail = screen.getByRole("region", { name: "Steps" }).parentElement;

			expect(
				rail?.querySelectorAll(
					'[class*="destructive"], [class*="danger"], [role="alert"]',
				),
			).toHaveLength(0);
		});
	});

	describe("attempts at the checkpoint", () => {
		const BUILD_ATTEMPTS = `/api/runs/${RUN}/stages/build/attempts`;
		const DIGEST = "c0ffee".padEnd(64, "0");

		/** A replay and a confirmation rep at build's checkpoint beside the original run. */
		function attemptsAtBuild(): StageAttempts {
			return {
				checkpoint: "audit-log/r2/s1",
				attempts: [
					{
						kind: "original",
						id: "audit-log/r2",
						staleness: {
							state: "available",
							stale: true,
							causes: ["skills/build/SKILL.md changed"],
							changedFiles: [
								{ path: "skills/build/SKILL.md", change: "changed" },
							],
							onlyCorpusFiles: true,
							readManifest: [],
							distance: { kind: "measured", versions: 1 },
						},
					},
					{
						kind: "replay",
						id: "audit-log/r3",
						grade: "B",
						corpusVersion: { kind: "version", digest: DIGEST },
						staleness: {
							state: "available",
							stale: false,
							causes: [],
							changedFiles: [],
							onlyCorpusFiles: true,
							readManifest: [],
							distance: { kind: "measured", versions: 0 },
						},
					},
					{
						kind: "replay",
						id: "audit-log/r4",
						grade: "C",
						corpusVersion: { kind: "version", digest: DIGEST },
						staleness: {
							state: "available",
							stale: false,
							causes: [],
							changedFiles: [],
							onlyCorpusFiles: true,
							readManifest: [],
							distance: { kind: "measured", versions: 2 },
						},
					},
					{
						kind: "rep",
						id: "audit-log/g5 rep 1",
						grade: "A",
						corpusVersion: undefined,
						staleness: {
							state: "unavailable",
							reasons: [
								"the group froze no pipeline to hash its stages against",
							],
						},
					},
				],
			};
		}

		it("lists the original run, a replay and a rep at the checkpoint the selected step started from", async () => {
			renderRunDetail(new Map([[BUILD_ATTEMPTS, attemptsAtBuild()]]));

			const list = await screen.findByRole("list", {
				name: "Attempts at audit-log/r2/s1",
			});
			const items = within(list).getAllByRole("listitem");

			expect(
				screen.getByRole("heading", { name: "Attempts at audit-log/r2/s1" }),
			).toBeInTheDocument();
			expect(items.map((item) => item.textContent)).toEqual([
				"audit-log/r2Doriginal run · version not recorded⚠ stale · skills/build/SKILL.md changed",
				"audit-log/r3Breplay · corpus@c0ffee✓ current corpus",
				"audit-log/r4Creplay · corpus@c0ffee✓ clear · nothing it read changed across 2 later corpus versions",
				"audit-log/g5 rep 1Aconfirmation rep · version not recordedstaleness not known: the group froze no pipeline to hash its stages against",
			]);
			expect(
				screen.getByRole("link", { name: "Compare these attempts" }),
			).toHaveAttribute("href", "/comparisons");
		});

		it("reads the attempts of the step chosen in the rail", async () => {
			renderRunDetail(
				new Map([
					[BUILD_ATTEMPTS, attemptsAtBuild()],
					[
						`/api/runs/${RUN}/stages/shape/attempts`,
						{ checkpoint: "audit-log/r2/s0", attempts: [] },
					],
				]),
			);
			await screen.findByRole("list", { name: "Attempts at audit-log/r2/s1" });

			fireEvent.click(screen.getByRole("button", { name: /shape/u }));

			expect(
				await screen.findByRole("list", {
					name: "Attempts at audit-log/r2/s0",
				}),
			).toBeInTheDocument();
		});
	});
});
