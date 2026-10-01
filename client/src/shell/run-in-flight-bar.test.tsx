import { afterEach, describe, expect, it } from "bun:test";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	RouterContextProvider,
} from "@tanstack/react-router";
import { createAppRouter } from "#client/router";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { renderAppWithStub } from "#client/test-support/render-app";
import { recordStage, runRecord } from "#client/test-support/run-record";
import { graded, notYet, runRow } from "#client/test-support/runs-in-flight";
import { RunInFlight } from "./run-in-flight-bar";

type HistoryRow = RunHistoryResponse["rows"][number];

const OLDER = "2026-09-30T09-00-00.000Z";
const NEWER = "2026-09-30T11-00-00.000Z";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function history(rows: readonly HistoryRow[]): RunHistoryResponse {
	return { rows: [...rows], launches: [], unreadable: [] };
}

interface RenderedRunInFlight {
	readonly rerender: (next: readonly HistoryRow[]) => void;
}

function renderRunInFlight(rows: readonly HistoryRow[]): RenderedRunInFlight {
	const client = new QueryClient();
	const router = createAppRouter({
		history: createMemoryHistory({ initialEntries: ["/corpus"] }),
	});
	const view = (next: readonly HistoryRow[]): React.JSX.Element => (
		<QueryClientProvider client={client}>
			<RouterContextProvider router={router}>
				<RunInFlight rows={next} />
			</RouterContextProvider>
		</QueryClientProvider>
	);
	const { rerender } = render(view(rows));

	return {
		rerender: (next) => {
			rerender(view(next));
		},
	};
}

const IN_FLIGHT = /^Run \S+ in flight$/u;

function bar(): HTMLElement {
	return screen.getByRole("region", { name: IN_FLIGHT });
}

