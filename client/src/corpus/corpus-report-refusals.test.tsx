import { afterEach, describe, expect, it } from "bun:test";

import { screen, waitFor, within } from "@testing-library/react";

import CorpusPage from "./corpus-page";
import { renderRefusing } from "./corpus-report-test-fixtures";
import { corpusResponseBody, originalFetch } from "./corpus-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(CorpusPage.name, () => {
	describe("when the report carries a refusal", () => {
		it(
			"says what was left out without calling every refusal a layout directory, since CLAUDE.md is not one",
			saysWhatWasLeftOutWithoutCallingEveryRefusalALayoutDirectorySinceCLAUDEMdIsNotOne,
		);

		it(
			"renders the files it could hash alongside the refusal, rather than one failure line",
			rendersTheFilesItCouldHashAlongsideTheRefusalRatherThanOneFailureLine,
		);

		it(
			"renders no corpus version, since the report carries none for a partial tree",
			rendersNoCorpusVersionSinceTheReportCarriesNoneForAPartialTree,
		);

		it(
			"renders every refusal, so a benign entry sorting first cannot hide a hostile one",
			rendersEveryRefusalSoABenignEntrySortingFirstCannotHideAHostileOne,
		);

		it(
			"renders the refusal rather than the empty state when no layout directory hashed",
			rendersTheRefusalRatherThanTheEmptyStateWhenNoLayoutDirectoryHashed,
		);
	});
});

async function saysWhatWasLeftOutWithoutCallingEveryRefusalALayoutDirectorySinceCLAUDEMdIsNotOne(): Promise<void> {
	renderRefusing(corpusResponseBody().files);

	await waitFor(() => {
		expect(
			screen.getByText(
				"These entries could not be hashed, so they are missing from the table, and a refused layout directory is missing from it whole:",
			),
		).toBeInTheDocument();
	});
}

async function rendersTheFilesItCouldHashAlongsideTheRefusalRatherThanOneFailureLine(): Promise<void> {
	renderRefusing(corpusResponseBody().files);

	await waitFor(() => {
		expect(screen.getByText("CLAUDE.md")).toBeInTheDocument();
	});
	expect(
		within(screen.getByRole("alert")).getByText(
			/agents\/escape\.md resolves outside the tree/u,
		),
	).toBeInTheDocument();
	expect(screen.queryByText("Could not load the corpus.")).toBeNull();
}

async function rendersNoCorpusVersionSinceTheReportCarriesNoneForAPartialTree(): Promise<void> {
	renderRefusing(corpusResponseBody().files);

	await waitFor(() => {
		expect(screen.getByText("CLAUDE.md")).toBeInTheDocument();
	});
	expect(screen.queryByText(/corpus@/u)).toBeNull();
}

async function rendersEveryRefusalSoABenignEntrySortingFirstCannotHideAHostileOne(): Promise<void> {
	const expectedListItemCount = 2;

	renderRefusing(corpusResponseBody().files, [
		"agents/aardvark.md is a link whose target is missing, so the bytes it names cannot be read",
		"agents/escape.md resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
	]);

	const alert = await screen.findByRole("alert");

	expect(within(alert).getAllByRole("listitem")).toHaveLength(
		expectedListItemCount,
	);
	expect(
		within(alert).getByText(/agents\/escape\.md resolves outside the tree/u),
	).toBeInTheDocument();
}

async function rendersTheRefusalRatherThanTheEmptyStateWhenNoLayoutDirectoryHashed(): Promise<void> {
	renderRefusing([]);

	await waitFor(() => {
		expect(
			screen.getByText(/agents\/escape\.md resolves outside the tree/u),
		).toBeInTheDocument();
	});
	expect(screen.queryByText("No corpus files found")).toBeNull();
}
