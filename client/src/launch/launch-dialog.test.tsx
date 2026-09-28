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

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function routes(
	overrides: ReadonlyMap<string, Reply> = new Map(),
): ReadonlyMap<string, Reply> {
	return new Map([
		[
			"GET /api/settings",
			{ status: 200, body: { spendCeilingUsd: 5, setCommand: SET_COMMAND } },
		],
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

	it("posts the chosen case and attempts as JSON when started", async () => {
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

	describe("when no spend ceiling is stored", () => {
		it("disables start and names the command that sets one", async () => {
			const server = serving(
				new Map([
					[
						"GET /api/settings",
						{
							status: 200,
							body: { spendCeilingUsd: null, setCommand: SET_COMMAND },
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
