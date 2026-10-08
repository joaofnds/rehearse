import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { CorpusResponse } from "#client/corpus/corpus-query";
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

const SCANNED_CORPUS: CorpusResponse = {
	root: LIVE_ROOT,
	digest: `a41c7e${"0".repeat(58)}`,
	files: [
		{
			path: "CLAUDE.md",
			sha256: `4f21c8${"0".repeat(58)}`,
			lastEditedAt: "2026-09-04T09:41:00.000Z",
			lines: 218,
			readBy: 0,
			invalidated: 0,
		},
		{
			path: "skills/implement/SKILL.md",
			sha256: `88b0d2${"0".repeat(58)}`,
			lastEditedAt: "2026-09-04T09:41:00.000Z",
			lines: 96,
			readBy: 0,
			invalidated: 0,
		},
	],
	refusals: [],
	lastEdit: {
		kind: "not-recorded",
		reason:
			"the corpus under test has no earlier version in its log to compare against",
	},
};

function corpusInput(): HTMLElement {
	return screen.getByRole("textbox", { name: "Corpus directory" });
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

	describe("the spend limit", () => {
		function limitInput(): HTMLElement {
			return screen.getByRole("textbox", {
				name: "Spend limit in US dollars",
			});
		}

		function pressedPresets(): (string | null)[] {
			return screen
				.getAllByRole("button", { pressed: true })
				.map((button) => button.textContent);
		}

		it("starts at $20.00 with that preset selected", async () => {
			serveFreshInstall();

			renderAppAt("/");
			await setupSteps();

			expect(limitInput()).toHaveValue("20.00");
			expect(pressedPresets()).toEqual(["$20.00"]);
		});

		it("takes a preset's amount when the preset is chosen", async () => {
			serveFreshInstall();
			renderAppAt("/");
			await setupSteps();

			fireEvent.click(screen.getByRole("button", { name: "$5.00" }));

			expect(limitInput()).toHaveValue("5.00");
			expect(pressedPresets()).toEqual(["$5.00"]);
		});

		it("selects no preset for a typed amount none of them names", async () => {
			serveFreshInstall();
			renderAppAt("/");
			await setupSteps();

			fireEvent.change(limitInput(), { target: { value: "7.50" } });

			expect(screen.queryAllByRole("button", { pressed: true })).toEqual([]);
		});

		it("stores nothing while the limit is chosen", async () => {
			const server = serveFreshInstall();
			renderAppAt("/");
			await setupSteps();

			fireEvent.click(screen.getByRole("button", { name: "$50.00" }));
			fireEvent.change(limitInput(), { target: { value: "3" } });

			expect(server.sent.filter(({ method }) => method !== "GET")).toEqual([]);
		});
	});

	describe("the corpus step before a scan", () => {
		it("reads Required while the limit is a positive amount", async () => {
			serveFreshInstall();

			renderAppAt("/");
			const steps = await setupSteps();

			expect(steps[1]).toHaveTextContent("Required");
			expect(steps[1]).not.toHaveClass("opacity-55");
		});

		it("is dimmed, asking for a limit first, while the limit is not a positive amount", async () => {
			serveFreshInstall();
			renderAppAt("/");
			const steps = await setupSteps();

			fireEvent.change(
				screen.getByRole("textbox", { name: "Spend limit in US dollars" }),
				{ target: { value: "0" } },
			);

			expect(steps[1]).toHaveTextContent("Set a limit first");
			expect(steps[1]).toHaveClass("opacity-55");
		});
	});

	describe("the corpus scan", () => {
		function servingScan(scanReply: Reply): FakeServer {
			return serveFreshInstall(
				new Map<string, Reply>([
					["PUT /api/setup/corpus", scanReply],
					["GET /api/corpus", { status: 200, body: SCANNED_CORPUS }],
				]),
			);
		}

		it("starts empty, offering the live install as the path", async () => {
			serveFreshInstall();

			renderAppAt("/");
			await setupSteps();

			expect(corpusInput()).toHaveValue("");
			expect(corpusInput()).toHaveAttribute("placeholder", LIVE_ROOT);
		});

		it("scans the live install when no path is typed", async () => {
			const server = servingScan({ status: 200, body: settings(null) });
			renderAppAt("/");
			await setupSteps();

			scan();
			await screen.findByText(/^Found 2 files/u);

			expect(
				server.sent
					.filter(({ method }) => method === "PUT")
					.map(({ pathname, body }) => [pathname, body]),
			).toEqual([["/api/setup/corpus", JSON.stringify({ directory: "" })]]);
		});

		it("scans the typed path", async () => {
			const server = servingScan({ status: 200, body: settings(null) });
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
		});

		it("lists each file as path, hash and line count under the version it hashed as", async () => {
			servingScan({ status: 200, body: settings(null) });
			renderAppAt("/");
			await setupSteps();

			scan();
			const found = await screen.findByText(/^Found 2 files/u);

			expect(found).toHaveTextContent(
				"Found 2 files · hashed as corpus@a41c7e",
			);
			expect(
				within(screen.getByRole("list", { name: "Scanned corpus files" }))
					.getAllByRole("listitem")
					.map((row) => row.textContent),
			).toEqual([
				"CLAUDE.mdsha 4f21c8218 ln",
				"skills/implement/SKILL.mdsha 88b0d296 ln",
			]);
		});

		it("reads Linked once the scan is satisfied, even after the limit is cleared", async () => {
			servingScan({ status: 200, body: settings(null) });
			renderAppAt("/");
			const steps = await setupSteps();

			scan();
			await screen.findByText(/^Found 2 files/u);
			fireEvent.change(
				screen.getByRole("textbox", { name: "Spend limit in US dollars" }),
				{ target: { value: "" } },
			);

			expect(steps[1]).toHaveTextContent("Linked");
		});

		it("shows the server's refusal and lists nothing when the scan is refused", async () => {
			servingScan({
				status: 409,
				body: { error: "Corpus source /tmp/x holds no corpus layout entry" },
			});
			renderAppAt("/");
			const steps = await setupSteps();

			scan();

			expect(await screen.findByRole("alert")).toHaveTextContent(
				"Corpus source /tmp/x holds no corpus layout entry",
			);
			expect(screen.queryByText(/^Found/u)).not.toBeInTheDocument();
			expect(steps[1]).toHaveTextContent("Required");
		});

		it("is not satisfied by a corpus whose files refused hashing, and names why", async () => {
			serveFreshInstall(
				new Map<string, Reply>([
					["PUT /api/setup/corpus", { status: 200, body: settings(null) }],
					[
						"GET /api/corpus",
						{
							status: 200,
							body: {
								...SCANNED_CORPUS,
								digest: undefined,
								refusals: [
									"Corpus file CLAUDE.md resolves outside the corpus source",
								],
							},
						},
					],
				]),
			);
			renderAppAt("/");
			const steps = await setupSteps();

			scan();

			expect(
				await screen.findByText(
					"Corpus file CLAUDE.md resolves outside the corpus source",
					{ exact: false },
				),
			).toBeInTheDocument();
			expect(steps[1]).toHaveTextContent("Required");
		});
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
