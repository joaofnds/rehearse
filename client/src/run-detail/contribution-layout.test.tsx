import { afterEach, describe, expect, it } from "bun:test";
import { screen, within } from "@testing-library/react";
import {
	ANALYSES,
	failedAnalysis,
	RUN,
	recordedAnalysis,
	recordedAnalysisWith,
	renderContribution,
	serveContribution,
	stoppedAtBuild,
} from "./run-detail-fixtures";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function renderWithAnalysis(): void {
	renderContribution(new Map([[ANALYSES, recordedAnalysis()]]));
}

describe("the Contribution layout's map", () => {
	it("shows one chip per declared step with its number, name, grade and role", async () => {
		renderWithAnalysis();

		const map = await screen.findByRole("list", { name: "Step map" });
		await within(map).findByText("root cause");
		const chips = within(map).getAllByRole("listitem");

		expect(chips.map((chip) => chip.textContent)).toEqual([
			"1shapeA·not a factor",
			"2buildD✕root cause",
			"3verify—○never ran",
		]);
	});

	it("leaves the role off each chip while no analysis is recorded", async () => {
		renderContribution();

		const map = await screen.findByRole("list", { name: "Step map" });

		expect(
			within(map)
				.getAllByRole("listitem")
				.map((chip) => chip.textContent),
		).toEqual(["1shapeA", "2buildD", "3verify—"]);
	});
});

describe("the Root-cause analysis section", () => {
	it("discloses a recorded analysis as one agent's reading, with its provenance and root cause", async () => {
		renderWithAnalysis();

		const section = await screen.findByRole("region", {
			name: "Root-cause analysis",
		});
		await within(section).findByText(/an agent read the recorded steps/u);

		expect(section).toHaveTextContent(
			"an agent read the recorded steps · $0.24 · 41s",
		);
		expect(section).toHaveTextContent(
			"root cause: skills/implement.md · lines 12–30",
		);
		expect(section).toHaveTextContent(
			"Build skipped the scope declaration the shape step asked for.",
		);
		expect(section).toHaveTextContent(
			"This is one agent's reading of the evidence, not a measurement. The way to confirm it is a paired rerun with that block changed and nothing else.",
		);
		expect(section).toHaveTextContent(
			"Replay step 2 with the scope-declaration block changed and nothing else.",
		);
		expect(section).toHaveTextContent("1 earlier analysis");
	});

	it("counts two earlier analyses in the plural", async () => {
		renderContribution(
			new Map([[ANALYSES, { ...recordedAnalysis(), earlierCount: 2 }]]),
		);

		const section = await screen.findByRole("region", {
			name: "Root-cause analysis",
		});

		expect(section).toHaveTextContent("2 earlier analyses recorded");
	});

	it("offers the paired rerun, the block it names and a re-run of the analysis", async () => {
		renderWithAnalysis();

		const section = await screen.findByRole("region", {
			name: "Root-cause analysis",
		});

		expect(
			await within(section).findByRole("button", {
				name: "Set up the paired rerun",
			}),
		).toBeEnabled();
		expect(
			within(section).getByRole("link", { name: "Open the block it names" }),
		).toHaveAttribute("href", "/corpus");
		expect(
			within(section).getByRole("button", {
				name: "Re-run the analysis · at most $1.00",
			}),
		).toBeInTheDocument();
	});

	it("reads each step with its grade track, role, note and step report", async () => {
		renderWithAnalysis();

		const rows = await screen.findByRole("list", {
			name: "Steps as the analysis read them",
		});
		const build = within(rows).getByText("build").closest("li");
		if (build === null) {
			throw new Error("the build row is missing");
		}

		expect(build).toHaveTextContent("▯▯▯▮▯");
		expect(within(rows).getByText("shape").closest("li")).toHaveTextContent(
			"A ▮▯▯▯▯",
		);
		expect(build).toHaveTextContent("✕ root cause");
		expect(build).toHaveTextContent("Build ignored the declared scope.");
		expect(
			within(build).getByRole("link", { name: "Step report" }),
		).toHaveAttribute("href", `/runs/${RUN}/stages/build`);
		expect(within(rows).getByText("verify").closest("li")).toHaveTextContent(
			"○ never ran",
		);
	});

	it("shows why the newest analysis failed, what it returned, and offers a re-run", async () => {
		renderContribution(new Map([[ANALYSES, failedAnalysis()]]));

		const section = await screen.findByRole("region", {
			name: "Root-cause analysis",
		});

		expect(
			await within(section).findByText(
				"The newest analysis failed: the answer named a stage the run does not declare",
			),
		).toBeInTheDocument();
		expect(section).toHaveTextContent('"stage": "deploy"');
		expect(
			within(section).getByRole("button", {
				name: "Re-run the analysis · at most $1.00",
			}),
		).toBeEnabled();
	});

	it("says when the server could not read the run's analyses", async () => {
		serveContribution(
			new Map([[`GET ${ANALYSES}`, { status: 500, body: { error: "disk" } }]]),
		);

		const section = await screen.findByRole("region", {
			name: "Root-cause analysis",
		});

		expect(
			await within(section).findByText(
				"Could not read the root-cause analyses of this run.",
			),
		).toBeInTheDocument();
	});

	it("lists the analysis records it could not read", async () => {
		renderContribution(
			new Map([
				[
					ANALYSES,
					{
						...recordedAnalysis(),
						unreadable: [
							{ file: "2026-09-28T10-40-00.000Z.json", reason: "not JSON" },
						],
					},
				],
			]),
		);

		const section = await screen.findByRole("region", {
			name: "Root-cause analysis",
		});

		expect(await within(section).findByRole("alert")).toHaveTextContent(
			"2026-09-28T10-40-00.000Z.json: not JSON",
		);
	});

	it("disables the paired rerun, saying why, when the checkpoint the root-cause step starts from is missing", async () => {
		renderContribution(
			new Map<string, unknown>([
				[ANALYSES, recordedAnalysis()],
				[`/api/runs/${RUN}`, stoppedAtBuild("missing")],
			]),
		);

		const section = await screen.findByRole("region", {
			name: "Root-cause analysis",
		});

		expect(
			await within(section).findByRole("button", {
				name: "Set up the paired rerun: build has no checkpoint to replay from",
			}),
		).toHaveAttribute("aria-disabled", "true");
	});

	it("disables the paired rerun and the block link when the analysis named no root cause", async () => {
		renderContribution(
			new Map([[ANALYSES, recordedAnalysisWith({ rootCause: null })]]),
		);

		const section = await screen.findByRole("region", {
			name: "Root-cause analysis",
		});

		expect(
			await within(section).findByText("no root cause named"),
		).toBeInTheDocument();
		expect(
			within(section).getByRole("button", {
				name: "Set up the paired rerun: the analysis named no root cause",
			}),
		).toHaveAttribute("aria-disabled", "true");
		expect(
			within(section).getByRole("button", {
				name: "Open the block it names: the analysis named no root cause",
			}),
		).toHaveAttribute("aria-disabled", "true");
		expect(
			within(section).queryByRole("link", { name: "Open the block it names" }),
		).not.toBeInTheDocument();
	});
});
