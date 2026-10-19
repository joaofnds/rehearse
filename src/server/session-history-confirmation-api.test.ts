import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import writtenConfirmationAttempt from "#server/session-history-confirmation-test-fixture";
import {
	SessionHistoryReaderError,
	readConfirmationAttemptRequestSeries,
} from "#server/session-history-reader";
import {
	clearSessionHistoryRoots,
	startHistoryApi,
} from "#server/session-history-workspace-test-fixture";

afterEach(clearSessionHistoryRoots);

describe("/api/groups/:groupId/reps/:repId/attempt/history/requests", () => {
	describe("GET", () => {
		it(
			"serves the confirmation rep's series through its own route",
			verifyServesTheConfirmationRepSSeriesThroughItsOwn,
		);

		it(
			"refuses a confirmation series route whose group does not own the rep",
			verifyRefusesAConfirmationSeriesRouteWhoseGroupDoesNot,
		);
	});
});

describe(readConfirmationAttemptRequestSeries.name, () => {
	describe("when reading a saved confirmation repetition", () => {
		it(
			"reads the series of the rep it was asked for",
			verifyReadsTheSeriesOfTheRepItWasAsked,
		);

		it(
			"refuses a rep whose group does not own it",
			verifyRefusesARepWhoseGroupDoesNotOwnIt,
		);
	});
});

async function verifyServesTheConfirmationRepSSeriesThroughItsOwn(): Promise<void> {
	const fixture = await writtenConfirmationAttempt();
	const api = await startHistoryApi(fixture.runsDirectory);

	const response = await api.savedEvidence.confirmationRequests(fixture);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toMatchObject({
		series: { name: "total input tokens", transcriptState: "saved" },
	});
}

async function verifyRefusesAConfirmationSeriesRouteWhoseGroupDoesNot(): Promise<void> {
	const fixture = await writtenConfirmationAttempt();
	const api = await startHistoryApi(fixture.runsDirectory);

	const response = await api.savedEvidence.confirmationRequests({
		...fixture,
		repId: "group-a-rep-2",
	});

	expect(response.status).not.toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.text()).not.toContain(fixture.runsDirectory);
}

async function verifyReadsTheSeriesOfTheRepItWasAsked(): Promise<void> {
	const fixture = await writtenConfirmationAttempt();

	const { series } = await readConfirmationAttemptRequestSeries(fixture);

	expect(series.transcriptState).toBe("saved");
	expect(series.boundary).toBe("unknown");
	expect(series.attemptTotals).toEqual({
		reasons: ["the transcript carries no attempt boundary"],
		state: "unavailable",
	});
}

async function verifyRefusesARepWhoseGroupDoesNotOwnIt(): Promise<void> {
	const fixture = await writtenConfirmationAttempt();

	expect(
		readConfirmationAttemptRequestSeries({
			...fixture,
			repId: "group-a-rep-2",
		}),
	).rejects.toBeInstanceOf(SessionHistoryReaderError);
}
