import { afterEach, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import { largeInventoryCase } from "./case-cohort-fixtures";
import {
	originalFetch,
	pipelineCase,
	renderCasesAt,
	sessionCase,
} from "./case-page-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

it(
	"opens a selected case definition and its actions from a direct case destination",
	opensASelectedCaseDefinitionAndItsActionsFromADirectCaseDestination,
);

it(
	"global search opens the matching case with its definition visible",
	globalSearchOpensTheMatchingCaseWithItsDefinitionVisible,
);

it(
	"opens a saved comparison for the selected case from its hub",
	opensASavedComparisonForTheSelectedCaseFromItsHub,
);

it(
	"keeps a large declared corpus inventory collapsed above the prompt and expands every path",
	keepsALargeDeclaredCorpusInventoryCollapsedAboveThePromptAndExpandsEveryPath,
);

async function opensASelectedCaseDefinitionAndItsActionsFromADirectCaseDestination(): Promise<void> {
	const expectedArticleCount = 0;

	renderCasesAt("/cases?caseId=brief-reply", {
		cases: [pipelineCase(), sessionCase()],
	});
	expect(
		await screen.findByRole("article", { name: "brief-reply" }),
	).toBeInTheDocument();
	expect(screen.queryAllByRole("article", { name: "audit-log" })).toHaveLength(
		expectedArticleCount,
	);
	expect(screen.getByRole("link", { name: "All cases" })).toHaveAttribute(
		"href",
		"/cases",
	);
	const selected = screen.getByRole("article", { name: "brief-reply" });
	expect(
		within(selected).getByText("word-band · forbidden-text"),
	).toBeInTheDocument();
	expect(
		within(selected).getByRole("button", { name: "Run once" }),
	).toBeInTheDocument();
}

async function globalSearchOpensTheMatchingCaseWithItsDefinitionVisible(): Promise<void> {
	const expectedArticleCount = 0;

	renderCasesAt("/", { cases: [pipelineCase(), sessionCase()] });
	fireEvent.click(
		await screen.findByRole("button", { name: "Search everything" }),
	);
	const search = await screen.findByRole("dialog", {
		name: "Search everything",
	});
	fireEvent.change(within(search).getByRole("searchbox"), {
		target: { value: "brief-reply" },
	});
	fireEvent.click(
		await within(search).findByRole("link", { name: /Case brief-reply/u }),
	);
	const selected = await screen.findByRole("article", { name: "brief-reply" });
	expect(
		within(selected).getByText("Reply in the brief style"),
	).toBeInTheDocument();
	expect(screen.queryAllByRole("article", { name: "audit-log" })).toHaveLength(
		expectedArticleCount,
	);
}

async function opensASavedComparisonForTheSelectedCaseFromItsHub(): Promise<void> {
	renderCasesAt("/cases?caseId=brief-reply", {
		additional: new Map([
			[
				"/api/comparisons",
				{
					comparisons: [
						{
							caseIds: ["brief-reply"],
							digest: "related-comparison",
							mode: "session",
						},
					],
					unreadable: [],
				},
			],
		]),
		cases: [sessionCase()],
		problems: {},
	});
	expect(
		await screen.findByRole("link", {
			name: /brief-reply · session comparison/u,
		}),
	).toHaveAttribute("href", "/comparisons/related-comparison");
}

async function keepsALargeDeclaredCorpusInventoryCollapsedAboveThePromptAndExpandsEveryPath(): Promise<void> {
	const corpusFiles = Array.from(
		{ length: 137 },
		(_unused, index) => `skills/instruction-${String(index)}/SKILL.md`,
	);
	renderCasesAt("/cases?caseId=brief-reply", {
		cases: [largeInventoryCase(corpusFiles)],
	});
	expect(
		await screen.findByRole("region", { name: "Prompt" }),
	).toHaveTextContent("The useful prompt stays directly available.");
	expect(
		screen.getByRole("region", { name: "Evaluation contract" }),
	).toBeVisible();
	expect(
		screen.getByRole("button", { name: "Declared corpus files (137)" }),
	).toHaveAttribute("aria-expanded", "false");
	expect(
		screen.queryByRole("list", { name: "Declared corpus files" }),
	).not.toBeInTheDocument();
	expect(
		screen.getByText(
			"Declared inclusion does not prove an instruction was read.",
		),
	).toBeInTheDocument();
	fireEvent.click(
		screen.getByRole("button", { name: "Declared corpus files (137)" }),
	);
	expect(
		within(screen.getByRole("list", { name: "Declared corpus files" }))
			.getAllByRole("listitem")
			.map((item) => item.textContent),
	).toEqual(corpusFiles);
}
