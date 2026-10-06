import { afterEach, describe, expect, it } from "bun:test";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComparisonBaselineArm } from "#benchmark/comparison-baseline-record";
import type { ComparisonReport } from "#benchmark/comparison-record";
import type { MoreAttemptsCost } from "#benchmark/more-attempts-cost";
import type { ArmFigures } from "#server/comparison-arm-figures";
import type { CaseAttempts } from "#server/comparison-attempts";
import type { ComparisonAttribution } from "#server/comparison-attribution";
import type { ComparisonProvenance } from "#server/comparison-provenance";
import type { CaseSummary } from "#server/comparison-summary";
import type { WhatMovedRow } from "#server/comparison-what-moved";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { ComparisonPage } from "./comparison-page";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const DIGEST = "d".repeat(64);

type ReportArm = ComparisonReport["cases"][number]["arms"]["baseline"];

const CANDIDATE_CLEARS = Object.fromEntries([
	["A", 3],
	["D", 1],
]);
const BASELINE_LAGS = Object.fromEntries([
	["A", 1],
	["D", 3],
]);

function arm(
	role: ReportArm["role"],
	hash: string,
	gradeDistribution: Readonly<Record<string, number>>,
): ReportArm {
	return {
		role,
		source: {
			groups: [{ path: "group.json", sha256: "0".repeat(64) }],
			reps: [
				{
					path: "rep.json",
					sha256: "0".repeat(64),
					repId: "rep-1",
					ordinal: 1,
					group: 0,
					outcomes: [
						{
							name: "final",
							status: "JUDGED",
							grade: "PASS",
							successful: true,
						},
					],
				},
			],
		},
		executedCorpus: [{ path: "CLAUDE.md", sha256: hash.repeat(64) }],
		quality: [
			{
				name: "final",
				requested: 4,
				attempted: 4,
				notReached: 0,
				failed: 0,
				successful: 4,
				gradeDistribution,
				successRate: 1,
				standardError: 0,
				passK: 1,
			},
		],
		resources: {
			status: "UNAVAILABLE",
			completeReps: 0,
			missingMetricReps: 1,
			missingEvidence: [{ repId: "rep-1", ordinal: 1, missing: ["worker"] }],
		},
	};
}

interface ComparisonResponseFixture extends ComparisonProvenance {
	readonly report: {
		readonly mode: ComparisonReport["mode"];
		readonly cases: ComparisonReport["cases"];
	};
	readonly armFigures: Readonly<
		Record<string, Readonly<Record<ReportArm["role"], ArmFigures>>>
	>;
	readonly baselineArm: ComparisonBaselineArm;
	readonly attempts: Readonly<Record<string, CaseAttempts>>;
	readonly summary: Readonly<Record<string, CaseSummary>>;
	readonly attemptHistories: Readonly<
		Record<
			string,
			Readonly<
				Record<
					"baseline" | "candidate" | "control",
					readonly (
						| {
								readonly status: "available";
								readonly repId: string;
								readonly ordinal: number;
								readonly href: string;
						  }
						| {
								readonly status: "stale";
								readonly repId: string;
								readonly ordinal: number;
						  }
					)[]
				>
			>
		>
	>;
	readonly attribution: Readonly<
		Record<string, Readonly<Record<string, ComparisonAttribution>>>
	>;
	readonly whatMoved: Readonly<Record<string, readonly WhatMovedRow[]>>;
}

const PASSED_EVERY_ATTEMPT: ArmFigures = {
	measures: { final: { scale: "successRate", successful: 4, attempts: 4 } },
	cost: { state: "available", totalUsd: 2, perAttemptUsd: 0.5 },
	words: { state: "unavailable", reasons: ["no words recorded"] },
};

const PASSED: CaseAttempts["baseline"][number] = {
	repId: "rep-1",
	ordinal: 1,
	outcomes: {
		state: "available",
		outcomes: [
			{ name: "final", status: "JUDGED", grade: "PASS", successful: true },
		],
	},
	blockersFired: { state: "unavailable", reason: "no blocker grading" },
	words: { state: "unavailable", reason: "no word count" },
};

const ONE_ATTEMPT_EACH: CaseAttempts = {
	baseline: [PASSED],
	candidate: [PASSED],
	control: [PASSED],
};

const ONE_EQUAL_COMBINATION: CaseSummary["contrasts"][string][string] = {
	verdict: { kind: "insideRerunNoise" },
	combinations: { state: "available", higher: 0, equal: 1, lower: 0, of: 1 },
};

