import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, within } from "@testing-library/react";

import type { Reply } from "#client/test-support/fetch-stub";
import LiveReply from "#client/test-support/live-reply";

import SettingsPage from "./settings-page";
import { LIVE_ROOT, corpus } from "./settings-record-test-fixtures";
import {
	LINKED_DIGEST,
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
		describe("when a write is refused", () => {
			it.each([
				{
					error: "Corpus source <path>/notes holds no corpus layout entry",
					status: 409,
				},
				{
					error:
						"Link a corpus directory by its absolute path, or one starting with ~/ for your home directory, because the server does not share the browser's working directory",
					status: 400,
				},
			])(
				"shows a %p link refusal and keeps the live install",
				readsCorpusLinkRefusal,
			);

			it(
				"drops the version label once the corpus can no longer be read after a refused rehash",
				dropsTheVersionLabelOnceTheCorpusCanNoLongerBeReadAfterARefusedRehash,
			);

			it(
				"shows the reason of an error the route does not declare",
				showsTheReasonOfAnErrorTheRouteDoesNotDeclare,
			);

			it(
				"shows a refusal the server sends as plain text as it was sent",
				showsARefusalTheServerSendsAsPlainTextAsItWasSent,
			);

			it(
				"shows a rehash refusal naming how to link another or unlink",
				showsARehashRefusalNamingHowToLinkAnotherOrUnlink,
			);
		});
	});
});

async function dropsTheVersionLabelOnceTheCorpusCanNoLongerBeReadAfterARefusedRehash(): Promise<void> {
	let rehashed = false;
	linkable(
		"directory",
		new Map<string, Reply | LiveReply>([
			[
				"POST /api/settings/corpus/rehash",
				new LiveReply(() => {
					rehashed = true;

					return {
						body: {
							error: "The linked corpus directory is no longer a corpus",
						},
						status: 409,
					};
				}),
			],
			[
				"GET /api/corpus",
				new LiveReply(() =>
					rehashed
						? {
								body: {
									error:
										"The linked corpus directory <path> is no longer a corpus",
								},
								status: 409,
							}
						: {
								body: { ...corpus(LINKED_DIGEST), root: LINKED_ROOT },
								status: 200,
							},
				),
			],
		]),
	);
	const corpusCard = await findCorpusCard();
	await within(corpusCard).findByText("corpus@b52d8f");

	fireEvent.click(
		within(corpusCard).getByRole("button", { name: "Rehash now" }),
	);

	expect(
		await within(corpusCard).findByText("corpus unreadable"),
	).toBeInTheDocument();
	expect(within(corpusCard).queryByText("corpus@b52d8f")).toBeNull();
}

async function showsTheReasonOfAnErrorTheRouteDoesNotDeclare(): Promise<void> {
	linkable(
		"live",
		new Map([
			[
				"PUT /api/settings/corpus",
				{
					body: { error: "EACCES: permission denied, open '<path>'" },
					status: 500,
				},
			],
		]),
	);
	const corpusCard = await findCorpusCard();

	fireEvent.change(
		within(corpusCard).getByLabelText("Corpus directory to link"),
		{ target: { value: "/work/corpus" } },
	);
	fireEvent.click(within(corpusCard).getByRole("button", { name: "Link" }));

	expect(
		await within(corpusCard).findByText(
			"EACCES: permission denied, open '<path>'",
		),
	).toBeInTheDocument();
}

async function showsARefusalTheServerSendsAsPlainTextAsItWasSent(): Promise<void> {
	linkable(
		"directory",
		new Map([
			[
				"DELETE /api/settings/corpus",
				{
					body: new TextEncoder().encode("Forbidden: not a loopback host"),
					status: 403,
				},
			],
		]),
	);
	const corpusCard = await findCorpusCard();
	await within(corpusCard).findByText("corpus@b52d8f");

	fireEvent.click(
		within(corpusCard).getByRole("button", { name: "Unlink corpus" }),
	);

	expect(
		await within(corpusCard).findByText("Forbidden: not a loopback host"),
	).toBeInTheDocument();
}

async function showsARehashRefusalNamingHowToLinkAnotherOrUnlink(): Promise<void> {
	const refusal =
		"The linked corpus directory <path>/.claude is no longer a corpus. Link another with rehearse settings --link-corpus <directory>, or unlink it with: rehearse settings --unlink-corpus";
	linkable(
		"directory",
		new Map([
			[
				"POST /api/settings/corpus/rehash",
				{ body: { error: refusal }, status: 409 },
			],
		]),
	);
	const corpusCard = await findCorpusCard();
	await within(corpusCard).findByText("corpus@b52d8f");

	fireEvent.click(
		within(corpusCard).getByRole("button", { name: "Rehash now" }),
	);

	expect(await within(corpusCard).findByText(refusal)).toBeInTheDocument();
}

interface CorpusLinkRefusal {
	readonly status: number;
	readonly error: string;
}

async function readsCorpusLinkRefusal({
	status,
	error,
}: CorpusLinkRefusal): Promise<void> {
	linkable(
		"live",
		new Map([["PUT /api/settings/corpus", { body: { error }, status }]]),
	);
	const corpusCard = await findCorpusCard();
	await within(corpusCard).findByText("corpus@a41c7e");

	linkCorpusDirectory("notes");

	expect(await within(corpusCard).findByText(error)).toBeInTheDocument();
	expect(within(corpusCard).getByText(LIVE_ROOT)).toBeInTheDocument();
}
