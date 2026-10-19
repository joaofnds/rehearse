import { afterEach, describe, expect, it } from "bun:test";

import { screen } from "@testing-library/react";

import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import {
	SHELL_BASELINE,
	renderAppAt,
	stubFetchFailing,
} from "#client/test-support/render-app";

import {
	CORRUPT_DIGEST,
	DIGEST,
	PARSE_ERROR,
	indexWith,
	originalFetch,
	renderComparisonsAt,
	savedComparison,
} from "./comparison-index-test-fixtures";
import ComparisonsPage from "./comparisons-page";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(ComparisonsPage.name, () => {
	it(
		"names each unreadable comparison with its reason",
		namesEachUnreadableComparisonWithItsReason,
	);

	it(
		"says no comparison is saved when there are none",
		saysNoComparisonIsSavedWhenThereAreNone,
	);

	describe("when every saved comparison is unreadable", () => {
		it("does not say that none are saved", doesNotSayThatNoneAreSaved);
	});

	describe("when the list request fails", () => {
		it(
			"says the comparisons could not be loaded instead of loading forever",
			saysTheComparisonsCouldNotBeLoadedInsteadOfLoadingForever,
		);

		it("does not say that none are saved", doesNotSayThatNoneAreSaved2);
	});

	describe("when the list route answers with an error status", () => {
		it(
			"says the comparisons could not be loaded",
			saysTheComparisonsCouldNotBeLoaded,
		);
	});
});

async function namesEachUnreadableComparisonWithItsReason(): Promise<void> {
	renderComparisonsAt(
		indexWith({
			comparisons: [savedComparison(DIGEST)],
			unreadable: [{ id: CORRUPT_DIGEST, reason: PARSE_ERROR }],
		}),
	);

	expect(
		await screen.findByText(
			`${"a".repeat(SHA256_HEX_CHARACTERS)}: JSON Parse error`,
		),
	).toBeInTheDocument();
}

async function saysNoComparisonIsSavedWhenThereAreNone(): Promise<void> {
	renderComparisonsAt(indexWith({}));

	expect(
		await screen.findByRole("heading", { name: "No comparisons saved" }),
	).toBeInTheDocument();
}

async function doesNotSayThatNoneAreSaved(): Promise<void> {
	renderComparisonsAt(
		indexWith({
			unreadable: [{ id: CORRUPT_DIGEST, reason: PARSE_ERROR }],
		}),
	);

	await screen.findByText(`${CORRUPT_DIGEST}: ${PARSE_ERROR}`);

	expect(
		screen.queryByRole("heading", { name: "No comparisons saved" }),
	).not.toBeInTheDocument();
	expect(
		screen.getByText("1 comparison saved, 1 unreadable"),
	).toBeInTheDocument();
}

async function saysTheComparisonsCouldNotBeLoadedInsteadOfLoadingForever(): Promise<void> {
	stubFetchFailing("/api/comparisons");
	renderAppAt("/comparisons");

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Could not load the saved comparisons.",
	);
	expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
}

async function doesNotSayThatNoneAreSaved2(): Promise<void> {
	stubFetchFailing("/api/comparisons");
	renderAppAt("/comparisons");

	await screen.findByRole("alert");

	expect(
		screen.queryByRole("heading", { name: "No comparisons saved" }),
	).not.toBeInTheDocument();
}

async function saysTheComparisonsCouldNotBeLoaded(): Promise<void> {
	stubFetchByPath(
		new Map(
			[...SHELL_BASELINE].filter(([path]) => path !== "/api/comparisons"),
		),
	);
	renderAppAt("/comparisons");

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Could not load the saved comparisons.",
	);
}
