import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import { renderAppWithStub } from "#client/test-support/render-app";

import {
	DIGEST,
	OTHER_DIGEST,
	indexWith,
	originalFetch,
	renderComparisonsAt,
	savedComparison,
	sharedCaseIndex,
} from "./comparison-index-test-fixtures";
import ComparisonsPage from "./comparisons-page";

interface ComparisonEntryPoint {
	readonly entry: string;
	readonly name: string | Readonly<RegExp>;
}
const COMPARISON_ENTRY_POINTS: readonly ComparisonEntryPoint[] = [
	{ entry: "case link", name: /audit-log.*7e0f9a31c2d8/u },
	{ entry: "Open action", name: "Open comparison" },
];

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(ComparisonsPage.name, () => {
	it(
		"summarizes a shared changed file once while keeping each case in setup",
		summarizesASharedChangedFileOnceWhileKeepingEachCaseInSetup,
	);

	it(
		"links each saved comparison by case with its digest available",
		linksEachSavedComparisonByCaseWithItsDigestAvailable,
	);

	describe("saved comparisons for the same case", sameCaseComparisonRecords);

	it(
		"shows each saved comparison's mode, cases and reps",
		showsEachSavedComparisonSModeCasesAndReps,
	);

	it.each([...COMPARISON_ENTRY_POINTS])(
		"opens the chosen comparison through its $entry",
		opensComparisonEntryPoint,
	);
});

async function summarizesASharedChangedFileOnceWhileKeepingEachCaseInSetup(): Promise<void> {
	const expectedMatchingElementsCount = 1;

	const versions = {
		baseline: {
			digest: "a".repeat(SHA256_HEX_CHARACTERS),
			state: "available",
		},
		candidate: {
			digest: "b".repeat(SHA256_HEX_CHARACTERS),
			state: "available",
		},
		control: {
			digest: "c".repeat(SHA256_HEX_CHARACTERS),
			state: "available",
		},
	} as const;
	renderComparisonsAt(
		indexWith({
			comparisons: [
				{
					...savedComparison(DIGEST),
					caseIds: ["audit-log", "brief-reply"],
					details: ["audit-log", "brief-reply"].map((caseId) => ({
						caseId,
						changedPaths: ["output-styles/brief.md"],
						corpusVersions: versions,
					})),
				},
			],
		}),
	);

	const list = await screen.findByRole("list", { name: "Saved comparisons" });
	expect(
		within(
			within(list).getByRole("list", { name: "Changed instructions" }),
		).getAllByText("output-styles/brief.md").length,
	).toBe(expectedMatchingElementsCount);
	expect(within(list).getByText("2 requested per arm")).toBeInTheDocument();

	fireEvent.click(within(list).getByText("Setup & record"));

	expect(
		within(list).getByRole("region", { name: "Setup for audit-log" }),
	).toHaveTextContent("output-styles/brief.md");
	expect(
		within(list).getByRole("region", { name: "Setup for brief-reply" }),
	).toHaveTextContent("output-styles/brief.md");
}

async function linksEachSavedComparisonByCaseWithItsDigestAvailable(): Promise<void> {
	renderComparisonsAt(
		indexWith({
			comparisons: [savedComparison(DIGEST), savedComparison(OTHER_DIGEST)],
		}),
	);

	const first = await screen.findByRole("link", {
		name: /audit-log.*511cd2c4442b/u,
	});
	const second = screen.getByRole("link", {
		name: /audit-log.*7e0f9a31c2d8/u,
	});

	expect(first).toHaveAttribute("href", `/comparisons/${DIGEST}`);
	expect(second).toHaveAttribute("href", `/comparisons/${OTHER_DIGEST}`);
}

