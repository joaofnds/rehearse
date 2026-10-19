import { afterEach, describe, expect, it } from "bun:test";

import { screen, within } from "@testing-library/react";

import AnalysisReadingBuilder from "#client/test-support/analysis-reading-test-builder";
import {
	ANALYSES,
	renderContribution,
	serveContribution,
} from "#client/test-support/run-detail";

import { originalFetch } from "./contribution-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe("the Root-cause analysis section", () => {
	describe("when the newest analysis failed", () => {
		it(
			"shows why it failed, what it returned, and offers a re-run",
			showsWhyTheNewestAnalysisFailedWhatItReturnedAndOffersAReRun,
		);
	});

	describe("when the server could not read the run's analyses", () => {
		it(
			"says the analyses could not be read",
			saysWhenTheServerCouldNotReadTheRunSAnalyses,
		);
	});

	describe("when analysis records could not be read", () => {
		it("lists the unreadable records", listsTheAnalysisRecordsItCouldNotRead);
	});
});

async function showsWhyTheNewestAnalysisFailedWhatItReturnedAndOffersAReRun(): Promise<void> {
	renderContribution(
		new Map([
			[ANALYSES, new AnalysisReadingBuilder().withFailedAnswer().build()],
		]),
	);

	const section = await screen.findByRole("region", {
		name: "Root-cause analysis",
	});

	expect(
		await within(section).findByText(
			"The newest analysis failed: the answer named a stage the run does not declare",
		),
	).toBeInTheDocument();
	expect(section).toHaveTextContent('"stage": "deploy"');
	expect(
		within(section).getByRole("button", {
			name: "Re-run the analysis · at most $1.00",
		}),
	).toBeEnabled();
}

async function saysWhenTheServerCouldNotReadTheRunSAnalyses(): Promise<void> {
	serveContribution(
		new Map([[`GET ${ANALYSES}`, { body: { error: "disk" }, status: 500 }]]),
	);

	const section = await screen.findByRole("region", {
		name: "Root-cause analysis",
	});

	expect(
		await within(section).findByText(
			"Could not read the root-cause analyses of this run.",
		),
	).toBeInTheDocument();
}

async function listsTheAnalysisRecordsItCouldNotRead(): Promise<void> {
	renderContribution(
		new Map([
			[
				ANALYSES,
				new AnalysisReadingBuilder({
					unreadable: [
						{ file: "2026-09-28T10-40-00.000Z.json", reason: "not JSON" },
					],
				}).build(),
			],
		]),
	);

	const section = await screen.findByRole("region", {
		name: "Root-cause analysis",
	});

	expect(await within(section).findByRole("alert")).toHaveTextContent(
		"2026-09-28T10-40-00.000Z.json: not JSON",
	);
}
