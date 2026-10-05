import { afterEach, describe, expect, it } from "bun:test";
import type { RenderResult } from "@testing-library/react";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import type { LaunchTarget } from "./launch-dialog";
import { LaunchDialog } from "./launch-dialog";

const SET_COMMAND = "rehearse settings --spend-ceiling-usd <USD>";

interface SettingsReadingBody {
	readonly spendCeilingUsd: number | null;
	readonly setCommand: string;
	readonly recordsDirectory: string;
	readonly linkedCorpus: { readonly kind: "live"; readonly root: string };
	readonly overrun: string;
}

/** The whole reading the server answers, so the stub matches its contract. */
function settingsReading(spendCeilingUsd: number | null): SettingsReadingBody {
	return {
		spendCeilingUsd,
		setCommand: SET_COMMAND,
		recordsDirectory: "/records",
		linkedCorpus: { kind: "live", root: "/home/.claude" },
		overrun: "The ceiling can be overrun by the calls in flight.",
	};
}

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function routes(
	overrides: ReadonlyMap<string, Reply> = new Map(),
): ReadonlyMap<string, Reply> {
	return new Map([
		["GET /api/settings", { status: 200, body: settingsReading(5) }],
		[
			"GET /api/cases",
			{
				status: 200,
				body: {
					cases: [
						{
							id: "audit-log",
							kind: "pipeline",
							title: "Audit log",
							model: "sonnet",
						},
						{
							id: "no-model",
							kind: "session",
							title: "No model",
							model: null,
						},
						{
							id: "smoke",
							kind: "session",
							title: "Smoke",
							model: "sonnet",
						},
					],
					unreadable: [],
				},
			},
		],
		[
			"GET /api/corpus",
			{
				status: 200,
				body: {
					root: "/home/user/.claude",
					digest: `a41c7e${"0".repeat(58)}`,
					files: [],
					refusals: [],
					lastEdit: { kind: "not-recorded", reason: "no earlier version" },
				},
			},
		],
		[
			"POST /api/launches",
			{ status: 202, body: { id: "7b0c2d4e-0000-4000-8000-000000000000" } },
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

function openDialog(target: LaunchTarget): Promise<HTMLElement> {
	renderDialog(target);
	fireEvent.click(screen.getByRole("button", { name: "New run" }));

	return screen.findByRole("dialog");
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

describe(LaunchDialog.name, () => {
	it("offers one, three, six or twelve attempts with one pressed", async () => {
		serving();

		const dialog = await openDialog({ kind: "case" });

		const attempts = within(dialog).getByRole("group", { name: "Attempts" });
		expect(
			within(attempts)
				.getAllByRole("button")
				.map((button) => [
					button.textContent,
					button.getAttribute("aria-pressed"),
				]),
		).toEqual([
			["×1", "true"],
			["×3", "false"],
			["×6", "false"],
			["×12", "false"],
		]);
	});

	it("names the attempt count on the start button", async () => {
		serving();
		const dialog = await openDialog({ kind: "case" });

		fireEvent.click(within(dialog).getByRole("button", { name: "×3" }));

		expect(
			await within(dialog).findByRole("button", { name: "Start · 3 attempts" }),
		).toBeInTheDocument();
	});

	it("states the corpus version the launch will run against", async () => {
		serving();

		const dialog = await openDialog({ kind: "case" });

		expect(
			await within(dialog).findByText("corpus@a41c7e"),
		).toBeInTheDocument();
	});

	it("states the stored ceiling holding the launch and that calls in flight can overrun it", async () => {
		serving();

		const dialog = await openDialog({ kind: "case" });

		expect(
			await within(dialog).findByText(
				"Ceiling $5.00 · stops mid-step if reached, and can be overrun by the calls in flight",
			),
		).toBeInTheDocument();
	});

	it("states a group's ceiling as the attempts times the per-run ceiling", async () => {
		serving();
		const dialog = await openDialog({ kind: "case" });

		fireEvent.click(within(dialog).getByRole("button", { name: "×6" }));

		expect(
			await within(dialog).findByText(
				"Ceiling $5.00 per attempt, $30.00 for the group of 6 · stops mid-step if reached, and can be overrun by the calls in flight",
			),
		).toBeInTheDocument();
	});

	it("posts the first case that declares a model, and the attempts, as JSON when started", async () => {
		const server = serving();
		const dialog = await openDialog({ kind: "case" });
		fireEvent.click(within(dialog).getByRole("button", { name: "×3" }));

		fireEvent.click(await startButton());

		await waitFor(() => {
			expect(server.posted("/api/launches")).toHaveLength(1);
		});
		const [request] = server.posted("/api/launches");
		expect(request?.contentType).toBe("application/json");
		expect(JSON.parse(request?.body ?? "")).toEqual({
			kind: "case",
			caseId: "audit-log",
			attempts: 3,
		});
	});

	it("posts the case picked from the list", async () => {
		const server = serving();
		const dialog = await openDialog({ kind: "case" });
		await within(dialog).findByRole("option", { name: "smoke · Smoke" });

		fireEvent.change(within(dialog).getByLabelText("Case"), {
			target: { value: "smoke" },
		});
		fireEvent.click(await startButton());

		await waitFor(() => {
			expect(server.posted("/api/launches")).toHaveLength(1);
		});
		expect(
			JSON.parse(server.posted("/api/launches")[0]?.body ?? ""),
		).toMatchObject({ caseId: "smoke" });
	});

	describe("when opened on a case with its attempts chosen", () => {
		it("posts that case and that many attempts", async () => {
			const server = serving();
			await openDialog({ kind: "case", caseId: "smoke", attempts: 3 });
			await screen.findByRole("option", { name: "smoke · Smoke" });

			fireEvent.click(await startButton());

			await waitFor(() => {
				expect(server.posted("/api/launches")).toHaveLength(1);
			});
			expect(JSON.parse(server.posted("/api/launches")[0]?.body ?? "")).toEqual(
				{ kind: "case", caseId: "smoke", attempts: 3 },
			);
		});

		it("shows that case picked and that attempt count pressed", async () => {
			serving();
			const dialog = await openDialog({
				kind: "case",
				caseId: "smoke",
				attempts: 3,
			});
			await within(dialog).findByRole("option", { name: "smoke · Smoke" });

			expect(within(dialog).getByLabelText("Case")).toHaveValue("smoke");
			expect(
				within(dialog).getByRole("button", { name: "×3" }),
			).toHaveAttribute("aria-pressed", "true");
		});
	});

	it("posts the run and stage when replaying a stage", async () => {
		const server = serving();
		await openDialog({
			kind: "replay",
			run: "2026-09-06T21-58-29.508Z",
			stage: "build",
		});

		fireEvent.click(await startButton());

		await waitFor(() => {
			expect(server.posted("/api/launches")).toHaveLength(1);
		});
		expect(JSON.parse(server.posted("/api/launches")[0]?.body ?? "")).toEqual({
			kind: "replay",
			run: "2026-09-06T21-58-29.508Z",
			stage: "build",
			attempts: 1,
		});
	});

	describe("when opened on a stage replay with its attempts chosen", () => {
		it("posts that many attempts", async () => {
			const server = serving();
			await openDialog({
				kind: "replay",
				run: "2026-09-06T21-58-29.508Z",
				stage: "build",
				attempts: 3,
			});

			fireEvent.click(await startButton());

			await waitFor(() => {
				expect(server.posted("/api/launches")).toHaveLength(1);
			});
			expect(
				JSON.parse(server.posted("/api/launches")[0]?.body ?? ""),
			).toMatchObject({ kind: "replay", attempts: 3 });
		});
	});

	describe("when comparing two recorded attempts", () => {
		const COMPARISON: LaunchTarget = {
			kind: "comparison",
			armA: "build-checkpoint-baseline",
			armB: "build-checkpoint-candidate",
			run: "2026-09-06T21-58-29.508Z",
			stage: "build",
			reps: 2,
		};

		it("names both arms and the checkpoint the baseline group replays", async () => {
			serving();

			const dialog = await openDialog(COMPARISON);

			expect(
				within(dialog).getByText("build-checkpoint-baseline"),
			).toBeInTheDocument();
			expect(
				within(dialog).getByText("build-checkpoint-candidate"),
			).toBeInTheDocument();
			expect(
				within(dialog).getByText("2026-09-06T21-58-29.508Z"),
			).toBeInTheDocument();
			expect(
				within(dialog).getByText(
					"arm A's corpus without the one skill that differs",
				),
			).toBeInTheDocument();
		});

		it("states the baseline group's cost at arm A's group size, which it offers no choice of", async () => {
			serving();

			const dialog = await openDialog(COMPARISON);

			expect(
				await within(dialog).findByText(
					"Ceiling $5.00 per attempt, $10.00 for the group of 2 · stops mid-step if reached, and can be overrun by the calls in flight",
				),
			).toBeInTheDocument();
			expect(
				within(dialog).queryByRole("group", { name: "Attempts" }),
			).not.toBeInTheDocument();
			expect(
				within(dialog).getByRole("button", { name: "Start · 2 attempts" }),
			).toBeInTheDocument();
		});

		it("posts the two arms when started", async () => {
			const server = serving();
			await openDialog(COMPARISON);

			fireEvent.click(await startButton());

			await waitFor(() => {
				expect(server.posted("/api/launches")).toHaveLength(1);
			});
			expect(JSON.parse(server.posted("/api/launches")[0]?.body ?? "")).toEqual(
				{
					kind: "comparison",
					armA: "build-checkpoint-baseline",
					armB: "build-checkpoint-candidate",
				},
			);
		});
	});

	describe("when adding attempts to a saved comparison", () => {
		const EXTENSION: LaunchTarget = {
			kind: "extension",
			comparison: "a".repeat(64),
			attempts: 2,
			usd: 9,
		};

		it("states what the added attempts cost before anything starts", async () => {
			serving();

			const dialog = await openDialog(EXTENSION);

			expect(
				within(dialog).getByText(
					"about $9.00, at each arm's mean recorded cost per attempt",
				),
			).toBeInTheDocument();
			expect(
				within(dialog).queryByRole("group", { name: "Attempts" }),
			).not.toBeInTheDocument();
			expect(
				within(dialog).getByRole("button", { name: "Start · 6 attempts" }),
			).toBeInTheDocument();
			expect(
				within(dialog).getByText(/for each of the 3 groups of 2 ·/u),
			).toBeInTheDocument();
		});

		it("posts the comparison with the cost it stated", async () => {
			const server = serving();
			await openDialog(EXTENSION);

			fireEvent.click(await startButton());

			await waitFor(() => {
				expect(server.posted("/api/launches")).toHaveLength(1);
			});
			expect(JSON.parse(server.posted("/api/launches")[0]?.body ?? "")).toEqual(
				{
					kind: "extension",
					comparison: "a".repeat(64),
					attempts: 2,
					statedUsd: 9,
				},
			);
		});
	});

	it("closes once the launch is accepted", async () => {
		serving();
		await openDialog({ kind: "case" });

		fireEvent.click(await startButton());

		await waitFor(() => {
			expect(screen.queryByRole("dialog")).toBeNull();
		});
	});

	it("marks a case with no declared model as one it cannot start", async () => {
		serving();

		const dialog = await openDialog({ kind: "case" });

		expect(
			await within(dialog).findByRole("option", {
				name: "no-model · declares no model",
			}),
		).toBeDisabled();
	});

	it("closes on Esc and returns focus to the button that opened it", async () => {
		serving();
		const dialog = await openDialog({ kind: "case" });

		fireEvent.keyDown(dialog, { key: "Escape" });

		await waitFor(() => {
			expect(screen.queryByRole("dialog")).toBeNull();
		});
		expect(document.activeElement).toBe(
			screen.getByRole("button", { name: "New run" }),
		);
	});

	describe("when the spend ceiling is edited", () => {
		function storing(usd: number): ReadonlyMap<string, Reply> {
			return new Map([
				[
					"PUT /api/settings/spend-ceiling",
					{
						status: 200,
						body: settingsReading(usd),
					},
				],
			]);
		}

		it("shows the stored ceiling in the field to the cent", async () => {
			serving();

			const dialog = await openDialog({ kind: "case" });

			await waitFor(() => {
				expect(within(dialog).getByLabelText("Spend ceiling")).toHaveValue(
					"5.00",
				);
			});
		});

		it("shows a stored ceiling finer than a cent unrounded", async () => {
			serving(
				new Map([
					["GET /api/settings", { status: 200, body: settingsReading(0.125) }],
				]),
			);

			const dialog = await openDialog({ kind: "case" });

			await waitFor(() => {
				expect(within(dialog).getByLabelText("Spend ceiling")).toHaveValue(
					"0.125",
				);
			});
		});

		it("holds start while the field holds a ceiling not yet stored", async () => {
			serving();
			const dialog = await openDialog({ kind: "case" });
			await startButton();

			fireEvent.change(within(dialog).getByLabelText("Spend ceiling"), {
				target: { value: "2" },
			});

			expect(
				within(dialog).getByRole("button", { name: /^Start/u }),
			).toBeDisabled();
			expect(
				within(dialog).getByText(
					"Store this ceiling to start, or the launch holds to the stored one.",
				),
			).toBeInTheDocument();
		});

		it("stores the entered ceiling as JSON and states it as the one holding the launch", async () => {
			const server = serving(storing(2.5));
			const dialog = await openDialog({ kind: "case" });
			await startButton();

			fireEvent.change(within(dialog).getByLabelText("Spend ceiling"), {
				target: { value: "2.50" },
			});
			fireEvent.click(
				within(dialog).getByRole("button", { name: "Store ceiling" }),
			);

			expect(
				await within(dialog).findByText(
					"Ceiling $2.50 · stops mid-step if reached, and can be overrun by the calls in flight",
				),
			).toBeInTheDocument();
			const request = server.sent.find(({ method }) => method === "PUT");
			expect(request?.pathname).toBe("/api/settings/spend-ceiling");
			expect(request?.contentType).toBe("application/json");
			expect(JSON.parse(request?.body ?? "")).toEqual({ usd: 2.5 });
		});

		it.each(["0", "-1", "five", "", "0x10", "1e3", " 5"])(
			"offers no store for %p",
			async (entered) => {
				serving();
				const dialog = await openDialog({ kind: "case" });
				await startButton();

				fireEvent.change(within(dialog).getByLabelText("Spend ceiling"), {
					target: { value: entered },
				});

				expect(
					within(dialog).getByRole("button", { name: "Store ceiling" }),
				).toBeDisabled();
			},
		);

		it("shows the refusal when the server does not store it", async () => {
			serving(
				new Map([
					[
						"PUT /api/settings/spend-ceiling",
						{ status: 409, body: { error: "The settings file is not JSON" } },
					],
				]),
			);
			const dialog = await openDialog({ kind: "case" });
			await startButton();

			fireEvent.change(within(dialog).getByLabelText("Spend ceiling"), {
				target: { value: "3" },
			});
			fireEvent.click(
				within(dialog).getByRole("button", { name: "Store ceiling" }),
			);

			expect(await within(dialog).findByRole("alert")).toHaveTextContent(
				"The settings file is not JSON",
			);
		});
	});

	describe("when a case cannot be read", () => {
		it("names the case and why it is not offered", async () => {
			serving(
				new Map([
					[
						"GET /api/cases",
						{
							status: 200,
							body: {
								cases: [],
								unreadable: [
									{
										id: "broken-case",
										reason: "Case broken-case declaration is not valid JSON",
									},
								],
							},
						},
					],
				]),
			);

			const dialog = await openDialog({ kind: "case" });

			expect(
				await within(dialog).findByText(
					"broken-case: Case broken-case declaration is not valid JSON",
				),
			).toBeInTheDocument();
		});
	});

	describe("when the case list cannot be read", () => {
		it("says so rather than offering an empty picker", async () => {
			serving(
				new Map([
					[
						"GET /api/cases",
						{ status: 500, body: { error: "Cannot list cases" } },
					],
				]),
			);

			const dialog = await openDialog({ kind: "case" });

			expect(await within(dialog).findByRole("alert")).toHaveTextContent(
				"Cannot list cases",
			);
		});
	});

	describe("when the settings file cannot be read", () => {
		it("shows the refusal the server gives", async () => {
			serving(
				new Map([
					[
						"GET /api/settings",
						{ status: 409, body: { error: "The settings file is not JSON" } },
					],
				]),
			);

			const dialog = await openDialog({ kind: "case" });

			expect(await within(dialog).findByRole("alert")).toHaveTextContent(
				/^⚠ The settings file is not JSON$/u,
			);
		});
	});

	describe("when no spend ceiling is stored", () => {
		it("starts once a ceiling is entered and stored", async () => {
			serving(
				new Map([
					[
						"GET /api/settings",
						{
							status: 200,
							body: settingsReading(null),
						},
					],
					[
						"PUT /api/settings/spend-ceiling",
						{
							status: 200,
							body: settingsReading(4),
						},
					],
				]),
			);
			const dialog = await openDialog({ kind: "case" });
			await within(dialog).findByText(SET_COMMAND);

			fireEvent.change(within(dialog).getByLabelText("Spend ceiling"), {
				target: { value: "4" },
			});
			fireEvent.click(
				within(dialog).getByRole("button", { name: "Store ceiling" }),
			);

			expect(await startButton()).toBeEnabled();
		});

		it("disables start and names the command that sets one", async () => {
			const server = serving(
				new Map([
					[
						"GET /api/settings",
						{
							status: 200,
							body: settingsReading(null),
						},
					],
				]),
			);

			const dialog = await openDialog({ kind: "case" });

			expect(await within(dialog).findByText(SET_COMMAND)).toBeInTheDocument();
			expect(
				within(dialog).getByRole("button", { name: "Start · 1 attempt" }),
			).toBeDisabled();
			expect(server.posted("/api/launches")).toHaveLength(0);
		});
	});

	describe("when the server refuses the launch", () => {
		it("shows the guard's plain-text refusal as the server sent it", async () => {
			const server = new FakeServer(routes());
			server.install();
			const fakeFetch = globalThis.fetch;
			globalThis.fetch = Object.assign(
				(input: string | URL | Request, init?: RequestInit) =>
					init?.method === "POST"
						? Promise.resolve(
								new Response("Forbidden: not a same-origin JSON request", {
									status: 403,
								}),
							)
						: fakeFetch(input, init),
				{ preconnect: fetch.preconnect },
			);
			const dialog = await openDialog({ kind: "case" });

			fireEvent.click(await startButton());

			expect(await within(dialog).findByRole("alert")).toHaveTextContent(
				"Forbidden: not a same-origin JSON request",
			);
		});

		it("keeps the dialog open and shows the refusal", async () => {
			serving(
				new Map([
					[
						"POST /api/launches",
						{
							status: 409,
							body: { error: "Run R recorded no plan checkpoint" },
						},
					],
				]),
			);
			const dialog = await openDialog({ kind: "case" });

			fireEvent.click(await startButton());

			expect(await within(dialog).findByRole("alert")).toHaveTextContent(
				"Run R recorded no plan checkpoint",
			);
		});
	});
});
