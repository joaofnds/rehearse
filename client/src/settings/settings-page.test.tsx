import { afterEach, describe, expect, it } from "bun:test";

import { screen } from "@testing-library/react";

import SettingsPage from "./settings-page";
import {
	RECORDS_AT,
	keyboardShortcuts,
	originalFetch,
	serving,
	subline,
} from "./settings-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(SettingsPage.name, () => {
	it(
		"shows judge calibration under Settings without a second screen header",
		showsJudgeCalibrationUnderSettingsWithoutASecondScreenHeader,
	);

	it(
		"names the records location, how many records it holds and their size",
		namesTheRecordsLocationHowManyRecordsItHoldsAndTheirSize,
	);

	it(
		"counts the records while the run history's staleness cannot be judged",
		countsTheRecordsWhileTheRunHistorySStalenessCannotBeJudged,
	);

	it(
		"says the records could not be counted when the record listing is refused",
		saysTheRecordsCouldNotBeCountedWhenTheRecordListingIsRefused,
	);

	it(
		"offers no control that edits the records location",
		offersNoControlThatEditsTheRecordsLocation,
	);

	it.each([
		{ bytes: 0, shown: "0 B" },
		{ bytes: 999, shown: "999 B" },
		{ bytes: 1499, shown: "1 kB" },
		{ bytes: 999_600, shown: "1 MB" },
		{ bytes: 2_500_000, shown: "3 MB" },
		{ bytes: 999_600_000, shown: "1 GB" },
		{ bytes: 1_200_000_000, shown: "1 GB" },
	])("sizes the recorded bytes as the expected reading", readsRecordedByteSize);

	describe("when the records size cannot be read", () => {
		it(
			"shows an answer the route does not declare as the server sent it",
			showsAnAnswerTheRouteDoesNotDeclareAsTheServerSentIt,
		);

		it("says why beside the location", saysWhyBesideTheLocation);
	});
});

async function showsJudgeCalibrationUnderSettingsWithoutASecondScreenHeader(): Promise<void> {
	const expectedHeadingCount = 1;

	serving(
		new Map([
			[
				"GET /api/calibration",
				{
					body: {
						groups: [],
						next: null,
						reviews: 2,
						rows: [],
						ungraded: 0,
						withinOneStep: 1,
					},
					status: 200,
				},
			],
		]),
		"judges",
	);

	expect(await screen.findByText(/2 reviews recorded/u)).toBeInTheDocument();
	expect(
		screen.getByRole("heading", { level: 1, name: "Settings" }),
	).toBeInTheDocument();
	expect(
		screen.getByRole("heading", { level: 2, name: "Judge calibration" }),
	).toBeInTheDocument();
	expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(
		expectedHeadingCount,
	);
	expect(
		screen.getByRole("button", { name: "Review next step" }),
	).toBeDisabled();
	expect(screen.queryByText("Spending ceiling")).not.toBeInTheDocument();
}

async function namesTheRecordsLocationHowManyRecordsItHoldsAndTheirSize(): Promise<void> {
	serving();

	expect(
		await screen.findByText(subline(`${RECORDS_AT} · 2 records, 612 MB`)),
	).toBeInTheDocument();
}

async function countsTheRecordsWhileTheRunHistorySStalenessCannotBeJudged(): Promise<void> {
	serving(
		new Map([
			[
				"GET /api/runs",
				{
					body: {
						error: "The linked corpus directory is no longer a corpus",
					},
					status: 409,
				},
			],
		]),
	);

	expect(
		await screen.findByText(subline(`${RECORDS_AT} · 2 records, 612 MB`)),
	).toBeInTheDocument();
}

async function saysTheRecordsCouldNotBeCountedWhenTheRecordListingIsRefused(): Promise<void> {
	serving(
		new Map([
			[
				"GET /api/run-listing",
				{
					body: {
						error: "The linked corpus directory is no longer a corpus",
					},
					status: 409,
				},
			],
		]),
	);

	expect(
		await screen.findByText(
			subline(`${RECORDS_AT} · records not counted · 612 MB`),
		),
	).toBeInTheDocument();
}

async function offersNoControlThatEditsTheRecordsLocation(): Promise<void> {
	serving();

	await screen.findByText(subline(`${RECORDS_AT} · 2 records, 612 MB`));

	expect(screen.queryByRole("textbox", { name: /records/iu })).toBeNull();
}

async function showsAnAnswerTheRouteDoesNotDeclareAsTheServerSentIt(): Promise<void> {
	serving(
		new Map([
			[
				"GET /api/settings/records",
				{
					body: new TextEncoder().encode("Internal Server Error"),
					status: 500,
				},
			],
		]),
	);

	expect(
		await screen.findByText(
			subline(`${RECORDS_AT} · 2 records · Internal Server Error`),
		),
	).toBeInTheDocument();
}

async function saysWhyBesideTheLocation(): Promise<void> {
	serving(
		new Map([
			[
				"GET /api/settings/records",
				{
					body: {
						error:
							"Could not measure the records directory, because locked could not be read (EACCES)",
					},
					status: 409,
				},
			],
		]),
	);

	expect(
		await screen.findByText(
			subline(
				`${RECORDS_AT} · 2 records · Could not measure the records directory, because locked could not be read (EACCES)`,
			),
		),
	).toBeInTheDocument();
}

async function listsTheGlobalSearchAndWorkspaceShortcuts(): Promise<void> {
	serving();

	expect(await keyboardShortcuts()).toEqual([
		"⌘ / Ctrl Ksearch everything",
		"g rrun history",
		"g mnewest run’s Activity",
		"nnew run",
		"rreplay a step",
		"eexpand cited evidence",
		"j / kmove through rows",
		"ffollow / unfollow the tail",
		"Escclose dialog",
	]);
}

interface RecordedSizeExample {
	readonly bytes: number;
	readonly shown: string;
}

async function readsRecordedByteSize({
	bytes,
	shown,
}: RecordedSizeExample): Promise<void> {
	serving(
		new Map([["GET /api/settings/records", { body: { bytes }, status: 200 }]]),
	);

	expect(
		await screen.findByText(subline(`${RECORDS_AT} · 2 records, ${shown}`)),
	).toBeInTheDocument();
}

describe(SettingsPage.name, () => {
	describe("the Keyboard card", () => {
		it(
			"lists the global search and workspace shortcuts",
			listsTheGlobalSearchAndWorkspaceShortcuts,
		);
	});
});
