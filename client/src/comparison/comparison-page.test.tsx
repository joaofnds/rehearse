import { afterEach, describe, expect, it } from "bun:test";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComparisonReport } from "#benchmark/comparison-record";
import type { ComparisonAttribution } from "#server/comparison-attribution";
import type { QualityReading } from "#server/comparison-quality-reading";
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
			group: { path: "group.json", sha256: "0".repeat(64) },
			reps: [
				{
					path: "rep.json",
					sha256: "0".repeat(64),
					repId: "rep-1",
					ordinal: 1,
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

interface ComparisonResponseFixture {
	readonly report: { readonly cases: ComparisonReport["cases"] };
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
	readonly qualityReadings: Readonly<
		Record<
			string,
			Readonly<Record<string, Readonly<Record<string, QualityReading>>>>
		>
	>;
}

function comparisonResponseBody(): ComparisonResponseFixture {
	return {
		attemptHistories: {},
		report: {
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
		qualityReadings: {
			"case-1": {
				candidateMinusBaseline: {
					checks: {
						interval: {
							minuend: { low: "A", high: "A" },
							subtrahend: { low: "A", high: "F" },
						},
						verdict: { kind: "insideRerunNoise" },
					},
				},
				candidateMinusControl: {
					checks: {
						interval: {
							minuend: { low: "A", high: "A" },
							subtrahend: { low: "F", high: "F" },
						},
						verdict: { kind: "separated", arm: "candidate" },
					},
				},
				baselineMinusControl: {
					final: {
						interval: {
							minuend: { low: "PASS", high: "PASS" },
							subtrahend: { low: "PASS", high: "FAIL" },
						},
						verdict: { kind: "unchangedAlreadyClear" },
					},
				},
			},
			"case-2": {
				candidateMinusBaseline: {
					checks: {
						interval: {
							minuend: undefined,
							subtrahend: { low: "D", high: "F" },
						},
						verdict: { kind: "insideRerunNoise" },
					},
				},
				candidateMinusControl: {
					checks: {
						interval: {
							minuend: { low: "A", high: "F" },
							subtrahend: { low: "F", high: "F" },
						},
						verdict: { kind: "insideRerunNoise" },
					},
				},
				baselineMinusControl: {
					checks: {
						interval: {
							minuend: { low: "A", high: "A" },
							subtrahend: { low: "F", high: "F" },
						},
						verdict: { kind: "separated", arm: "baseline" },
					},
				},
			},
		},
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

function qualityRow(
	tableName: string,
	pair: string,
	measure: string,
): HTMLElement {
	const table = screen.getByRole("table", { name: tableName });
	const row = within(table)
		.getAllByRole("row")
		.slice(1)
		.find(
			(candidate) =>
				within(candidate).queryByRole("rowheader", { name: pair }) !== null &&
				within(candidate).queryByRole("cell", { name: measure }) !== null,
		);

	if (row === undefined) {
		throw new Error(`Missing quality row for ${pair} and ${measure}`);
	}

	return row;
}

function expectQualityRow(
	tableName: string,
	expected: Readonly<{
		readonly pair: string;
		readonly measure: string;
		readonly intervals: readonly [string, string];
		readonly verdict: string;
		readonly glyph: string;
	}>,
): void {
	const row = qualityRow(tableName, expected.pair, expected.measure);
	for (const interval of expected.intervals) {
		expect(within(row).getByText(interval)).toBeInTheDocument();
	}
	const verdictCell = within(row).getByRole("cell", {
		name: expected.verdict,
	});
	expect(verdictCell).toHaveTextContent(`${expected.glyph}${expected.verdict}`);
}

describe(ComparisonPage.name, () => {
	it("renders one row per case, not per attempt pair", async () => {
		renderPage();

		const table = await screen.findByRole("table");

		expect(within(table).getByText("case-1")).toBeInTheDocument();
		expect(within(table).getByText("case-2")).toBeInTheDocument();
		expect(within(table).getAllByRole("row")).toHaveLength(3);
	});

	it("renders each arm's grade distribution as counts, never a synthesized median", async () => {
		renderPage();

		await waitFor(() => {
			expect(
				screen.getByRole("rowheader", { name: "case-1" }),
			).toBeInTheDocument();
		});
		expect(screen.getAllByText("A×3").length).toBeGreaterThan(0);
		expect(screen.getAllByText("D×1").length).toBeGreaterThan(0);
		expect(screen.queryByText(/range/iu)).not.toBeInTheDocument();
	});

	it("shows the attempt-pairs table by default, with both switcher options offered", async () => {
		renderPage();

		await waitFor(() => {
			expect(
				screen.getByRole("rowheader", { name: "case-1" }),
			).toBeInTheDocument();
		});
		expect(
			screen.getByRole("button", { name: "Attempt pairs", pressed: true }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "What moved", pressed: false }),
		).toBeInTheDocument();
	});

	it("renders every served quality reading grouped by case", async () => {
		renderPage();

		await waitFor(() => {
			expect(
				screen.getByRole("rowheader", { name: "case-1" }),
			).toBeInTheDocument();
		});
		fireEvent.click(screen.getByRole("button", { name: "What moved" }));

		const caseOne = screen.getByRole("table", {
			name: "WHAT MOVED · case-1",
		});
		const caseTwo = screen.getByRole("table", {
			name: "WHAT MOVED · case-2",
		});
		expect(within(caseOne).getAllByRole("row")).toHaveLength(4);
		expect(within(caseTwo).getAllByRole("row")).toHaveLength(4);
		expectQualityRow("WHAT MOVED · case-1", {
			pair: "candidate vs baseline",
			measure: "checks",
			intervals: ["candidate A to A", "baseline A to F"],
			verdict: "inside rerun noise",
			glyph: "~",
		});
		expectQualityRow("WHAT MOVED · case-1", {
			pair: "candidate vs control",
			measure: "checks",
			intervals: ["candidate A to A", "control F to F"],
			verdict: "candidate separates",
			glyph: "↑",
		});
		expectQualityRow("WHAT MOVED · case-1", {
			pair: "baseline vs control",
			measure: "final",
			intervals: ["baseline PASS to PASS", "control PASS to FAIL"],
			verdict: "unchanged, already clear",
			glyph: "=",
		});
		expectQualityRow("WHAT MOVED · case-2", {
			pair: "candidate vs baseline",
			measure: "checks",
			intervals: ["candidate not reached", "baseline D to F"],
			verdict: "inside rerun noise",
			glyph: "~",
		});
		expectQualityRow("WHAT MOVED · case-2", {
			pair: "candidate vs control",
			measure: "checks",
			intervals: ["candidate A to F", "control F to F"],
			verdict: "inside rerun noise",
			glyph: "~",
		});
		expectQualityRow("WHAT MOVED · case-2", {
			pair: "baseline vs control",
			measure: "checks",
			intervals: ["baseline A to A", "control F to F"],
			verdict: "baseline separates",
			glyph: "↑",
		});
		expect(screen.queryByText("PLANNED")).not.toBeInTheDocument();
		expect(
			screen.queryByText(/needs a per-measure interval/iu),
		).not.toBeInTheDocument();
	});

	it("associates each case with its own attribution reading", async () => {
		renderPage();

		await waitFor(() => {
			expect(
				screen.getByRole("rowheader", { name: "case-1" }),
			).toBeInTheDocument();
		});
		const caseOne = screen.getByRole("region", {
			name: "Attribution · case-1",
		});
		const caseTwo = screen.getByRole("region", {
			name: "Attribution · case-2",
		});
		const attributableCopy =
			"The only corpus difference between these arms is output-styles/brief.md. A movement between them is attributable to that file.";
		expect(
			within(caseOne).getAllByText(
				(_content, element) => element?.textContent === attributableCopy,
			),
		).toHaveLength(3);
		expect(within(caseOne).getAllByText("output-styles/brief.md")).toHaveLength(
			3,
		);
		for (const pair of [
			"candidate vs baseline",
			"candidate vs control",
			"baseline vs control",
		]) {
			expect(within(caseOne).getByText(pair)).toBeInTheDocument();
			expect(within(caseTwo).getByText(pair)).toBeInTheDocument();
		}
		expect(
			within(caseTwo).getAllByText(/refuses the attribution claim/iu),
		).toHaveLength(3);
		expect(within(caseTwo).getAllByText("CLAUDE.md")).toHaveLength(3);
		expect(
			within(caseTwo).getAllByText("skills/discuss/SKILL.md"),
		).toHaveLength(3);
		expect(
			within(caseTwo).queryByText("output-styles/brief.md"),
		).not.toBeInTheDocument();
	});

	it("labels the arm pair lowercase, not 'candidate vs Baseline'", async () => {
		renderPage();

		await waitFor(() => {
			expect(
				screen.getByRole("rowheader", { name: "case-1" }),
			).toBeInTheDocument();
		});
		const caseOne = screen.getByRole("region", {
			name: "Attribution · case-1",
		});
		expect(
			within(caseOne).getByText("candidate vs baseline"),
		).toBeInTheDocument();
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
							repId: "group-a-rep-1",
							ordinal: 1,
							href: "/groups/group-a/reps/group-a-rep-1/attempt",
						},
					],
					candidate: [],
					control: [{ status: "stale", repId: "group-c-rep-1", ordinal: 1 }],
				},
			},
		});

		const region = await screen.findByRole("region", {
			name: "Inspect saved attempt history",
		});
		expect(within(region).getByRole("link", { name: "Rep 1" })).toHaveAttribute(
			"href",
			"/groups/group-a/reps/group-a-rep-1/attempt",
		);
		expect(within(region).getByText("Rep 1 · stale")).toBeInTheDocument();
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

	it("reports no corpus difference, never a false attribution, when the two arms' corpora are identical", async () => {
		stubFetchByPath(
			new Map([
				[
					`/api/comparisons/${DIGEST}`,
					{
						...comparisonResponseBody(),
						attribution: {
							"case-1": {
								candidateMinusBaseline: { claim: "identical" },
							},
						},
					},
				],
			]),
		);
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<ComparisonPage digest={DIGEST} />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(
				screen.getByRole("rowheader", { name: "case-1" }),
			).toBeInTheDocument();
		});
		expect(
			screen.getByText(/no corpus difference between these arms/iu),
		).toBeInTheDocument();
		expect(
			screen.queryByText(/refuses the attribution claim/iu),
		).not.toBeInTheDocument();
	});
});
