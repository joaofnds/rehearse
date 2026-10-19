import { afterEach, describe, expect, it } from "bun:test";

import { screen } from "@testing-library/react";

import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";

import GroupWorkspacePage from "./group-workspace";
import {
	RUN,
	group,
	originalFetch,
	serve,
} from "./group-workspace-test-fixtures";

const expectedMatchingElementsCount = 2;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(GroupWorkspacePage.name, () => {
	it(
		"reads the exploratory source and its frozen instructions",
		readsExploratorySourceAndFrozenInstructions,
	);
	it(
		"shows stage results beside a clearly exploratory source step and frozen reads",
		showsStageResultsBesideAClearlyExploratorySourceStepAndFrozenReads,
	);

	it(
		"keeps whole-workflow outcomes independent of step grades in pipeline mode",
		keepsWholeWorkflowOutcomesIndependentOfStepGradesInPipelineMode,
	);
});

async function showsStageResultsBesideAClearlyExploratorySourceStepAndFrozenReads(): Promise<void> {
	serve(group(), {
		reads: {
			reasons: [],
			reps: [
				{
					readManifest: [
						{
							evidence: "declared",
							half: "corpus",
							path: "skills/build/SKILL.md",
							role: "stage skill",
							sha256: "c".repeat(SHA256_HEX_CHARACTERS),
							state: "changed",
						},
					],
					repId: "rep-1",
					stage: "build",
				},
			],
		},
	});
	expect(
		await screen.findByRole("heading", {
			level: 1,
			name: "Group g1",
		}),
	).toBeInTheDocument();
	expect(screen.getAllByText(/median B/u)).toHaveLength(
		expectedMatchingElementsCount,
	);
	expect(screen.getAllByText(/2 of 3 graded/u)).toHaveLength(
		expectedMatchingElementsCount,
	);
	expect(screen.getAllByText(/recorded group total \$6.00/iu)).toHaveLength(
		expectedMatchingElementsCount,
	);
	expect(screen.getAllByText(/mean unavailable/u)).toHaveLength(
		expectedMatchingElementsCount,
	);
	expect(
		screen.getByText(/Group cost includes preflight and all reps/u),
	).toBeInTheDocument();
	expect(
		screen.getByRole("link", { name: "Browse saved comparisons" }),
	).toHaveAttribute("href", "/comparisons");
}

async function readsExploratorySourceAndFrozenInstructions(): Promise<void> {
	serve(group(), {
		reads: {
			reasons: [],
			reps: [
				{
					readManifest: [
						{
							evidence: "declared",
							half: "corpus",
							path: "skills/build/SKILL.md",
							role: "stage skill",
							sha256: "c".repeat(SHA256_HEX_CHARACTERS),
							state: "changed",
						},
					],
					repId: "rep-1",
					stage: "build",
				},
			],
		},
	});
	await screen.findByRole("heading", { level: 1, name: "Group g1" });
	const [observedFirstLink] = screen.getAllByRole("link", {
		name: /source run/u,
	});
	expect(observedFirstLink).toHaveAttribute(
		"href",
		`/runs/${RUN}?view=results&step=build`,
	);
	expect(
		screen.getByRole("heading", { name: /exploratory/u }),
	).toBeInTheDocument();
	expect(screen.getByText(/no control/u)).toBeInTheDocument();
	expect(screen.getByText(/Source step build/u)).toHaveTextContent(/A/u);
	expect(screen.getByText(/\$1.50/u)).toBeInTheDocument();
	expect(await screen.findByText("skills/build/SKILL.md")).toBeInTheDocument();
	expect(screen.getByText("changed")).toBeInTheDocument();
}

async function keepsWholeWorkflowOutcomesIndependentOfStepGradesInPipelineMode(): Promise<void> {
	serve(
		group({
			checkpoint: undefined,
			cost: { missing: [], parts: [], state: "available", usd: 9 },
			finalOutcomes: { FAIL: 1, PASS: 2 },
			mode: "pipeline",
			unreadReps: [],
		}),
	);

	expect(await screen.findByText("PASS: 2")).toBeInTheDocument();
	expect(screen.getByText("FAIL: 1")).toBeInTheDocument();
	expect(
		screen.getByText(/independently of the step judges/u),
	).toBeInTheDocument();
	expect(
		screen.getByText(/mean \$3.00 per requested rep/u),
	).toBeInTheDocument();
	expect(
		screen.queryByRole("heading", { name: /Source & replay/u }),
	).not.toBeInTheDocument();
}
