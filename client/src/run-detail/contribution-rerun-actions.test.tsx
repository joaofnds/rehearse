import { afterEach, describe, expect, it } from "bun:test";

import { screen, within } from "@testing-library/react";

import AnalysisReadingBuilder from "#client/test-support/analysis-reading-test-builder";
import RecordedAnalysisBuilder from "#client/test-support/recorded-analysis-test-builder";
import {
	ANALYSES,
	RUN,
	renderContribution,
	stoppedAtBuild,
} from "#client/test-support/run-detail";

import {
	originalFetch,
	renderWithAnalysis,
} from "./contribution-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe("the Root-cause analysis section", () => {
	it(
		"offers the paired rerun, the block it names and a re-run of the analysis",
		offersThePairedRerunTheBlockItNamesAndAReRunOfTheAnalysis,
	);

	describe("when the checkpoint the root-cause step starts from is missing", () => {
		it(
			"disables the paired rerun, saying why",
			disablesThePairedRerunSayingWhyWhenTheCheckpointTheRootCauseStepStartsFromIsMissing,
		);
	});

	describe("when the analysis named no root cause", () => {
		it(
			"disables the paired rerun and the block link",
			disablesThePairedRerunAndTheBlockLinkWhenTheAnalysisNamedNoRootCause,
		);
	});
});

async function offersThePairedRerunTheBlockItNamesAndAReRunOfTheAnalysis(): Promise<void> {
	renderWithAnalysis();

	const section = await screen.findByRole("region", {
		name: "Root-cause analysis",
	});

	expect(
		await within(section).findByRole("button", {
			name: "Set up the paired rerun",
		}),
	).toBeEnabled();
	const block = within(section).getByRole("link", {
		name: "Open the block it names",
	});
	const opened = new URL(block.getAttribute("href") ?? "", "http://localhost");
	expect(opened.pathname).toBe("/corpus");
	expect(Object.fromEntries(opened.searchParams)).toEqual({
		end: "30",
		file: "skills/implement.md",
		sourceRun: RUN,
		sourceStep: "build",
		start: "12",
	});
	expect(
		within(section).getByRole("button", {
			name: "Re-run the analysis · at most $1.00",
		}),
	).toBeInTheDocument();
}

async function disablesThePairedRerunSayingWhyWhenTheCheckpointTheRootCauseStepStartsFromIsMissing(): Promise<void> {
	renderContribution(
		new Map<string, unknown>([
			[ANALYSES, new AnalysisReadingBuilder().build()],
			[`/api/runs/${RUN}`, stoppedAtBuild("missing")],
		]),
	);

	const section = await screen.findByRole("region", {
		name: "Root-cause analysis",
	});

	expect(
		await within(section).findByRole("button", {
			name: "Set up the paired rerun: build has no checkpoint to replay from",
		}),
	).toHaveAttribute("aria-disabled", "true");
}

async function disablesThePairedRerunAndTheBlockLinkWhenTheAnalysisNamedNoRootCause(): Promise<void> {
	const newest = new RecordedAnalysisBuilder({ rootCause: null }).build();
	const reading = new AnalysisReadingBuilder({ newest }).build();
	renderContribution(new Map([[ANALYSES, reading]]));

	const section = await screen.findByRole("region", {
		name: "Root-cause analysis",
	});

	expect(
		await within(section).findByText("no root cause named"),
	).toBeInTheDocument();
	expect(
		within(section).getByRole("button", {
			name: "Set up the paired rerun: the analysis named no root cause",
		}),
	).toHaveAttribute("aria-disabled", "true");
	expect(
		within(section).getByRole("button", {
			name: "Open the block it names: the analysis named no root cause",
		}),
	).toHaveAttribute("aria-disabled", "true");
	expect(
		within(section).queryByRole("link", { name: "Open the block it names" }),
	).not.toBeInTheDocument();
}