function caseSummary(moreAttempts: MoreAttemptsCost): CaseSummary {
	return {
		contrasts: {
			candidateMinusBaseline: { checks: ONE_EQUAL_COMBINATION },
		},
		replyLength: {
			interval: { minuend: undefined, subtrahend: undefined },
			change: undefined,
			verdict: { kind: "unavailable", reasons: ["no word count"] },
		},
		moreAttempts,
	};
}

const NOT_RECORDED = {
	state: "unavailable",
	reasons: ["version not recorded"],
} as const;

const FINAL_ROW: WhatMovedRow = {
	kind: "overall",
	name: "final",
	arms: {
		control: { scale: "successRate", successful: 1, attempts: 1 },
		baseline: { scale: "successRate", successful: 1, attempts: 1 },
		candidate: { scale: "successRate", successful: 1, attempts: 1 },
	},
	readings: {
		candidateMinusBaseline: {
			interval: {
				minuend: { low: "21%", high: "100%" },
				subtrahend: { low: "21%", high: "100%" },
			},
			verdict: { kind: "insideRerunNoise" },
		},
	},
};

const NO_WORDS = "this report records no word count for its attempts";

const UNRECORDED_LENGTH_ROW: WhatMovedRow = {
	kind: "meter",
	name: "replyLength",
	arms: {
		control: { state: "unavailable", reasons: [NO_WORDS] },
		baseline: { state: "unavailable", reasons: [NO_WORDS] },
		candidate: { state: "unavailable", reasons: [NO_WORDS] },
	},
	readings: {
		candidateMinusBaseline: {
			interval: { minuend: undefined, subtrahend: undefined },
			change: undefined,
			verdict: { kind: "unavailable", reasons: [NO_WORDS] },
		},
	},
};

function comparisonResponseBody(): ComparisonResponseFixture {
	const caseFigures = {
		baseline: PASSED_EVERY_ATTEMPT,
		candidate: PASSED_EVERY_ATTEMPT,
		control: PASSED_EVERY_ATTEMPT,
	};
	const caseVersions = {
		baseline: NOT_RECORDED,
		candidate: NOT_RECORDED,
		control: NOT_RECORDED,
	};

	return {
		checkpoint: {
			state: "unavailable",
			reasons: ["a session comparison replays no single checkpoint"],
		},
		corpusVersions: { "case-1": caseVersions, "case-2": caseVersions },
		armFigures: { "case-1": caseFigures, "case-2": caseFigures },
		attemptHistories: {},
		baselineArm: { kind: "supplied" },
		attempts: { "case-1": ONE_ATTEMPT_EACH, "case-2": ONE_ATTEMPT_EACH },
		summary: {
			"case-1": caseSummary({
				state: "unavailable",
				reasons: ["rep-1 lacks worker"],
			}),
			"case-2": caseSummary({
				state: "unavailable",
				reasons: ["rep-1 lacks worker"],
			}),
		},
		report: {
			mode: "session",
			cases: [
				{
					caseId: "case-1",
					arms: {
						baseline: arm("baseline", "1", BASELINE_LAGS),
						candidate: arm("candidate", "2", CANDIDATE_CLEARS),
						control: arm("control", "3", BASELINE_LAGS),
					},
				},
				{
					caseId: "case-2",
					arms: {
						baseline: arm("baseline", "4", BASELINE_LAGS),
						candidate: arm("candidate", "5", CANDIDATE_CLEARS),
						control: arm("control", "6", BASELINE_LAGS),
					},
				},
			],
		},
		attribution: {
			"case-1": {
				candidateMinusBaseline: {
					claim: "attributable",
					differingPath: "output-styles/brief.md",
					differingPaths: ["output-styles/brief.md"],
				},
				candidateMinusControl: {
					claim: "attributable",
					differingPath: "output-styles/brief.md",
					differingPaths: ["output-styles/brief.md"],
				},
				baselineMinusControl: {
					claim: "attributable",
					differingPath: "output-styles/brief.md",
					differingPaths: ["output-styles/brief.md"],
				},
			},
			"case-2": {
				candidateMinusBaseline: {
					claim: "refused",
					differingPaths: ["CLAUDE.md", "skills/discuss/SKILL.md"],
				},
				candidateMinusControl: {
					claim: "refused",
					differingPaths: ["CLAUDE.md", "skills/discuss/SKILL.md"],
				},
				baselineMinusControl: {
					claim: "refused",
					differingPaths: ["CLAUDE.md", "skills/discuss/SKILL.md"],
				},
			},
		},
		whatMoved: { "case-1": [FINAL_ROW], "case-2": [UNRECORDED_LENGTH_ROW] },
	};
}

