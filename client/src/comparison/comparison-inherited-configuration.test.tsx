import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import { ComparisonPage } from "./comparison-page";
import type { ComparisonResponseFixture } from "./comparison-page-test-fixtures";
import {
	comparisonResponseBody,
	originalFetch,
	renderPage,
} from "./comparison-page-test-fixtures";

const LIST_NAME = "Claude Code configuration inherited from the shell";

type CaseReading = ComparisonResponseFixture["inheritedConfiguration"][string];

function withCaseTwoReading(reading: CaseReading): ComparisonResponseFixture {
	const body = comparisonResponseBody();

	return {
		...body,
		inheritedConfiguration: {
			...body.inheritedConfiguration,
			"case-2": reading,
		},
	};
}

async function caseTwoLines(region: string): Promise<readonly string[]> {
	const section = await screen.findByRole("region", { name: region });
	const list = within(section).getByRole("list", { name: LIST_NAME });

	return within(list)
		.getAllByRole("listitem")
		.map((item) => item.textContent);
}

const DIFFERING_BASE_URL: CaseReading = {
	findings: [
		{
			arms: ["candidate", "baseline"],
			kind: "differs",
			variables: [
				{ kind: "value", name: "ANTHROPIC_BASE_URL" },
				{ arm: "candidate", kind: "only", name: "DISABLE_PROMPT_CACHING" },
			],
		},
	],
	state: "available",
};

const DIFFERING_BASE_URL_TEXT =
	"Candidate (after) and baseline (before) inherited different Claude Code configuration from the shell that started them: ANTHROPIC_BASE_URL (different values), DISABLE_PROMPT_CACHING, which only candidate (after) inherited. The contrast between them may measure that difference too.";

async function namesWhatTwoArmsInheritedDifferentlyBesideTheContrastUnderWhatMoved(): Promise<void> {
	renderPage(withCaseTwoReading(DIFFERING_BASE_URL));

	const lines = await caseTwoLines("What moved · case-2");

	expect(lines).toEqual([DIFFERING_BASE_URL_TEXT]);
	expect(
		screen.getByRole("table", { name: "What moved · case-2" }),
	).toBeInTheDocument();
}

async function drawsNoListForACaseWhoseArmsMatch(): Promise<void> {
	renderPage(withCaseTwoReading(DIFFERING_BASE_URL));

	const caseOne = await screen.findByRole("region", {
		name: "What moved · case-1",
	});

	expect(
		within(caseOne).queryByRole("list", { name: LIST_NAME }),
	).not.toBeInTheDocument();
}

async function namesWhatTwoArmsInheritedDifferentlyUnderAttemptPairs(): Promise<void> {
	renderPage(withCaseTwoReading(DIFFERING_BASE_URL));
	fireEvent.click(await screen.findByRole("button", { name: "Attempt pairs" }));

	const lines = await caseTwoLines("Attempt pairs · case-2");

	expect(lines).toEqual([DIFFERING_BASE_URL_TEXT]);
}

async function namesTheArmsWhoseRecordsDoNotSay(): Promise<void> {
	renderPage(
		withCaseTwoReading({
			findings: [{ arms: ["baseline", "control"], kind: "unrecorded" }],
			state: "available",
		}),
	);

	const lines = await caseTwoLines("What moved · case-2");

	expect(lines).toEqual([
		"Baseline (before) and the control arm recorded no Claude Code configuration inherited from the shell that started them, so whether every arm ran with the same configuration is unknown.",
	]);
}

interface MixedArm {
	readonly expected: string;
	readonly names: readonly string[];
	readonly records: string;
	readonly unrecorded: boolean;
}

const MIXED_ARMS: MixedArm[] = [
	{
		expected:
			"The control arm is mixed: its records inherited different Claude Code configuration from the shell that started them: ANTHROPIC_BASE_URL. Its figures pool attempts that ran differently.",
		names: ["ANTHROPIC_BASE_URL"],
		records: "its records disagree",
		unrecorded: false,
	},
	{
		expected:
			"The control arm is mixed: some of its records predate recording the Claude Code configuration inherited from the shell that started them, so whether its attempts ran alike is unknown.",
		names: [],
		records: "some of its records predate recording it",
		unrecorded: true,
	},
	{
		expected:
			"The control arm is mixed: its records inherited different Claude Code configuration from the shell that started them: ANTHROPIC_BASE_URL, and some of its records predate recording it. Its figures pool attempts that ran differently.",
		names: ["ANTHROPIC_BASE_URL"],
		records: "both",
		unrecorded: true,
	},
];

async function showsAnArmMixed({
	expected,
	names,
	unrecorded,
}: MixedArm): Promise<void> {
	renderPage(
		withCaseTwoReading({
			findings: [{ arm: "control", kind: "mixed", names, unrecorded }],
			state: "available",
		}),
	);

	const lines = await caseTwoLines("What moved · case-2");

	expect(lines).toEqual([expected]);
}

async function keepsTheCaseLeadAndOutcomeWithoutAReading(): Promise<void> {
	const body = comparisonResponseBody();
	renderPage({
		...body,
		inheritedConfiguration: { "case-1": { findings: [], state: "available" } },
	});

	const caseTwo = await screen.findByRole("region", {
		name: "What moved · case-2",
	});

	expect(
		within(caseTwo).getByRole("heading", { name: "case-2" }),
	).toBeInTheDocument();
	expect(
		within(caseTwo).queryByRole("list", { name: LIST_NAME }),
	).not.toBeInTheDocument();
}

async function saysTheReadingCouldNotBeMade(): Promise<void> {
	renderPage(
		withCaseTwoReading({
			reasons: ["a record could not be read: bad json"],
			state: "unavailable",
		}),
	);

	const lines = await caseTwoLines("What moved · case-2");

	expect(lines).toEqual([
		"Whether the arms inherited the same Claude Code configuration could not be read: a record could not be read: bad json.",
	]);
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(ComparisonPage.name, () => {
	it(
		"names what two arms inherited differently beside the contrast under What moved",
		namesWhatTwoArmsInheritedDifferentlyBesideTheContrastUnderWhatMoved,
	);

	it(
		"names what two arms inherited differently under Attempt pairs",
		namesWhatTwoArmsInheritedDifferentlyUnderAttemptPairs,
	);

	it(
		"names the arms whose records do not say what they inherited",
		namesTheArmsWhoseRecordsDoNotSay,
	);

	it(
		"draws no list for a case whose arms inherited the same configuration",
		drawsNoListForACaseWhoseArmsMatch,
	);

	it.each(MIXED_ARMS)("shows an arm as mixed when $records", showsAnArmMixed);

	describe("when the response holds no reading for a case", () => {
		it(
			"keeps the case's lead and outcome",
			keepsTheCaseLeadAndOutcomeWithoutAReading,
		);
	});

	describe("when the records cannot be read", () => {
		it(
			"says whether the arms matched could not be read",
			saysTheReadingCouldNotBeMade,
		);
	});
});
