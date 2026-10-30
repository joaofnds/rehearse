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
	"Candidate (after) and baseline (before) inherited different Claude Code configuration from the shell that started them: ANTHROPIC_BASE_URL (different values), DISABLE_PROMPT_CACHING (candidate only). The contrast between them may measure that difference as well as the corpus.";

async function namesWhatTwoArmsInheritedDifferentlyBesideTheContrastUnderWhatMoved(): Promise<void> {
	renderPage(withCaseTwoReading(DIFFERING_BASE_URL));

	const lines = await caseTwoLines("What moved · case-2");

	expect(lines).toEqual([DIFFERING_BASE_URL_TEXT]);
	expect(
		within(
			screen.getByRole("region", { name: "What moved · case-1" }),
		).queryByRole("list", { name: LIST_NAME }),
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

async function showsAnArmMixed(): Promise<void> {
	renderPage(
		withCaseTwoReading({
			findings: [
				{
					arm: "control",
					kind: "mixed",
					names: ["ANTHROPIC_BASE_URL"],
					unrecorded: true,
				},
			],
			state: "available",
		}),
	);

	const lines = await caseTwoLines("What moved · case-2");

	expect(lines).toEqual([
		"The control arm is mixed: its records inherited different Claude Code configuration from the shell that started them: ANTHROPIC_BASE_URL, and some of its records predate recording it. Its figures pool attempts that ran differently.",
	]);
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
		"shows an arm as mixed when its records inherited different configuration",
		showsAnArmMixed,
	);

	describe("when the records cannot be read", () => {
		it(
			"says whether the arms matched could not be read",
			saysTheReadingCouldNotBeMade,
		);
	});
});
