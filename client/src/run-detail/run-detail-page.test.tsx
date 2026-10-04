import { afterEach, describe, expect, it } from "bun:test";
import { screen, within } from "@testing-library/react";
import { CORPUS, judgedRow, renderRunDetail } from "./run-detail-fixtures";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("/runs/$run", () => {
	it("names the run, its case and how it ended in the header", async () => {
		renderRunDetail();

		const heading = await screen.findByRole("heading", { level: 1 });
		const header = heading.closest("header");

		expect(heading).toHaveTextContent("r-0147");
		expect(heading).toHaveTextContent("audit-log");
		expect(header).toHaveTextContent("stopped at step 2 · below minimum B");
		expect(header).toHaveTextContent("corpus@a41c7e");
	});

	it("offers the Contribution layout, pressed, and a replay of the step it stopped at", async () => {
		renderRunDetail();

		const switcher = await screen.findByRole("group", {
			name: "Run detail layout",
		});

		expect(
			within(switcher).getByRole("button", { name: "Contribution" }),
		).toHaveAttribute("aria-pressed", "true");
		expect(
			screen.getByRole("button", { name: "Replay step 2" }),
		).toBeInTheDocument();
	});

	it("says a stopped run's repository was restored and which checkpoints remain", async () => {
		renderRunDetail();

		expect(
			await screen.findByText(
				"Repository restored to acme-api @ e91f2a. Checkpoints from step 1 are retained and replayable.",
			),
		).toBeInTheDocument();
	});

	it("grades the task on its own and never shows a letter the final judge did not return", async () => {
		renderRunDetail();

		const card = await screen.findByRole("region", {
			name: "Task grade · graded on its own",
		});

		expect(card).toHaveTextContent(
			"not reached · the run stopped before the final judge",
		);
		expect(card).toHaveTextContent(
			"It does not read the intermediate steps, so it cannot grade a run that stopped early.",
		);
		expect(within(card).queryByText(/^[A-F][+-]?$/u)).not.toBeInTheDocument();
	});

	it("shows the last task grade recorded for the same case, stale when its corpus differs", async () => {
		renderRunDetail(new Map(), [
			judgedRow(
				"2026-09-20T09-00-00.000Z",
				"r-0141",
				"FAIL",
				"1d2e3f".padEnd(64, "0"),
			),
			judgedRow(
				"2026-09-25T09-00-00.000Z",
				"r-0144",
				"PASS",
				"9f30d1".padEnd(64, "0"),
			),
			{
				...judgedRow("2026-09-26T09-00-00.000Z", "r-0145", "PASS", CORPUS),
				caseId: "other-case",
			},
		]);

		const last = await screen.findByRole("region", {
			name: "Last task grade for this case",
		});

		expect(last).toHaveTextContent("PASS");
		expect(last).toHaveTextContent("r-0144");
		expect(last).toHaveTextContent("stale · corpus@9f30d1");
		expect(last).toHaveTextContent("Not comparable to a corpus@a41c7e result.");
	});

	it("says when no other run of the case has a task grade", async () => {
		renderRunDetail();

		const last = await screen.findByRole("region", {
			name: "Last task grade for this case",
		});

		expect(last).toHaveTextContent(
			"No other run of this case has a task grade yet.",
		);
	});
});
