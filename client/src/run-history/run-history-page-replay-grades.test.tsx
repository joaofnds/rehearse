import { describe, expect, it } from "bun:test";

import type { ReplayRow } from "#server/run-history";

import RunHistoryPage from "./run-history-page";
import ReplayRowBuilder from "./run-history-page-replay-row-builder";
import { cellOf, expandedFinalOutcomeOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";
import type { RunHistoryResponse as RunHistoryResponseBody } from "./run-history-query";

const REPLAY = "2026-09-21T09-20-00.000Z";

function replayWith(
	pipelineStages: ReplayRow["pipelineStages"],
): RunHistoryResponseBody {
	return {
		launches: [],
		rows: [
			new ReplayRowBuilder({
				pipelineStages,
				recordId: `attempt:stage:60758c/${REPLAY}`,
				timestamp: REPLAY,
			}).build(),
		],
		unreadable: [],
	};
}

async function testPlacesTheReplayedStageSLetterAtItsPositionAmongItsPipelineSStages(): Promise<void> {
	respondingWith(
		replayWith({
			stages: ["shape", "plan", "build", "review"],
			state: "available",
		}),
	);

	await renderPage().findByText(REPLAY);

	expect(cellOf({ column: "Step grades", run: REPLAY }).textContent).toBe(
		"shapeNot replayedplanNot replayedbuildB+reviewNot replayed",
	);
}

async function testShowsTheLetterWithWhyItsPipelineSStagesCouldNotBeRead(): Promise<void> {
	respondingWith(
		replayWith({
			reasons: ["the source run's manifest is not recorded"],
			state: "unavailable",
		}),
	);

	await renderPage().findByText(REPLAY);

	expect(cellOf({ column: "Step grades", run: REPLAY })).toHaveTextContent(
		"buildB+the source run's manifest is not recorded",
	);
}

async function testReadsNAAsItsTaskGradeSinceItReplaysOneStep(): Promise<void> {
	respondingWith(replayWith({ stages: ["build"], state: "available" }));

	await renderPage().findByText(REPLAY);

	expect(expandedFinalOutcomeOf(REPLAY)).toContain("n/astep replay only");
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("the step grades and task grade of a replay", () => {
		it(
			"places the replayed stage's letter at its position among its pipeline's stages",
			testPlacesTheReplayedStageSLetterAtItsPositionAmongItsPipelineSStages,
		);

		it(
			"shows the letter with why its pipeline's stages could not be read",
			testShowsTheLetterWithWhyItsPipelineSStagesCouldNotBeRead,
		);

		it(
			"reads n/a as its task grade, since it replays one step",
			testReadsNAAsItsTaskGradeSinceItReplaysOneStep,
		);
	});
});