function sameCaseComparisonRecords(): void {
	beforeEach(opensSharedCaseComparisonIndex);
	it(
		"distinguishes records by their changed instruction paths and timestamp coverage",
		distinguishesChangedInstructions,
	);
	it(
		"keeps the first recorded corpus pair in collapsed setup",
		opensFirstRecordedCorpusPair,
	);
	it(
		"keeps the second record's different candidate corpus",
		opensSecondRecordedCorpusPair,
	);
}
async function opensSharedCaseComparisonIndex(): Promise<void> {
	renderComparisonsAt(sharedCaseIndex());
	await screen.findByRole("listitem", { name: /audit-log.*511cd2c4442b/u });
}
async function distinguishesChangedInstructions(): Promise<void> {
	const first = await screen.findByRole("listitem", {
		name: /audit-log.*511cd2c4442b/u,
	});
	const second = screen.getByRole("listitem", {
		name: /audit-log.*7e0f9a31c2d8/u,
	});
	expect(
		within(
			within(first).getByRole("list", { name: "Changed instructions" }),
		).getByText("skills/review/SKILL.md"),
	).toBeVisible();
	expect(
		within(second).getByRole("list", { name: "Changed instructions" }),
	).toHaveTextContent("skills/build/SKILL.md");
}
async function opensFirstRecordedCorpusPair(): Promise<void> {
	const first = await screen.findByRole("listitem", {
		name: /audit-log.*511cd2c4442b/u,
	});
	const setup = within(first).getByRole("region", {
		hidden: true,
		name: "Setup for audit-log",
	});
	expect(setup).not.toBeVisible();
	fireEvent.click(within(first).getByText("Setup & record"));
	expect(setup).toBeVisible();
	expect(
		within(setup)
			.getAllByRole("term")
			.map((term) => [term.textContent, term.nextElementSibling?.textContent]),
	).toEqual([
		["baseline", "corpus@aaaaaa"],
		["candidate", "corpus@bbbbbb"],
		["control", "corpus@cccccc"],
	]);
	expect(within(first).getByText("Comparison time not recorded")).toBeVisible();
}
async function opensSecondRecordedCorpusPair(): Promise<void> {
	const first = await screen.findByRole("listitem", {
		name: /audit-log.*511cd2c4442b/u,
	});
	const second = screen.getByRole("listitem", {
		name: /audit-log.*7e0f9a31c2d8/u,
	});
	fireEvent.click(within(first).getByText("Setup & record"));
	fireEvent.click(within(second).getByText("Setup & record"));
	const otherSetup = within(second).getByRole("region", {
		name: "Setup for audit-log",
	});
	expect(
		within(otherSetup)
			.getAllByRole("term")
			.map((term) => [term.textContent, term.nextElementSibling?.textContent]),
	).toEqual([
		["baseline", "corpus@aaaaaa"],
		["candidate", "corpus@dddddd"],
		["control", "corpus@cccccc"],
	]);
}

async function showsEachSavedComparisonSModeCasesAndReps(): Promise<void> {
	renderComparisonsAt(
		indexWith({
			comparisons: [
				{
					caseIds: ["audit-log", "brief-reply"],
					digest: DIGEST,
					mode: "pipeline",
					reps: 5,
				},
			],
		}),
	);

	const row = await screen.findByRole("listitem", {
		name: /audit-log.*511cd2c4442b/u,
	});

	expect(within(row).getByRole("heading", { level: 2 })).toHaveTextContent(
		"audit-log, brief-reply",
	);
	expect(within(row).getByText("511cd2c4442b")).toBeVisible();
	expect(within(row).getByText("pipeline")).toBeVisible();
	expect(within(row).getByText("5 requested per arm")).toBeVisible();
	expect(within(row).getByText(DIGEST)).not.toBeVisible();

	fireEvent.click(within(row).getByText("Setup & record"));

	expect(within(row).getByText(DIGEST)).toBeVisible();
	expect(within(row).getByText("Comparison time not recorded")).toBeVisible();
}

async function opensComparisonEntryPoint({
	name,
}: ComparisonEntryPoint): Promise<void> {
	const fetchReplies = new Map<string, unknown>([
		[
			"/api/comparisons",
			indexWith({
				comparisons: [savedComparison(DIGEST), savedComparison(OTHER_DIGEST)],
			}),
		],
		[
			`/api/comparisons/${OTHER_DIGEST}`,
			{
				armFigures: {},
				attribution: {},
				baselineArm: { kind: "supplied" },
				checkpoint: { reasons: ["no checkpoint"], state: "unavailable" },
				corpusVersions: {},
				report: { cases: [], mode: "session" },
				summary: {},
			},
		],
	]);
	renderAppWithStub("/comparisons", fetchReplies);

	const chosen = await screen.findByRole("listitem", {
		name: /audit-log.*7e0f9a31c2d8/u,
	});
	const open = within(chosen).getByRole("link", { name });
	expect(open).toHaveAttribute("href", `/comparisons/${OTHER_DIGEST}`);

	fireEvent.click(open);

	expect(
		await screen.findByRole("heading", {
			level: 1,
			name: /^Comparison · session/u,
		}),
	).toBeInTheDocument();
}
