import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

import { within } from "@testing-library/react";

import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";

import { renderMeasuredRun, spendBand } from "./monitor-spend-test-fixtures";
import { RUN, originalFetch, renderMonitor } from "./monitor-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
	setSystemTime();
});

describe("/monitor", () => {
	describe("the spend band", () => {
		it(
			"shows the run's spend against its ceiling",
			showsTheRunSSpendAgainstItsCeiling,
		);

		it(
			"shows the burn rate over the elapsed time the run measured with its spend",
			showsTheBurnRateOverTheElapsedTimeTheRunMeasuredWithItsSpend,
		);

		it(
			"shows the elapsed time advancing from the run's latest measurement",
			showsTheElapsedTimeAdvancingFromTheRunSLatestMeasurement,
		);

		it(
			"states the share of the ceiling used in words and on its meter",
			statesTheShareOfTheCeilingUsedInWordsAndOnItsMeter,
		);

		it(
			"shows a dash with its reason for run spend a run recorded before it existed",
			showsADashWithItsReasonForRunSpendARunRecordedBeforeItExisted,
		);

		it(
			"shows the run's tokens in and out in thousands",
			showsTheRunSTokensInAndOutInThousands,
		);

		it(
			"shows a dash with its reason for tokens a run recorded before they existed",
			showsADashWithItsReasonForTokensARunRecordedBeforeTheyExisted,
		);
	});
});

async function statesTheShareOfTheCeilingUsedInWordsAndOnItsMeter(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ ceilingUsd: 20, runSpentUsd: 1.83 })
			.build(),
	);

	const shown = await spendBand();

	expect(
		within(shown).getByRole("img", {
			name: "Spent 1.83 dollars of a 20.00 dollar ceiling",
		}),
	).toBeInTheDocument();
	expect(shown).toHaveTextContent(
		"$0.009% of ceiling used · stops mid-step at the ceiling$20.00",
	);
}

async function showsADashWithItsReasonForRunSpendARunRecordedBeforeItExisted(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ ceilingUsd: 20 })
			.build(),
	);

	const shown = await spendBand();

	expect(shown).toHaveTextContent("Spent this run— run spend not recorded");
	expect(shown).toHaveTextContent("Burn rate— run spend not recorded");
	expect(within(shown).queryByRole("img")).not.toBeInTheDocument();
}

async function showsTheRunSTokensInAndOutInThousands(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ runTokens: { input: 842_300, output: 31_400 } })
			.build(),
	);

	const shown = await spendBand();

	expect(shown).toHaveTextContent("Tokens in / out842k / 31k");
}

async function showsADashWithItsReasonForTokensARunRecordedBeforeTheyExisted(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN }).withExecutionProgress().build(),
	);

	const shown = await spendBand();

	expect(shown).toHaveTextContent("Tokens in / out— run tokens not recorded");
}

async function showsTheRunSSpendAgainstItsCeiling(): Promise<void> {
	renderMeasuredRun();

	expect(await spendBand()).toHaveTextContent(
		"Spent this run$1.83of $20.00 limit",
	);
}

async function showsTheBurnRateOverTheElapsedTimeTheRunMeasuredWithItsSpend(): Promise<void> {
	renderMeasuredRun();

	expect(await spendBand()).toHaveTextContent("Burn rate$0.30 /min");
}

async function showsTheElapsedTimeAdvancingFromTheRunSLatestMeasurement(): Promise<void> {
	renderMeasuredRun();

	expect(await spendBand()).toHaveTextContent("Elapsed07:12");
}
