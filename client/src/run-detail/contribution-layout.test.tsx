import { afterEach, describe, expect, it } from "bun:test";
import { screen, within } from "@testing-library/react";
import {
	ANALYSES,
	RUN,
	recordedAnalysis,
	renderRunDetail,
} from "./run-detail-fixtures";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function renderWithAnalysis(): void {
	renderRunDetail(new Map([[ANALYSES, recordedAnalysis()]]));
}

describe("the Contribution layout's map", () => {
	it("shows one chip per declared step with its number, name, grade and role", async () => {
		renderWithAnalysis();

		const map = await screen.findByRole("list", { name: "Step map" });
		await within(map).findByText("primary culprit");
		const chips = within(map).getAllByRole("listitem");

		expect(chips.map((chip) => chip.textContent)).toEqual([
			"1shapeA-·not implicated",
			"2buildD✕primary culprit",
			"3verify—○never ran",
		]);
	});

	it("leaves the role off each chip while no analysis is recorded", async () => {
		renderRunDetail();

		const map = await screen.findByRole("list", { name: "Step map" });

		expect(
			within(map)
				.getAllByRole("listitem")
				.map((chip) => chip.textContent),
		).toEqual(["1shapeA-", "2buildD", "3verify—"]);
	});
});

describe("the Culprit analysis section", () => {
	it("discloses a recorded analysis as one agent's reading, with its provenance and culprit", async () => {
		renderWithAnalysis();

		const section = await screen.findByRole("region", {
			name: "Culprit analysis",
		});
		await within(section).findByText(/an agent read the recorded steps/u);

		expect(section).toHaveTextContent(
			"an agent read the recorded steps · $0.24 · 41s",
		);
		expect(section).toHaveTextContent(
			"culprit: skills/implement.md · lines 12–30",
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

	it("offers the paired rerun, the block it names and a re-run of the analysis", async () => {
		renderWithAnalysis();

		const section = await screen.findByRole("region", {
			name: "Culprit analysis",
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
		expect(build).toHaveTextContent("✕ primary culprit");
		expect(build).toHaveTextContent("Build ignored the declared scope.");
		expect(
			within(build).getByRole("link", { name: "Step report" }),
		).toHaveAttribute("href", `/runs/${RUN}/stages/build`);
		expect(within(rows).getByText("verify").closest("li")).toHaveTextContent(
			"○ never ran",
		);
	});

	it("shows why the newest analysis failed, what it returned, and offers a re-run", async () => {
		const { newest, ...reading } = recordedAnalysis();
		if (newest === null) {
			throw new Error("the fixture records an analysis");
		}
		renderRunDetail(
			new Map([
				[
					ANALYSES,
					{
						...reading,
						newest: {
							schemaVersion: newest.schemaVersion,
							run: newest.run,
							model: newest.model,
							capUsd: newest.capUsd,
							startedAt: newest.startedAt,
							durationMs: newest.durationMs,
							bundleDigest: newest.bundleDigest,
							bundleBytes: newest.bundleBytes,
							outcome: "failed",
							reason: "the answer named a stage the run does not declare",
							payload: { culprit: { stage: "deploy" } },
						},
						unreadable: [
							{ file: "2026-09-28T10-40-00.000Z.json", reason: "not JSON" },
						],
					},
				],
			]),
		);

		const section = await screen.findByRole("region", {
			name: "Culprit analysis",
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
		expect(within(section).getByRole("alert")).toHaveTextContent(
			"2026-09-28T10-40-00.000Z.json: not JSON",
		);
	});
});
