import { afterEach, describe, expect, it } from "bun:test";

import { cleanup, screen } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import { runHistoryReplies } from "#client/test-support/fetch-stub";
import { renderAppWithStub } from "#client/test-support/render-app";
import {
	RUN,
	renderRunDetail,
	stoppedRow,
} from "#client/test-support/run-detail";

import { emptyHistory, originalFetch } from "./route-test-fixtures";
import createAppRouter from "./router";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(createAppRouter.name, () => {
	it(
		"opens the stopped step from Runs in the same workspace",
		opensTheStoppedStepFromRunsInTheSameWorkspace,
	);

	it(
		"opens a stage judge's evidence item at its source route",
		opensAStageJudgeSEvidenceItemAtItsSourceRoute,
	);

	it(
		"opens a final judge's evidence item at its source route",
		opensAFinalJudgeSEvidenceItemAtItsSourceRoute,
	);
});

async function opensTheStoppedStepFromRunsInTheSameWorkspace(): Promise<void> {
	const runHistory = new NamedHistoryBuilder({ rows: [stoppedRow()] }).build();
	renderAppWithStub("/", runHistoryReplies(runHistory));
	const link = await screen.findByRole("link", { name: /^build/u });
	const href = link.getAttribute("href") ?? "";
	expect(href).toBe(`/runs/${RUN}/stages/build`);
	cleanup();

	renderRunDetail(
		new Map<string, unknown>([
			[
				`/api/runs/${RUN}/stages/build/history`,
				{
					...emptyHistory("audit-log", "unused"),
					attempt: {
						caseId: "audit-log",
						corpusFiles: [],
						error: "build stage graded C; minimum grade is B",
						kind: "stopped-stage",
						model: "sonnet",
						run: RUN,
						stage: "build",
					},
					evidence: {
						reasons: ["this stage stopped before recording a transcript"],
						state: "unavailable",
					},
				},
			],
		]),
		[],
		href,
	);

	expect(
		await screen.findByText("build stage graded C; minimum grade is B"),
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Context & cost" }),
	).toHaveAttribute("aria-pressed", "true");
}

async function opensAStageJudgeSEvidenceItemAtItsSourceRoute(): Promise<void> {
	const run = "2026-09-27T00-00-00.000Z";
	renderAppWithStub(
		`/runs/${run}/stages/build/evidence/requirements/scope/0`,
		new Map<string, unknown>([
			[
				`/api/runs/${run}/stages/build/evidence/requirements/scope/0`,
				{
					claim: "the stage claim",
					path: "src/app.ts",
					record: `.benchmark-runs/${run}.build.json`,
					source: "diff",
					view: { kind: "absent" },
				},
			],
		]),
	);

	expect(await screen.findByText("the stage claim")).toBeInTheDocument();
}

async function opensAFinalJudgeSEvidenceItemAtItsSourceRoute(): Promise<void> {
	const run = "2026-09-27T00-00-00.000Z";
	renderAppWithStub(
		`/runs/${run}/final/evidence/tests/1`,
		new Map<string, unknown>([
			[
				`/api/runs/${run}/final/evidence/tests/1`,
				{
					claim: "the final claim",
					path: "src/app.ts",
					record: `.benchmark-runs/${run}.json`,
					source: "diff",
					view: { kind: "before-quoted-spans" },
				},
			],
		]),
	);

	expect(await screen.findByText("the final claim")).toBeInTheDocument();
}
