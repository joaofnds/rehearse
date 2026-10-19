import { expect } from "bun:test";

import { screen, waitFor } from "@testing-library/react";

import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { renderAppAt } from "#client/test-support/render-app";

import type { ServedShellCollections } from "./shell-record-test-fixtures";
import {
	NO_SERVED_COMPARISONS,
	NO_SERVED_CORPUS_FILES,
	NO_SERVED_RUNS,
	NO_SERVED_SESSION_ATTEMPTS,
	NO_SERVED_UNREADABLE_COMPARISONS,
	runRow,
	sessionAttemptRow,
	shellComparisons,
	shellCorpus,
} from "./shell-record-test-fixtures";

const originalFetch = globalThis.fetch;

/**
 * Waits long enough that a navigation the keystroke under test might have
 * started would have landed. The wait is what gives the assertion after it any
 * force: without it the check runs in the same tick as the keystroke and
 * passes whether or not the shortcut fired, which was observed by removing
 * each guard and watching both tests keep passing.
 */
async function navigationWouldHaveLanded(): Promise<void> {
	await waitFor(() => {
		expect(
			screen.getByRole("navigation", { name: "Sections" }),
		).toBeInTheDocument();
	});
	await Promise.resolve();
}

function renderShellAt(
	path: string,
	served?: ServedShellCollections,
): ReturnType<typeof renderAppAt> {
	const runs = served?.runs ?? NO_SERVED_RUNS;
	const corpusFiles = served?.corpusFiles ?? NO_SERVED_CORPUS_FILES;
	const comparisons = served?.comparisons ?? NO_SERVED_COMPARISONS;
	const unreadableComparisons =
		served?.unreadableComparisons ?? NO_SERVED_UNREADABLE_COMPARISONS;
	const runListing = {
		launches: [],
		rows: [
			...Array.from({ length: runs }, (_unused, index) =>
				runRow(`2026-09-06T21-58-29.50${index}Z`),
			),
			...Array.from(
				{ length: served?.sessionAttempts ?? NO_SERVED_SESSION_ATTEMPTS },
				(_unused, index) => sessionAttemptRow(`attempt-${index}`),
			),
		],
		unreadable: [],
	};

	stubFetchByPath(
		new Map<string, unknown>([
			["/api/run-listing", runListing],
			["/api/runs", runListing],
			["/api/corpus-summary", shellCorpus(corpusFiles)],
			[
				"/api/comparisons",
				shellComparisons(comparisons, unreadableComparisons),
			],
		]),
	);

	return renderAppAt(path);
}

const SPEC_NAV_LABELS = ["Runs", "Comparisons", "Cases", "Corpus", "Settings"];

const NAV_LABEL = new RegExp(`^(?:${SPEC_NAV_LABELS.join("|")})$`, "u");

export {
	NAV_LABEL,
	navigationWouldHaveLanded,
	originalFetch,
	renderShellAt,
	SPEC_NAV_LABELS,
};
