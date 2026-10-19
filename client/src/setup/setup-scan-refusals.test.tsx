import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { focusManager } from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react";

import type { Reply } from "#client/test-support/fetch-stub";
import LiveReply from "#client/test-support/live-reply";
import { renderAppAt, settingsReading } from "#client/test-support/render-app";

import {
	INITIAL_SCAN_NUMBER,
	SCANNED_CORPUS,
	SETUP_SCAN_COUNT_INCREMENT,
	chooseLimit,
	corpusInput,
	originalFetch,
	scan,
	serveFreshInstall,
	servingScan,
	setupSteps,
} from "./setup-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
	focusManager.setFocused(undefined);
});

describe("first-run setup", () => {
	describe("the corpus scan", () => {
		it(
			"shows the server's refusal and lists nothing when the scan is refused",
			showsTheServerSRefusalAndListsNothingWhenTheScanIsRefused,
		);

		describe("after an earlier corpus scan succeeded", () => {
			beforeEach(scansEarlierCorpus);
			it(
				"keeps the corpus an earlier scan linked when a later scan is refused",
				keepsTheCorpusAnEarlierScanLinkedWhenALaterScanIsRefused,
			);
		});

		it(
			"names the server's reason when the linked corpus cannot be read",
			namesTheServerSReasonWhenTheLinkedCorpusCannotBeRead,
		);

		it(
			"is not satisfied by a corpus whose files refused hashing, and names why",
			isNotSatisfiedByACorpusWhoseFilesRefusedHashingAndNamesWhy,
		);
	});
});

async function scansEarlierCorpus(): Promise<void> {
	let scans = 0;
	serveFreshInstall(
		new Map<string, Reply | LiveReply>([
			[
				"PUT /api/setup/corpus",
				new LiveReply(() => {
					scans += SETUP_SCAN_COUNT_INCREMENT;

					return scans === INITIAL_SCAN_NUMBER
						? {
								body: settingsReading(null),
								status: 200,
							}
						: {
								body: { error: "Corpus source /tmp/x holds no corpus" },
								status: 409,
							};
				}),
			],
			["GET /api/corpus", { body: SCANNED_CORPUS, status: 200 }],
		]),
	);
	renderAppAt("/");
	await setupSteps();
	scan();
	await screen.findByText(/^Found 2 files/u);
}

async function keepsTheCorpusAnEarlierScanLinkedWhenALaterScanIsRefused(): Promise<void> {
	fireEvent.change(corpusInput(), { target: { value: "/tmp/x" } });
	scan();
	await screen.findByRole("alert");
	const [, observedSecondStep] = await setupSteps();
	expect(observedSecondStep).toHaveTextContent("Linked");
	expect(screen.getByText(/^Found 2 files/u)).toBeInTheDocument();
}

async function namesTheServerSReasonWhenTheLinkedCorpusCannotBeRead(): Promise<void> {
	serveFreshInstall(
		new Map<string, Reply>([
			["PUT /api/setup/corpus", { body: settingsReading(null), status: 200 }],
			[
				"GET /api/corpus",
				{
					body: { error: "Corpus file CLAUDE.md is a symlink" },
					status: 409,
				},
			],
		]),
	);
	renderAppAt("/");
	await setupSteps();

	scan();

	expect(
		await screen.findByText(
			"Could not read the corpus: Corpus file CLAUDE.md is a symlink",
		),
	).toBeInTheDocument();
}

async function isNotSatisfiedByACorpusWhoseFilesRefusedHashingAndNamesWhy(): Promise<void> {
	serveFreshInstall(
		new Map<string, Reply>([
			["PUT /api/setup/corpus", { body: settingsReading(null), status: 200 }],
			[
				"GET /api/corpus",
				{
					body: {
						...SCANNED_CORPUS,
						digest: undefined,
						refusals: [
							"Corpus file CLAUDE.md resolves outside the corpus source",
						],
					},
					status: 200,
				},
			],
		]),
	);
	renderAppAt("/");
	const steps = await setupSteps();

	chooseLimit();
	scan();

	expect(
		await screen.findByText(
			"Corpus file CLAUDE.md resolves outside the corpus source",
			{ exact: false },
		),
	).toBeInTheDocument();
	const [, observedSecondStep] = steps;

	expect(observedSecondStep).toHaveTextContent("Required");
}

async function showsTheServerSRefusalAndListsNothingWhenTheScanIsRefused(): Promise<void> {
	servingScan({
		body: { error: "Corpus source /tmp/x holds no corpus layout entry" },
		status: 409,
	});
	renderAppAt("/");
	const steps = await setupSteps();

	chooseLimit();
	scan();

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Corpus source /tmp/x holds no corpus layout entry",
	);
	expect(screen.queryByText(/^Found/u)).not.toBeInTheDocument();
	const [, observedSecondStep] = steps;

	expect(observedSecondStep).toHaveTextContent("Required");
}