function renderPage(
	body: ComparisonResponseFixture = comparisonResponseBody(),
): void {
	stubFetchByPath(new Map([[`/api/comparisons/${DIGEST}`, body]]));
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<ComparisonPage digest={DIGEST} />
		</QueryClientProvider>,
	);
}

describe(ComparisonPage.name, () => {
	it("draws each case's attempts with what the pairing says and why to read it with care", async () => {
		renderPage();

		const caseTwo = await screen.findByRole("region", {
			name: "Attempt pairs · case-2",
		});

		expect(
			within(caseTwo).getByRole("table", { name: "Attempt pairs · case-2" }),
		).toBeInTheDocument();
		expect(
			within(caseTwo).getByRole("region", { name: "What the pairing says" }),
		).toBeInTheDocument();
		expect(
			within(caseTwo).getByRole("region", { name: "Read with care" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("region", { name: "Attempt pairs · case-1" }),
		).toBeInTheDocument();
	});

	it("feeds each case's cards that case's mode, attempts and A to B attribution", async () => {
		const body = comparisonResponseBody();
		renderPage({
			...body,
			report: { ...body.report, mode: "pipeline" },
			attempts: {
				...body.attempts,
				"case-1": {
					control: [PASSED],
					baseline: [PASSED, PASSED],
					candidate: [PASSED, PASSED, PASSED],
				},
			},
			summary: {
				...body.summary,
				"case-1": {
					...caseSummary({ state: "unavailable", reasons: ["no cost"] }),
					contrasts: {
						candidateMinusBaseline: {
							review: ONE_EQUAL_COMBINATION,
							final: ONE_EQUAL_COMBINATION,
						},
					},
				},
			},
		});

		const caseOne = await screen.findByRole("region", {
			name: "Attempt pairs · case-1",
		});
		const says = within(caseOne).getByRole("region", {
			name: "What the pairing says",
		});
		const care = within(caseOne).getByRole("region", {
			name: "Read with care",
		});

		expect(says).toHaveTextContent("Arm B against arm A on final");
		expect(says).not.toHaveTextContent("on review");
		expect(care).toHaveTextContent("Baseline 1, arm A 2 and arm B 3 attempts.");
		expect(care).toHaveTextContent(
			"Only output-styles/brief.md differs between arms A and B",
		);
		expect(
			within(caseOne).getByText(
				"No attempt history to open: a pipeline comparison's attempts record no session.",
			),
		).toBeInTheDocument();
	});

	it("keeps each case's arm cards in view in both presentations", async () => {
		renderPage();
		await screen.findByRole("region", { name: "Arms · case-1" });

		fireEvent.click(screen.getByRole("button", { name: "What moved" }));

		expect(
			screen.getByRole("region", { name: "Arms · case-1" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("region", { name: "Arms · case-2" }),
		).toBeInTheDocument();
	});

	it("draws each case's arm cards from that case's own records", async () => {
		const body = comparisonResponseBody();
		const caseTwo = body.armFigures["case-2"];
		if (caseTwo === undefined) {
			throw new Error("Expected the fixture to hold case-2's figures");
		}
		renderPage({
			...body,
			armFigures: {
				...body.armFigures,
				"case-2": {
					...caseTwo,
					candidate: {
						...PASSED_EVERY_ATTEMPT,
						cost: { state: "available", totalUsd: 7, perAttemptUsd: 7 },
					},
				},
			},
		});

		const caseTwoBand = await screen.findByRole("region", {
			name: "Arms · case-2",
		});
		const caseOneBand = screen.getByRole("region", { name: "Arms · case-1" });

		expect(
			within(caseTwoBand).getByRole("article", { name: "ARM B" }),
		).toHaveTextContent("$7.00");
		expect(
			within(caseOneBand).getByRole("article", { name: "ARM B" }),
		).toHaveTextContent("$2.00");
	});

	describe("header", () => {
		const CHECKPOINT_RUN = "2026-09-28T10-03-07.498Z";

		function oneCheckpointStageComparison(): ComparisonResponseFixture {
			const body = comparisonResponseBody();

			return {
				...body,
				report: { mode: "stage", cases: body.report.cases.slice(0, 1) },
				armFigures: {
					"case-1": {
						baseline: PASSED_EVERY_ATTEMPT,
						candidate: PASSED_EVERY_ATTEMPT,
						control: PASSED_EVERY_ATTEMPT,
					},
				},
				checkpoint: { state: "available", run: CHECKPOINT_RUN, stage: "shape" },
			};
		}

		it("names the step and checkpoint of a one-checkpoint stage comparison", async () => {
			renderPage(oneCheckpointStageComparison());

			expect(
				await screen.findByRole("heading", {
					level: 1,
					name: `Comparison · shape replay from run ${CHECKPOINT_RUN}`,
				}),
			).toBeInTheDocument();
		});

		it("names the checkpoint by its short id once its run holds one", async () => {
			const body = oneCheckpointStageComparison();
			renderPage({
				...body,
				checkpoint: {
					state: "available",
					run: CHECKPOINT_RUN,
					stage: "shape",
					shortId: "case-1/r4/s1",
				},
			});

			expect(
				await screen.findByRole("heading", {
					level: 1,
					name: "Comparison · shape replay at case-1/r4/s1",
				}),
			).toBeInTheDocument();
		});

		it("names the mode and cases of a comparison that replays no single checkpoint", async () => {
			renderPage();

			expect(
				await screen.findByRole("heading", {
					level: 1,
					name: "Comparison · session · case-1, case-2",
				}),
			).toBeInTheDocument();
		});

		it("states the attempts per arm, what the arms share and their summed cost", async () => {
			renderPage(oneCheckpointStageComparison());

			expect(
				await screen.findByText(
					"1 attempt per arm · same checkpoint, same case · $6.00 total",
				),
			).toBeInTheDocument();
		});

		it("shares only the cases between arms that replayed no single checkpoint", async () => {
			renderPage();

			expect(
				await screen.findByText(
					"1 attempt per arm · same cases · $12.00 total",
				),
			).toBeInTheDocument();
		});

		it("states the fewest and most attempts when the arms hold different numbers", async () => {
			const body = comparisonResponseBody();
			const [caseOne, caseTwo] = body.report.cases;
			if (caseOne === undefined || caseTwo === undefined) {
				throw new Error("Expected the fixture to hold two cases");
			}
			const { candidate } = caseTwo.arms;
			const [rep] = candidate.source.reps;
			if (rep === undefined) {
				throw new Error("Expected the fixture's arm to hold an attempt");
			}
			renderPage({
				...body,
				report: {
					...body.report,
					cases: [
						caseOne,
						{
							...caseTwo,
							arms: {
								...caseTwo.arms,
								candidate: {
									...candidate,
									source: {
										...candidate.source,
										reps: [rep, { ...rep, repId: "rep-2", ordinal: 2 }],
									},
								},
							},
						},
					],
				},
			});

			expect(
				await screen.findByText(
					"1 to 2 attempts per arm · same cases · $12.00 total",
				),
			).toBeInTheDocument();
		});

		it("counts the arms that recorded no cost rather than adding a zero", async () => {
			const body = comparisonResponseBody();
			const unrecorded: ArmFigures = {
				...PASSED_EVERY_ATTEMPT,
				cost: { state: "unavailable", reasons: ["rep-1 lacks worker cost"] },
			};
			renderPage({
				...body,
				armFigures: {
					...body.armFigures,
					"case-2": {
						baseline: PASSED_EVERY_ATTEMPT,
						candidate: PASSED_EVERY_ATTEMPT,
						control: unrecorded,
					},
				},
			});

			expect(
				await screen.findByText(
					"1 attempt per arm · same cases · $10.00 recorded · cost not recorded for 1 arm",
				),
			).toBeInTheDocument();
		});
	});

	it("shows the attempt-pairs table by default, with both switcher options offered", async () => {
		renderPage();

		await screen.findByRole("region", { name: "Attempt pairs · case-1" });
		expect(
			screen.getByRole("button", { name: "Attempt pairs", pressed: true }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "What moved", pressed: false }),
		).toBeInTheDocument();
	});

	it("draws each case's What moved rows from that case's own served rows", async () => {
		renderPage();

		fireEvent.click(await screen.findByRole("button", { name: "What moved" }));

		const caseOne = screen.getByRole("table", { name: "What moved · case-1" });
		const caseTwo = screen.getByRole("table", { name: "What moved · case-2" });
		expect(
			within(caseOne)
				.getAllByRole("rowheader")
				.map((header) => header.textContent),
		).toEqual(["finaloverall"]);
		expect(within(caseOne).getByText("inside rerun noise")).toBeInTheDocument();
		expect(
			within(caseTwo)
				.getAllByRole("rowheader")
				.map((header) => header.textContent),
		).toEqual(["reply lengthmeter"]);
		expect(within(caseTwo).getByText("unavailable")).toBeInTheDocument();
	});

	it("states only arm A against arm B's attribution for each case under What moved", async () => {
		renderPage();

		fireEvent.click(await screen.findByRole("button", { name: "What moved" }));

		const caseOne = screen.getByRole("region", {
			name: "Attribution · case-1",
		});
		const caseTwo = screen.getByRole("region", {
			name: "Attribution · case-2",
		});
		expect(caseOne).toHaveTextContent(
			"The only difference between arms A and B is output-styles/brief.md.",
		);
		expect(within(caseOne).getAllByText("output-styles/brief.md")).toHaveLength(
			1,
		);
		expect(caseTwo).toHaveTextContent(
			"2 files differ between arms A and B, so no movement between them is attributed to one file.",
		);
		expect(screen.queryByText(/vs control/u)).not.toBeInTheDocument();
	});

	it("links only comparison reps whose saved provenance is still valid", async () => {
		const body = comparisonResponseBody();
		renderPage({
			...body,
			attemptHistories: {
				"case-1": {
					baseline: [
						{
							status: "available",
							repId: "rep-1",
							ordinal: 1,
							href: "/groups/group-a/reps/rep-1/attempt",
						},
					],
					candidate: [],
					control: [{ status: "stale", repId: "rep-1", ordinal: 1 }],
				},
			},
		});

		const table = await screen.findByRole("table", {
			name: "Attempt pairs · case-1",
		});
		expect(
			within(table).getByRole("link", { name: "Arm A attempt 1 history" }),
		).toHaveAttribute("href", "/groups/group-a/reps/rep-1/attempt");
		expect(within(table).getByText("history stale")).toBeInTheDocument();
	});

	it("renders the empty state, not a generic error, when no comparison is recorded for the digest", async () => {
		const stub = (): Promise<Response> =>
			Promise.resolve(Response.json({ error: "not found" }, { status: 404 }));
		stub.preconnect = fetch.preconnect;
		globalThis.fetch = stub;
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<ComparisonPage digest={DIGEST} />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("No comparison recorded")).toBeInTheDocument();
		});
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("says no file explains a movement, never a false attribution, when arms A and B ran identical corpora", async () => {
		renderPage({
			...comparisonResponseBody(),
			attribution: {
				"case-1": { candidateMinusBaseline: { claim: "identical" } },
				"case-2": { candidateMinusBaseline: { claim: "identical" } },
			},
		});

		fireEvent.click(await screen.findByRole("button", { name: "What moved" }));

		expect(
			screen.getByRole("region", { name: "Attribution · case-1" }),
		).toHaveTextContent(
			"Arms A and B ran identical corpora, so no file explains a movement between them.",
		);
		expect(
			screen.queryByText(/attributable to that file/u),
		).not.toBeInTheDocument();
	});

	it("says why a comparison whose author supplied the baseline arm cannot take more attempts", async () => {
		renderPage();

		const caseOne = await screen.findByRole("region", {
			name: "Attempt pairs · case-1",
		});

		expect(
			within(caseOne).getByText(
				/^More attempts cannot be added: this comparison was not made by compare attempts/u,
			),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /attempts? to each arm/u }),
		).not.toBeInTheDocument();
	});

	describe("when compare attempts made the comparison", () => {
		function comparedAttempts(
			moreAttempts: MoreAttemptsCost,
		): ComparisonResponseFixture {
			const body = comparisonResponseBody();

			return {
				...body,
				report: { ...body.report, cases: body.report.cases.slice(0, 1) },
				baselineArm: {
					kind: "derived",
					skillUnderTest: "skills/discuss/SKILL.md",
				},
				summary: { "case-1": caseSummary(moreAttempts) },
			};
		}

		it("offers arm A's attempt count again in every arm, at its stated cost", async () => {
			renderPage(
				comparedAttempts({ state: "available", attemptsPerArm: 4, usd: 18 }),
			);

			fireEvent.click(
				await screen.findByRole("button", {
					name: "Add 4 attempts to each arm · ≈ $18.00",
				}),
			);

			expect(
				await screen.findByText(
					"about $18.00, at each arm's mean recorded cost per attempt",
				),
			).toBeInTheDocument();
		});

		it("says why more attempts cannot be offered when their cost cannot be stated", async () => {
			renderPage(
				comparedAttempts({
					state: "unavailable",
					reasons: ["rep-1 lacks worker.costUsd"],
				}),
			);

			expect(
				await screen.findByText(
					"What more attempts would cost cannot be stated: rep-1 lacks worker.costUsd.",
				),
			).toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: /attempts? to each arm/u }),
			).not.toBeInTheDocument();
		});
	});
});
