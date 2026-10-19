import { afterEach, describe, expect, it } from "bun:test";

import { screen, waitFor, within } from "@testing-library/react";

import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { renderAppAt, stubFetchFailing } from "#client/test-support/render-app";

import { corpusFile } from "./shell-record-test-fixtures";
import { originalFetch, renderShellAt } from "./shell-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the navigation shell", () => {
	it(
		"names the corpus under test on every screen",
		namesTheCorpusUnderTestOnEveryScreen,
	);

	it.each(["/", "/corpus", "/system", "/runs/run-a/stages/build"])(
		"names the corpus under test on %s",
		namesCorpusOnScreen,
	);

	it(
		"says the corpus could not be read when its request fails",
		saysTheCorpusCouldNotBeReadWhenItsRequestFails,
	);

	it(
		"withholds the digest in words when a file refused hashing",
		withholdsTheDigestInWordsWhenAFileRefusedHashing,
	);
});

async function namesTheCorpusUnderTestOnEveryScreen(): Promise<void> {
	renderShellAt("/", { corpusFiles: 137, runs: 0 });

	const card = await screen.findByRole("region", {
		name: "Corpus under test",
	});

	await waitFor(() => {
		expect(within(card).getByText("corpus@ffd58d")).toBeInTheDocument();
	});
	expect(within(card).getByText("137 files")).toBeInTheDocument();
	expect(screen.queryByText(/corpus root@/u)).not.toBeInTheDocument();
}

async function saysTheCorpusCouldNotBeReadWhenItsRequestFails(): Promise<void> {
	stubFetchFailing("/api/corpus-summary");
	renderAppAt("/");

	const card = await screen.findByRole("region", {
		name: "Corpus under test",
	});

	await waitFor(() => {
		expect(within(card).getByRole("alert")).toHaveTextContent(
			/Could not read the corpus/u,
		);
	});
	expect(
		within(card).queryByText(/Reading the corpus/u),
	).not.toBeInTheDocument();
}

async function withholdsTheDigestInWordsWhenAFileRefusedHashing(): Promise<void> {
	stubFetchByPath(
		new Map<string, unknown>([
			["/api/run-listing", { launches: [], rows: [], unreadable: [] }],
			[
				"/api/corpus-summary",
				{
					files: [corpusFile("CLAUDE.md")],
					refusals: ["skills/a resolves outside the corpus source"],
					root: "/corpus",
				},
			],
		]),
	);
	renderAppAt("/");

	const card = await screen.findByRole("region", {
		name: "Corpus under test",
	});

	await waitFor(() => {
		expect(within(card).getByText(/withheld/u)).toBeInTheDocument();
	});
	expect(within(card).getByText(/1 refusal/u)).toBeInTheDocument();
	expect(within(card).queryByText(/corpus@/u)).not.toBeInTheDocument();
}

async function namesCorpusOnScreen(path: string): Promise<void> {
	renderShellAt(path, { corpusFiles: 137, runs: 0 });

	const card = await screen.findByRole("region", {
		name: "Corpus under test",
	});

	await waitFor(() => {
		expect(within(card).getByText("corpus@ffd58d")).toBeInTheDocument();
	});
}