describe("the run in flight on every screen", () => {
	it("shows the run's readings on a screen other than run history", async () => {
		renderAppWithStub(
			"/corpus",
			new Map([
				[
					"/api/runs",
					history([
						runRow({
							stage: "build",
							grades: [graded("plan", "B+"), notYet("build")],
							runSpentUsd: 1.83,
							ceilingUsd: 20,
							launchId: "launch-1",
						}),
					]),
				],
			]),
		);

		const shown = await screen.findByRole("region", { name: IN_FLIGHT });
		expect(shown).toHaveTextContent("r-0148");
		expect(shown).toHaveTextContent("audit-log");
		expect(shown).toHaveTextContent("step 2 of 2 · build");
		expect(shown).toHaveTextContent("session running");
		expect(shown).toHaveTextContent("$1.83 / $20.00");
		expect(shown).toHaveTextContent("grades so far B+");
		expect(within(shown).getByRole("button", { name: "Stop" })).toBeEnabled();
	});

	it("marks the run with the pulsing glyph alone, as the design draws it", () => {
		renderRunInFlight([runRow({})]);

		expect(within(bar()).queryByText("running")).not.toBeInTheDocument();
	});

	it("draws the spend track at the design's 76 by 5px with its 3px radius", () => {
		renderRunInFlight([runRow({ runSpentUsd: 1.83, ceilingUsd: 20 })]);

		const fill = bar().querySelector("[style*='--spend-share']");

		expect(fill?.parentElement).toHaveClass(
			"h-spend-track-height",
			"w-spend-track-width",
			"rounded-xs",
		);
	});

	it("separates its readings where the design does and nowhere else", () => {
		renderRunInFlight([
			runRow({
				grades: [graded("plan", "B+"), notYet("build")],
				runSpentUsd: 1.83,
				ceilingUsd: 20,
			}),
		]);

		expect(within(bar()).getAllByText("│")).toHaveLength(3);
	});

	it("shows nothing on a screen when no run is in flight", async () => {
		renderAppWithStub("/corpus", new Map());

		await screen.findByRole("navigation", { name: "Sections" });
		expect(
			screen.queryByRole("region", { name: IN_FLIGHT }),
		).not.toBeInTheDocument();
	});

	it("leaves when the run ends", () => {
		const { rerender } = renderRunInFlight([runRow({})]);
		expect(bar()).toBeInTheDocument();

		rerender([runRow({ status: "COMPLETE" })]);

		expect(
			screen.queryByRole("region", { name: IN_FLIGHT }),
		).not.toBeInTheDocument();
	});

	it("shows beside its Stop why a run started outside the browser cannot be stopped from it", () => {
		renderRunInFlight([runRow({ launchId: undefined })]);

		const stop = within(bar()).getByRole("button", { name: "Stop" });
		expect(stop).toHaveAttribute("aria-disabled", "true");
		expect(stop).toHaveAccessibleDescription(
			"Started outside the browser, so it stops only where it was started",
		);
		const reason = within(bar()).getByText(
			"Started outside the browser, so it stops only where it was started",
		);
		expect(reason).toBeVisible();
		expect(reason.closest(".sr-only")).toBeNull();
	});

	it("shows a dash with its reason rather than a figure it cannot vouch for", () => {
		renderRunInFlight([runRow({ ceilingUsd: 20 })]);

		expect(bar()).toHaveTextContent("— run spend not recorded / $20.00");
	});

	it("shows a bar for each run in flight, the newest first", async () => {
		renderAppWithStub(
			"/corpus",
			new Map([
				[
					"/api/runs",
					history([
						{ ...runRow({ run: OLDER }), shortId: "r-0147" },
						{ ...runRow({ run: NEWER, stage: "review" }), shortId: "r-0149" },
					]),
				],
			]),
		);

		const bars = await screen.findAllByRole("region", { name: IN_FLIGHT });

		expect(bars).toHaveLength(2);
		expect(bars[0]).toHaveAccessibleName("Run r-0149 in flight");
		expect(bars[1]).toHaveAccessibleName("Run r-0147 in flight");
	});

	it("opens the live monitor on its own run from any screen", async () => {
		const older = { ...runRow({ run: OLDER }), shortId: "r-0147" };
		renderAppWithStub(
			"/corpus",
			new Map<string, unknown>([
				[
					"/api/runs",
					history([older, { ...runRow({ run: NEWER }), shortId: "r-0149" }]),
				],
				[
					`/api/runs/${OLDER}`,
					runRecord({
						run: OLDER,
						running: "build",
						stages: [recordStage("build")],
					}),
				],
			]),
		);
		const shown = await screen.findByRole("region", {
			name: "Run r-0147 in flight",
		});

		fireEvent.click(within(shown).getByRole("link", { name: "Open monitor" }));

		expect(
			await screen.findByRole("heading", {
				level: 1,
				name: "Run r-0147 in progress",
			}),
		).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: /^Live monitor/u }),
		).toHaveAttribute("aria-current", "page");
	});

	it("stops the run through the launch that started it", async () => {
		const asked: string[] = [];
		const stub = (input: RequestInfo | URL): Promise<Response> => {
			asked.push(input instanceof Request ? input.url : String(input));

			return Promise.resolve(Response.json({}));
		};
		stub.preconnect = originalFetch.preconnect;
		globalThis.fetch = stub;
		renderRunInFlight([runRow({ launchId: "launch-1" })]);

		fireEvent.click(within(bar()).getByRole("button", { name: "Stop" }));

		await waitFor(() => {
			expect(
				within(bar()).getByRole("button", { name: "Stop" }),
			).toBeDisabled();
		});
		expect(asked).toHaveLength(1);
		expect(asked[0]).toEndWith("/api/launches/launch-1/stop");
	});

	it("says why the server refused a stop", async () => {
		const stub = (): Promise<Response> =>
			Promise.resolve(
				Response.json({ error: "launch already ended" }, { status: 409 }),
			);
		stub.preconnect = originalFetch.preconnect;
		globalThis.fetch = stub;
		renderRunInFlight([runRow({ launchId: "launch-1" })]);

		fireEvent.click(within(bar()).getByRole("button", { name: "Stop" }));

		expect(await within(bar()).findByRole("alert")).toHaveTextContent(
			"launch already ended",
		);
	});

	it("offers Stop for the run left in flight after the newest is stopped", async () => {
		const stub = (): Promise<Response> => Promise.resolve(Response.json({}));
		stub.preconnect = originalFetch.preconnect;
		globalThis.fetch = stub;
		const older = {
			...runRow({ run: OLDER, launchId: "launch-b" }),
			shortId: "r-0147",
		};
		const { rerender } = renderRunInFlight([
			{ ...runRow({ run: NEWER, launchId: "launch-a" }), shortId: "r-0149" },
			older,
		]);
		const newest = screen.getByRole("region", { name: "Run r-0149 in flight" });
		fireEvent.click(within(newest).getByRole("button", { name: "Stop" }));
		await waitFor(() => {
			expect(
				within(newest).getByRole("button", { name: "Stop" }),
			).toBeDisabled();
		});

		rerender([older]);

		expect(within(bar()).getByRole("button", { name: "Stop" })).toBeEnabled();
	});

	it("ticks the elapsed clock each second between the run's own readings", async () => {
		renderRunInFlight([
			runRow({ elapsedMs: 9000, measuredAt: new Date().toISOString() }),
		]);

		expect(bar()).toHaveTextContent("00:09");
		await waitFor(
			() => {
				expect(bar()).toHaveTextContent("00:10");
			},
			{ timeout: 2000 },
		);
	});

	it("pulses its glyph only for readers who did not ask for reduced motion", () => {
		renderRunInFlight([runRow({})]);

		const glyph = within(bar()).getByText("●");
		expect(glyph).toHaveClass("animate-live");
		expect(glyph).toHaveClass("motion-reduce:animate-none");
	});
});

