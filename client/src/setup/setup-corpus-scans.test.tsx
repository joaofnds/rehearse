import { afterEach, describe, expect, it } from "bun:test";

import { focusManager } from "@tanstack/react-query";
import { fireEvent, screen, within } from "@testing-library/react";

import type { Reply } from "#client/test-support/fetch-stub";
import { renderAppAt, settingsReading } from "#client/test-support/render-app";

import {
	FINAL_SETUP_STEP_OFFSET,
	LIVE_ROOT,
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
			"starts empty, offering the live install as the path",
			startsEmptyOfferingTheLiveInstallAsThePath,
		);

		it(
			"offers the live install as the path while an earlier scan's directory is linked",
			offersTheLiveInstallAsThePathWhileAnEarlierScanSDirectoryIsLinked,
		);

		it(
			"scans the live install when no path is typed",
			scansTheLiveInstallWhenNoPathIsTyped,
		);

		it("scans the typed path", scansTheTypedPath);

		it(
			"lists each file as path, hash and line count under the version it hashed as",
			listsEachFileAsPathHashAndLineCountUnderTheVersionItHashedAs,
		);

		it(
			"unlocks the case step, offering to declare one, once the scan is satisfied",
			unlocksTheCaseStepOfferingToDeclareOneOnceTheScanIsSatisfied,
		);

		it(
			"reads Linked once the scan is satisfied, even after the limit is cleared",
			readsLinkedOnceTheScanIsSatisfiedEvenAfterTheLimitIsCleared,
		);
	});
});

async function startsEmptyOfferingTheLiveInstallAsThePath(): Promise<void> {
	serveFreshInstall();

	renderAppAt("/");
	await setupSteps();

	expect(corpusInput()).toHaveValue("");
	expect(corpusInput()).toHaveAttribute("placeholder", LIVE_ROOT);
}

async function offersTheLiveInstallAsThePathWhileAnEarlierScanSDirectoryIsLinked(): Promise<void> {
	serveFreshInstall(
		new Map<string, Reply>([
			[
				"GET /api/settings",
				{
					body: {
						...settingsReading(null),
						linkedCorpus: { kind: "directory", root: "/tmp/scanned" },
					},
					status: 200,
				},
			],
		]),
	);

	renderAppAt("/");
	await setupSteps();

	expect(corpusInput()).toHaveAttribute("placeholder", LIVE_ROOT);
}

async function scansTheLiveInstallWhenNoPathIsTyped(): Promise<void> {
	const server = servingScan({
		body: settingsReading(null),
		status: 200,
	});
	renderAppAt("/");
	await setupSteps();

	scan();
	await screen.findByText(/^Found 2 files/u);

	expect(
		server.sent
			.filter(({ method }) => method === "PUT")
			.map(({ pathname, body }) => [pathname, body]),
	).toEqual([["/api/setup/corpus", JSON.stringify({ directory: "" })]]);
}

async function scansTheTypedPath(): Promise<void> {
	const server = servingScan({
		body: settingsReading(null),
		status: 200,
	});
	renderAppAt("/");
	await setupSteps();

	fireEvent.change(corpusInput(), {
		target: { value: "~/code/omelette/.claude" },
	});
	scan();
	await screen.findByText(/^Found 2 files/u);

	expect(
		server.sent
			.filter(({ method }) => method === "PUT")
			.map(({ body }) => body),
	).toEqual([JSON.stringify({ directory: "~/code/omelette/.claude" })]);
}

async function listsEachFileAsPathHashAndLineCountUnderTheVersionItHashedAs(): Promise<void> {
	servingScan({
		body: settingsReading(null),
		status: 200,
	});
	renderAppAt("/");
	await setupSteps();

	scan();
	const found = await screen.findByText(/^Found 2 files/u);

	expect(found).toHaveTextContent("Found 2 files · hashed as corpus@a41c7e");
	expect(
		within(screen.getByRole("list", { name: "Scanned corpus files" }))
			.getAllByRole("listitem")
			.map((row) => row.textContent),
	).toEqual([
		"CLAUDE.mdsha 4f21c8218 ln",
		"skills/implement/SKILL.mdsha 88b0d296 ln",
	]);
}

async function unlocksTheCaseStepOfferingToDeclareOneOnceTheScanIsSatisfied(): Promise<void> {
	servingScan({
		body: settingsReading(null),
		status: 200,
	});
	renderAppAt("/");
	const steps = await setupSteps();
	const caseStep = steps.at(FINAL_SETUP_STEP_OFFSET);

	scan();
	await screen.findByText(/^Found 2 files/u);

	expect(caseStep).toHaveTextContent("Open");
	expect(caseStep).not.toHaveTextContent("Unlocks once a corpus is linked");
	expect(caseStep).not.toHaveClass("border-dashed");
	expect(caseStep).toContainElement(
		screen.getByRole("button", { name: "Declare a case" }),
	);
}

async function readsLinkedOnceTheScanIsSatisfiedEvenAfterTheLimitIsCleared(): Promise<void> {
	servingScan({
		body: settingsReading(null),
		status: 200,
	});
	renderAppAt("/");
	const steps = await setupSteps();

	scan();
	await screen.findByText(/^Found 2 files/u);
	fireEvent.change(
		screen.getByRole("textbox", { name: "Spend limit in US dollars" }),
		{ target: { value: "" } },
	);

	const [, observedSecondStep] = steps;

	expect(observedSecondStep).toHaveTextContent("Linked");
}
