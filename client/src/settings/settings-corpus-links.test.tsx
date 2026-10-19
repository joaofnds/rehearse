import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, within } from "@testing-library/react";

import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";

import SettingsPage from "./settings-page";
import { LIVE_ROOT, corpus } from "./settings-record-test-fixtures";
import {
	LINKED_ROOT,
	findCorpusCard,
	linkCorpusDirectory,
	linkable,
	originalFetch,
} from "./settings-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(SettingsPage.name, () => {
	describe("the Corpus card", () => {
		describe("when the live install is linked", () => {
			it(
				"shows the live install's root and version, with Rehash now and a link control",
				showsTheLiveInstallSRootAndVersionWithRehashNowAndALinkControl,
			);

			it("offers no Unlink corpus", offersNoUnlinkCorpus);
		});

		it(
			"links a directory by its path and shows its root and version",
			linksADirectoryByItsPathAndShowsItsRootAndVersion,
		);

		it(
			"shows no version beside a newly linked root until its corpus is read",
			showsNoVersionBesideANewlyLinkedRootUntilItsCorpusIsRead,
		);

		it(
			"unlinks a linked directory, returning the card to the live install",
			unlinksALinkedDirectoryReturningTheCardToTheLiveInstall,
		);

		it(
			"shows the version label the rehash answers",
			showsTheVersionLabelTheRehashAnswers,
		);
	});
});

async function showsTheLiveInstallSRootAndVersionWithRehashNowAndALinkControl(): Promise<void> {
	linkable("live");
	const corpusCard = await findCorpusCard();

	expect(
		await within(corpusCard).findByText("corpus@a41c7e"),
	).toBeInTheDocument();
	expect(within(corpusCard).getByText(LIVE_ROOT)).toBeInTheDocument();
	expect(
		within(corpusCard).getByRole("button", { name: "Rehash now" }),
	).toBeInTheDocument();
	expect(
		within(corpusCard).getByLabelText("Corpus directory to link"),
	).toBeInTheDocument();
}

async function offersNoUnlinkCorpus(): Promise<void> {
	linkable("live");
	const corpusCard = await findCorpusCard();

	await within(corpusCard).findByText("corpus@a41c7e");

	expect(
		within(corpusCard).queryByRole("button", { name: "Unlink corpus" }),
	).toBeNull();
}

async function linksADirectoryByItsPathAndShowsItsRootAndVersion(): Promise<void> {
	const server = linkable("live");
	const corpusCard = await findCorpusCard();
	await within(corpusCard).findByText("corpus@a41c7e");

	linkCorpusDirectory("~/code/omelette/.claude");

	expect(
		await within(corpusCard).findByText("corpus@b52d8f"),
	).toBeInTheDocument();
	expect(within(corpusCard).getByText(LINKED_ROOT)).toBeInTheDocument();
	expect(
		server.sent
			.filter((request) => request.method === "PUT")
			.map((request) => request.body),
	).toEqual([JSON.stringify({ directory: "~/code/omelette/.claude" })]);
}

async function showsNoVersionBesideANewlyLinkedRootUntilItsCorpusIsRead(): Promise<void> {
	const fetchReplies = new Map([
		[
			"GET /api/corpus",
			{
				body: corpus("a41c7e".padEnd(SHA256_HEX_CHARACTERS, "0")),
				status: 200,
			},
		],
	]);
	linkable("live", fetchReplies);
	const corpusCard = await findCorpusCard();
	await within(corpusCard).findByText("corpus@a41c7e");

	linkCorpusDirectory("~/code/omelette/.claude");

	expect(await within(corpusCard).findByText(LINKED_ROOT)).toBeInTheDocument();
	expect(within(corpusCard).queryByText("corpus@a41c7e")).toBeNull();
}

async function unlinksALinkedDirectoryReturningTheCardToTheLiveInstall(): Promise<void> {
	linkable("directory");
	const corpusCard = await findCorpusCard();
	await within(corpusCard).findByText("corpus@b52d8f");

	fireEvent.click(
		within(corpusCard).getByRole("button", { name: "Unlink corpus" }),
	);

	expect(
		await within(corpusCard).findByText("corpus@a41c7e"),
	).toBeInTheDocument();
	expect(within(corpusCard).getByText(LIVE_ROOT)).toBeInTheDocument();
	expect(
		within(corpusCard).queryByRole("button", { name: "Unlink corpus" }),
	).toBeNull();
}

async function showsTheVersionLabelTheRehashAnswers(): Promise<void> {
	linkable(
		"directory",
		new Map([
			[
				"POST /api/settings/corpus/rehash",
				{
					body: {
						digest: "c63e90".padEnd(SHA256_HEX_CHARACTERS, "0"),
						label: "corpus@c63e90",
					},
					status: 200,
				},
			],
		]),
	);
	const corpusCard = await findCorpusCard();
	await within(corpusCard).findByText("corpus@b52d8f");

	fireEvent.click(
		within(corpusCard).getByRole("button", { name: "Rehash now" }),
	);

	expect(
		await within(corpusCard).findByText("Rehashed as corpus@c63e90"),
	).toBeInTheDocument();
}