describe("what a screen reader hears of a run in flight", () => {
	it("keeps the visible readings out of the live region", () => {
		renderRunInFlight([runRow({})]);

		expect(screen.getByRole("status")).toBeEmptyDOMElement();
		expect(bar()).not.toHaveAttribute("aria-live");
	});

	it("announces a stage accepted", () => {
		const { rerender } = renderRunInFlight([
			runRow({ grades: [notYet("plan"), notYet("build")] }),
		]);

		rerender([runRow({ grades: [graded("plan", "B+"), notYet("build")] })]);

		expect(screen.getByRole("status")).toHaveTextContent(
			"r-0148 step 1 of 2 accepted: plan B+",
		);
	});

	it("announces a stage stopped after the bar has left", () => {
		const { rerender } = renderRunInFlight([
			runRow({ grades: [graded("plan", "B+"), notYet("build")] }),
		]);

		rerender([
			runRow({
				status: "STOPPED:build",
				grades: [graded("plan", "B+"), graded("build", "D", "STOP")],
			}),
		]);

		expect(screen.getByRole("status")).toHaveTextContent(
			"r-0148 stopped at step 2 of 2: build",
		);
	});

	it("announces nothing again for stages accepted before a reading that could not read them", () => {
		const accepted = [
			graded("plan", "B+"),
			graded("design", "A-"),
			notYet("build"),
		];
		const { rerender } = renderRunInFlight([runRow({ grades: accepted })]);

		rerender([runRow({})]);
		rerender([runRow({ grades: accepted })]);

		expect(screen.getByRole("status")).toBeEmptyDOMElement();
	});

	it("announces a stage accepted while a reading could not read the stages", () => {
		const { rerender } = renderRunInFlight([
			runRow({
				grades: [graded("plan", "B+"), notYet("design"), notYet("build")],
			}),
		]);

		rerender([runRow({})]);
		rerender([
			runRow({
				grades: [graded("plan", "B+"), graded("design", "A-"), notYet("build")],
			}),
		]);

		expect(screen.getByRole("status")).toHaveTextContent(
			"r-0148 step 2 of 3 accepted: design A-",
		);
	});

	it("announces the ceiling approached and then nothing new while spend moves on", () => {
		const { rerender } = renderRunInFlight([
			runRow({ runSpentUsd: 7.9, ceilingUsd: 10 }),
		]);
		rerender([runRow({ runSpentUsd: 8.1, ceilingUsd: 10 })]);
		const region = screen.getByRole("status");
		const announced = region.textContent;

		rerender([runRow({ runSpentUsd: 9, ceilingUsd: 10 })]);

		expect(announced).toBe("r-0148 has spent $8.10 of its $10.00 ceiling");
		expect(region.textContent).toBe(announced);
	});
});
