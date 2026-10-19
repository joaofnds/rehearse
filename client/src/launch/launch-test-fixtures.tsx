import { expect } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RenderResult } from "@testing-library/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";

import type { LaunchTarget } from "./launch-dialog";
import { LaunchDialog } from "./launch-dialog";

const COMPARISON: LaunchTarget = {
	armA: "build-checkpoint-baseline",
	armB: "build-checkpoint-candidate",
	kind: "comparison",
	reps: 2,
	run: "2026-09-06T21-58-29.508Z",
	stage: "build",
};

const EXTENSION: LaunchTarget = {
	attempts: 2,
	comparison: "a".repeat(SHA256_HEX_CHARACTERS),
	kind: "extension",
	usd: 9,
};

const FIRST_POSTED_REQUEST_INDEX = 0;

const SET_COMMAND = "rehearse settings --spend-ceiling-usd <USD>";

interface SettingsReadingBody {
	readonly spendCeilingUsd: number | null;
	readonly setCommand: string;
	readonly recordsDirectory: string;
	readonly linkedCorpus: { readonly kind: "live"; readonly root: string };
	readonly overrun: string;
}

/** The whole reading the server answers, so the stub matches its contract. */
interface SettingsFixture {
	readonly spendCeilingUsd: number | null;
}

const originalFetch = globalThis.fetch;

const LAUNCH_CASES_REPLY = {
	body: {
		cases: [
			{
				id: "audit-log",
				kind: "pipeline",
				model: "sonnet",
				title: "Audit log",
			},
			{
				id: "no-model",
				kind: "session",
				model: null,
				title: "No model",
			},
			{
				id: "smoke",
				kind: "session",
				model: "sonnet",
				title: "Smoke",
			},
		],
		unreadable: [],
	},
	status: 200,
};

function storing({
	spendCeilingUsd: usd,
}: SettingsFixture): ReadonlyMap<string, Reply> {
	return new Map([
		[
			"PUT /api/settings/spend-ceiling",
			{
				body: settingsReading({ spendCeilingUsd: usd }),
				status: 200,
			},
		],
	]);
}

function settingsReading({
	spendCeilingUsd,
}: SettingsFixture): SettingsReadingBody {
	return {
		linkedCorpus: { kind: "live", root: "/home/.claude" },
		overrun: "The ceiling can be overrun by the calls in flight.",
		recordsDirectory: "/records",
		setCommand: SET_COMMAND,
		spendCeilingUsd,
	};
}

function routes(
	overrides: ReadonlyMap<string, Reply> = new Map(),
): ReadonlyMap<string, Reply> {
	return new Map([
		[
			"GET /api/settings",
			{ body: settingsReading({ spendCeilingUsd: 5 }), status: 200 },
		],
		["GET /api/cases", LAUNCH_CASES_REPLY],
		[
			"GET /api/corpus",
			{
				body: {
					digest: "a41c7e".padEnd(SHA256_HEX_CHARACTERS, "0"),
					files: [],
					lastEdit: { kind: "not-recorded", reason: "no earlier version" },
					refusals: [],
					root: "/home/user/.claude",
				},
				status: 200,
			},
		],
		[
			"POST /api/launches",
			{ body: { id: "7b0c2d4e-0000-4000-8000-000000000000" }, status: 202 },
		],
		...overrides,
	]);
}

function serving(overrides?: ReadonlyMap<string, Reply>): FakeServer {
	const server = new FakeServer(routes(overrides));
	server.install();

	return server;
}

function renderDialog(target: LaunchTarget): RenderResult {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});

	return render(
		<QueryClientProvider client={client}>
			<LaunchDialog target={target} triggerLabel="New run" />
		</QueryClientProvider>,
	);
}

async function openDialog(target: LaunchTarget): Promise<HTMLElement> {
	renderDialog(target);
	fireEvent.click(screen.getByRole("button", { name: "New run" }));

	return await screen.findByRole("dialog");
}

/** Waits for the settings to load, since start stays disabled until then. */
async function startButton(): Promise<HTMLElement> {
	const button = await screen.findByRole("button", {
		name: /^Start · /u,
	});
	await waitFor(() => {
		expect(button).toBeEnabled();
	});

	return button;
}

export {
	COMPARISON,
	EXTENSION,
	FIRST_POSTED_REQUEST_INDEX,
	openDialog,
	originalFetch,
	routes,
	serving,
	SET_COMMAND,
	settingsReading,
	startButton,
	storing,
};
