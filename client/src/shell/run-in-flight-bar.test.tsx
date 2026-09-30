import { afterEach, describe, expect, it } from "bun:test";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { renderAppWithStub } from "#client/test-support/render-app";
import { graded, notYet, runRow } from "#client/test-support/runs-in-flight";
import { RunInFlight } from "./run-in-flight-bar";

type HistoryRow = RunHistoryResponse["rows"][number];

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
	const view = (next: readonly HistoryRow[]): React.JSX.Element => (
		<QueryClientProvider client={client}>
			<RunInFlight rows={next} />
		</QueryClientProvider>
	);
	const { rerender } = render(view(rows));

	return {
		rerender: (next) => {
			rerender(view(next));
		},
	};
}

function bar(): HTMLElement {
	return screen.getByRole("region", { name: "Run in flight" });
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

		const shown = await screen.findByRole("region", { name: "Run in flight" });
		expect(shown).toHaveTextContent("r-0148");
		expect(shown).toHaveTextContent("audit-log");
		expect(shown).toHaveTextContent("step 2 of 2 · build");
		expect(shown).toHaveTextContent("session running");
		expect(shown).toHaveTextContent("$1.83 / $20.00");
		expect(shown).toHaveTextContent("grades so far B+");
		expect(
			within(shown).getByRole("meter", {
				name: "run spend against its ceiling",
			}),
		).toHaveAttribute("aria-valuenow", "1.83");
		expect(
			within(shown).getByRole("button", { name: "Stop & restore repo" }),
		).toBeInTheDocument();
	});

	it("shows nothing on a screen when no run is in flight", async () => {
		renderAppWithStub("/corpus", new Map());

		await screen.findByRole("navigation", { name: "Sections" });
		expect(
			screen.queryByRole("region", { name: "Run in flight" }),
		).not.toBeInTheDocument();
	});

	it("leaves when the run ends", () => {
		const { rerender } = renderRunInFlight([runRow({})]);
		expect(bar()).toBeInTheDocument();

		rerender([runRow({ status: "COMPLETE" })]);

		expect(
			screen.queryByRole("region", { name: "Run in flight" }),
		).not.toBeInTheDocument();
	});

	it("says why a run started outside the browser cannot be stopped from it", () => {
		renderRunInFlight([runRow({ launchId: undefined })]);

		expect(
			within(bar()).queryByRole("button", { name: /Stop/v }),
		).not.toBeInTheDocument();
		expect(bar()).toHaveTextContent(
			"started outside the browser, so it stops only where it was started",
		);
	});

	it("says what spend it has not read rather than a figure it cannot vouch for", () => {
		renderRunInFlight([runRow({})]);

		expect(bar()).toHaveTextContent("run spend not recorded");
		expect(within(bar()).queryByRole("meter")).not.toBeInTheDocument();
	});

	it("shows the newest run and counts the others in flight", async () => {
		renderAppWithStub(
			"/corpus",
			new Map([
				[
					"/api/runs",
					history([
						runRow({ run: "2026-09-30T09-00-00.000Z" }),
						runRow({ run: "2026-09-30T11-00-00.000Z", stage: "review" }),
					]),
				],
			]),
		);

		const shown = await screen.findByRole("region", { name: "Run in flight" });
		expect(shown).toHaveTextContent("review");
		expect(
			within(shown).getByRole("link", { name: "+1 running" }),
		).toHaveAttribute("href", "/");
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
				grades: [graded("plan", "B+"), graded("build", "D", "FAIL")],
			}),
		]);

		expect(screen.getByRole("status")).toHaveTextContent(
			"r-0148 stopped at step 2 of 2: build",
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
