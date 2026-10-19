import { fireEvent, screen, within } from "@testing-library/react";

import type { CorpusResponse } from "#client/corpus/corpus-query";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import LiveReply from "#client/test-support/live-reply";
import {
	SHELL_BASELINE,
	settingsReading,
} from "#client/test-support/render-app";
import {
	UNREAD_RUN_FIGURES,
	unversionedStaleness,
} from "#client/test-support/run-figures";

const MISSING_HINT = "Choose a spend limit and scan a corpus directory.";

const INITIAL_SCAN_NUMBER = 1;

const HTTP_OK_STATUS = 200;

const FINAL_SETUP_STEP_OFFSET = -1;

const SETUP_SCAN_COUNT_INCREMENT = 1;

const originalFetch = globalThis.fetch;

const LIVE_ROOT = settingsReading(null).liveCorpusRoot;

const RECORDED_RUN = "2026-09-06T21-58-29.508Z";

const ONE_RUN: RunHistoryResponse = {
	launches: [],
	rows: [
		{
			kind: "run",
			recordId: `run:${RECORDED_RUN}`,
			...UNREAD_RUN_FIGURES,
			caseId: "audit-log",
			checkpoints: [],
			corpusChangedDuringRun: false,
			corpusVersion: { digest: "a3a62f", kind: "version" },
			grade: "A",
			launchId: undefined,
			links: [],
			progress: { state: "recorded" },
			run: RECORDED_RUN,
			shortId: undefined,
			stage: "build",
			staleness: unversionedStaleness({ causes: [], stale: false }),
			status: "COMPLETE",
		},
	],
	unreadable: [],
};

const SCANNED_CORPUS: CorpusResponse = {
	digest: "a41c7e".padEnd(SHA256_HEX_CHARACTERS, "0"),
	files: [
		{
			invalidated: 0,
			lastEditedAt: "2026-09-04T09:41:00.000Z",
			lines: 218,
			path: "CLAUDE.md",
			readBy: 0,
			sha256: "4f21c8".padEnd(SHA256_HEX_CHARACTERS, "0"),
		},
		{
			invalidated: 0,
			lastEditedAt: "2026-09-04T09:41:00.000Z",
			lines: 96,
			path: "skills/implement/SKILL.md",
			readBy: 0,
			sha256: "88b0d2".padEnd(SHA256_HEX_CHARACTERS, "0"),
		},
	],
	lastEdit: {
		kind: "not-recorded",
		reason:
			"the corpus under test has no earlier version in its log to compare against",
	},
	refusals: [],
	root: LIVE_ROOT,
};

interface ExistingInstallExample {
	readonly holding: string;
	readonly records: RunHistoryResponse;
	readonly shows: string;
}

const EXISTING_RECORDS: readonly ExistingInstallExample[] = [
	{
		holding: "only a live launch",
		records: {
			launches: [
				{
					attempts: 1,
					caseId: "audit-log",
					id: "launch-1",
					kind: "launch",
					launchedAt: "2026-09-06T21:58:29.508Z",
					run: undefined,
					stage: undefined,
					status: "RUNNING",
					target: "case",
				},
			],
			rows: [],
			unreadable: [],
		},
		shows: "audit-log",
	},
	{
		holding: "only an unreadable record",
		records: {
			launches: [],
			rows: [],
			unreadable: [
				{
					id: "run:2026-09-01T00-00-00.000Z",
					kind: "run",
					reason: "manifest.json is empty",
				},
			],
		},
		shows: "could not be read, so the table leaves them out",
	},
];

function servingScan(scanReply: Reply): FakeServer {
	return serveFreshInstall(
		new Map<string, Reply>([
			["PUT /api/setup/corpus", scanReply],
			["GET /api/corpus", { body: SCANNED_CORPUS, status: 200 }],
		]),
	);
}

/** A server whose settings read answers what the ceiling write stored. */
function servingCeilingWrite(ceilingWrite: Reply): FakeServer {
	let current: Reply = {
		body: settingsReading(null),
		status: 200,
	};

	return serveFreshInstall(
		new Map<string, Reply | LiveReply>([
			["GET /api/settings", new LiveReply(() => current)],
			["PUT /api/setup/corpus", new LiveReply(() => current)],
			["GET /api/corpus", { body: SCANNED_CORPUS, status: 200 }],
			[
				"PUT /api/settings/spend-ceiling",
				new LiveReply(() => {
					if (ceilingWrite.status === HTTP_OK_STATUS) {
						current = ceilingWrite;
					}

					return ceilingWrite;
				}),
			],
		]),
	);
}

function pressedPresets(): (string | null)[] {
	return within(screen.getByRole("list", { name: "Setup steps" }))
		.getAllByRole("button", { pressed: true })
		.map((button) => button.textContent);
}

function finishSetupButton(): HTMLElement {
	return screen.getByRole("button", { name: "Finish setup" });
}

/** The shell's reads answered as the baseline does, with `routes` over them. */
function serve(routes: ReadonlyMap<string, Reply | LiveReply>): FakeServer {
	const baseline = [...SHELL_BASELINE].map(([path, body]): [string, Reply] => [
		`GET ${path}`,
		{ body, status: 200 },
	]);
	const server = new FakeServer(
		new Map<string, Reply | LiveReply>([...baseline, ...routes]),
	);
	server.install();

	return server;
}

function serveFreshInstall(
	routes: ReadonlyMap<string, Reply | LiveReply> = new Map(),
): FakeServer {
	return serve(
		new Map<string, Reply | LiveReply>([
			["GET /api/settings", { body: settingsReading(null), status: 200 }],
			...routes,
		]),
	);
}

function limitInput(): HTMLElement {
	return screen.getByRole("textbox", { name: "Spend limit in US dollars" });
}

function corpusInput(): HTMLElement {
	return screen.getByRole("textbox", { name: "Corpus directory" });
}

function chooseLimit(): void {
	fireEvent.click(screen.getByRole("button", { name: "$20.00" }));
}

function scan(): void {
	fireEvent.click(screen.getByRole("button", { name: "Scan" }));
}

async function setupSteps(): Promise<HTMLElement[]> {
	await screen.findByRole("heading", {
		level: 1,
		name: "Nothing is measured yet",
	});

	return within(screen.getByRole("list", { name: "Setup steps" })).getAllByRole(
		"listitem",
	);
}

export {
	EXISTING_RECORDS,
	FINAL_SETUP_STEP_OFFSET,
	INITIAL_SCAN_NUMBER,
	LIVE_ROOT,
	MISSING_HINT,
	ONE_RUN,
	RECORDED_RUN,
	SCANNED_CORPUS,
	SETUP_SCAN_COUNT_INCREMENT,
	chooseLimit,
	corpusInput,
	finishSetupButton,
	limitInput,
	originalFetch,
	pressedPresets,
	scan,
	serve,
	serveFreshInstall,
	servingCeilingWrite,
	servingScan,
	setupSteps,
};

export type { ExistingInstallExample };
