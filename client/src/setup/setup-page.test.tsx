import { afterEach, describe, expect, it } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import type { SettingsReading } from "#client/launch/settings-query";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import { renderAppAt, SHELL_BASELINE } from "#client/test-support/render-app";
import {
	UNREAD_RUN_FIGURES,
	unversionedStaleness,
} from "#client/test-support/run-figures";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const LIVE_ROOT = "/home/operator/.claude";

function settings(spendCeilingUsd: number | null): SettingsReading {
	return {
		spendCeilingUsd,
		setCommand: "rehearse settings --spend-ceiling-usd <USD>",
		recordsDirectory: "/records",
		linkedCorpus: { kind: "live", root: LIVE_ROOT },
		overrun: "The ceiling can be overrun by the calls in flight.",
		linkCommand: "rehearse settings --link-corpus <DIR>",
	};
}

const ONE_RUN: RunHistoryResponse = {
	rows: [
		{
			kind: "run",
			...UNREAD_RUN_FIGURES,
			launchId: undefined,
			shortId: undefined,
			checkpoints: [],
			links: [],
			run: "2026-09-06T21-58-29.508Z",
			caseId: "audit-log",
			status: "COMPLETE",
			stage: "build",
			grade: "A",
			corpusVersion: { kind: "version", digest: "a3a62f" },
			corpusChangedDuringRun: false,
			staleness: unversionedStaleness({ stale: false, causes: [] }),
			progress: { state: "recorded" },
		},
	],
	launches: [],
	unreadable: [],
};

/** The shell's reads answered as the baseline does, with `routes` over them. */
function serve(routes: ReadonlyMap<string, Reply>): FakeServer {
	const baseline = [...SHELL_BASELINE].map(([path, body]): [string, Reply] => [
		`GET ${path}`,
		{ status: 200, body },
	]);
	const server = new FakeServer(new Map([...baseline, ...routes]));
	server.install();

	return server;
}

function serveFreshInstall(
	routes: ReadonlyMap<string, Reply> = new Map(),
): FakeServer {
	return serve(
		new Map<string, Reply>([
			["GET /api/settings", { status: 200, body: settings(null) }],
			...routes,
		]),
	);
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

describe("first-run setup", () => {
	it("opens a fresh install on the three setup steps", async () => {
		serveFreshInstall();

		renderAppAt("/");
		const steps = await setupSteps();

		expect(
			screen.getByText(
				/Rehearse needs two things before a case can be declared/u,
			),
		).toBeInTheDocument();
		expect(
			steps.map(
				(step) => within(step).getByRole("heading", { level: 2 }).textContent,
			),
		).toEqual([
			"Set a spend limit",
			"Point at an instruction corpus",
			"Declare your first case",
		]);
		expect(steps[0]).toHaveTextContent("Required");
		expect(steps[2]).toHaveTextContent("Locked");
		expect(steps[2]).toHaveClass("border-dashed");
	});

	it("shows setup on any screen while the install is fresh", async () => {
		serveFreshInstall();

		renderAppAt("/settings");

		expect(await setupSteps()).toHaveLength(3);
		expect(
			screen.queryByRole("heading", { name: "Settings" }),
		).not.toBeInTheDocument();
	});

	describe("when the install is not fresh", () => {
		it("opens on run history once a spend ceiling is stored", async () => {
			serve(
				new Map<string, Reply>([
					["GET /api/settings", { status: 200, body: settings(20) }],
				]),
			);

			renderAppAt("/");

			expect(
				await screen.findByRole("heading", { name: "Run history" }),
			).toBeInTheDocument();
			expect(
				screen.queryByText("Nothing is measured yet"),
			).not.toBeInTheDocument();
		});

		it("opens on run history when records exist without a ceiling", async () => {
			serve(
				new Map<string, Reply>([
					["GET /api/settings", { status: 200, body: settings(null) }],
					["GET /api/runs", { status: 200, body: ONE_RUN }],
				]),
			);

			renderAppAt("/");

			expect(
				await screen.findByText("2026-09-06T21-58-29.508Z"),
			).toBeInTheDocument();
			await waitFor(() => {
				expect(
					screen.queryByText("Nothing is measured yet"),
				).not.toBeInTheDocument();
			});
		});
	});
});
