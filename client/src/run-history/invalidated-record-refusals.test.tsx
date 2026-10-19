import { afterEach, describe, expect, it } from "bun:test";

import { focusManager } from "@tanstack/react-query";
import { screen } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";

import {
	CURRENT,
	LATER,
	PREVIOUS,
	RUN_A,
	cases,
	corpus,
	durableRecords,
	history,
	originalFetch,
	serving,
} from "./invalidated-history-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
	focusManager.setFocused(undefined);
});

describe("/?invalidatedBy", () => {
	it(
		"names an invalidated result that has no readable row, with the reason it could not be read",
		namesAnInvalidatedResultThatHasNoReadableRowWithTheReasonItCouldNotBeRead,
	);

	describe("when the address names an edit that is no longer the last edit", () => {
		it.each([
			["a later edit from the same version", PREVIOUS, LATER],
			["an edit from another version", LATER, CURRENT],
		])(
			"says so for %s and lists none of the last edit's results",
			async (_case, previous, current) => {
				serving(`/?invalidatedBy=${previous}..${current}`);

				await screen.findByText(
					/The edit this address names is no longer the last edit/u,
				);

				expect(screen.queryByRole("table")).toBeNull();
				expect(
					screen.getByRole("link", { name: "review the last edit's results" }),
				).toHaveAttribute("href", `/?invalidatedBy=${PREVIOUS}..${CURRENT}`);
			},
		);
	});

	describe("when the address cannot be answered", () => {
		it.each(cases)(
			"lists no rows when %s and says why",
			async (...[_case, path, served, reason]) => {
				serving(path, served);

				await screen.findByText(reason);

				expect(screen.queryByRole("table")).toBeNull();
			},
		);
	});
});

async function namesAnInvalidatedResultThatHasNoReadableRowWithTheReasonItCouldNotBeRead(): Promise<void> {
	serving(`/?invalidatedBy=${PREVIOUS}..${CURRENT}`, {
		corpus: corpus({
			count: 3,
			current: CURRENT,
			kind: "measured",
			previous: PREVIOUS,
			rows: [`run:${RUN_A}`, "group:gone", "run:broken"],
		}),
		runs: new NamedHistoryBuilder({
			...history(),
			unreadable: [
				{
					id: "run:broken",
					kind: "run",
					reason: "manifest.json does not parse",
				},
			],
		}).build(),
	});

	await durableRecords();

	expect(
		screen.getByText("group:gone: no row in run history"),
	).toBeInTheDocument();
	expect(
		screen.getByText("run:broken: manifest.json does not parse"),
	).toBeInTheDocument();
}
