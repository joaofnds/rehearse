import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import { FakeServer } from "#client/test-support/fetch-stub";
import {
	SHELL_BASELINE,
	renderAppAt,
	renderAppWithStub,
} from "#client/test-support/render-app";
import {
	RUN,
	RunRecordBuilder,
	RunRecordStageBuilder,
	renderRunDetail,
	stoppedAtBuild,
} from "#client/test-support/run-detail";

import {
	CONTEXT_BASE_RECORD,
	CONTEXT_BUILD_STAGE,
	FIRST_RECORDED_STAGE_INDEX,
	originalFetch,
} from "./workspace-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the run workspace", () => {
	it.each(["activity", "context"])(
		"uses the lightweight listing in %s",
		usesLightweightListing,
	);

	it(
		"opens the selected step's Judge review",
		opensTheSelectedStepSJudgeReview,
	);

	it(
		"keeps provenance and incomplete token and cost readings visible in Context",
		keepsProvenanceAndIncompleteTokenAndCostReadingsVisibleInContext,
	);

	it(
		"carries the selected source and actual skill into instruction testing",
		carriesTheSelectedSourceAndActualSkillIntoInstructionTesting,
	);

	it(
		"opens ended runs on Results and keeps the selected step across all views",
		opensEndedRunsOnResultsAndKeepsTheSelectedStepAcrossAllViews,
	);

	it(
		"opens a running run directly on Activity and keeps the workflow available",
		opensARunningRunDirectlyOnActivityAndKeepsTheWorkflowAvailable,
	);
});

async function opensTheSelectedStepSJudgeReview(): Promise<void> {
	renderRunDetail();
	expect(
		await screen.findByRole("link", { name: "Review this Judge" }),
	).toHaveAttribute("href", `/calibration/runs/${RUN}/stages/build`);
}

async function keepsProvenanceAndIncompleteTokenAndCostReadingsVisibleInContext(): Promise<void> {
	renderRunDetail(
		new Map([
			[
				`/api/runs/${RUN}`,
				{
					...CONTEXT_BASE_RECORD,
					stages: [
						CONTEXT_BASE_RECORD.stages[FIRST_RECORDED_STAGE_INDEX],
						CONTEXT_BUILD_STAGE,
					],
					totals: {
						...CONTEXT_BASE_RECORD.totals,
						cost: {
							missing: [{ part: "build judge", reason: "metrics absent" }],
							parts: [{ part: "build session", usd: 1.2 }],
							state: "available",
							usd: 1.2,
						},
					},
				},
			],
		]),
		[],
		`/runs/${RUN}?view=context&step=build`,
	);

	const setup = await screen.findByRole("region", {
		name: "Run setup & provenance",
	});

	expect(setup).toHaveTextContent("audit-log/r7/s1");
	expect(setup).toHaveTextContent("acme-api @ e91f2a0c");
	expect(setup).toHaveTextContent("claude-opus-4 / high");
	expect(
		within(setup).getByRole("region", { name: "Selected step tokens" }),
	).toHaveTextContent("Missing build judge: usage absent");
	expect(
		within(setup).getByRole("region", { name: "Run cost breakdown" }),
	).toHaveTextContent("Missing build judge: metrics absent");
	expect(setup).toHaveTextContent("$1.20 · partial");
}

async function carriesTheSelectedSourceAndActualSkillIntoInstructionTesting(): Promise<void> {
	const base = new RunRecordBuilder(stoppedAtBuild())
		.withStage({
			readManifest: {
				entries: [
					{
						evidence: "declared",
						half: "corpus",
						path: "skills/build/SKILL.md",
						role: "stage skill",
						sha256: "a".repeat(SHA256_HEX_CHARACTERS),
						state: "unchanged",
					},
				],
				state: "available",
			},
			stage: "build",
		})
		.build();
	const fetchReplies = new Map<string, unknown>([
		[
			"/api/runs",
			new NamedHistoryBuilder({
				rows: [
					{
						...new PipelineRunRowBuilder({ run: RUN, status: "STOPPED:build" })
							.withExecutionProgress()
							.build(),
						replayableStages: ["build"],
					},
				],
			}).build(),
		],
		[`/api/runs/${RUN}`, base],
	]);
	renderRunDetail(fetchReplies);

	const editLink = await screen.findByRole("link", {
		name: "Edit instruction & replay",
	});
	const url = new URL(editLink.getAttribute("href") ?? "", "http://localhost");

	expect(url.pathname).toBe("/corpus");
	expect(Object.fromEntries(url.searchParams)).toEqual({
		file: "skills/build/SKILL.md",
		sourceRun: RUN,
		sourceStep: "build",
	});
}

async function opensEndedRunsOnResultsAndKeepsTheSelectedStepAcrossAllViews(): Promise<void> {
	const router = renderRunDetail(new Map(), [], `/runs/${RUN}?step=shape`);
	expect(
		await screen.findByRole("button", { name: "Results" }),
	).toHaveAttribute("aria-pressed", "true");
	fireEvent.click(screen.getByRole("button", { name: "Activity" }));
	expect(
		await screen.findByRole("region", { name: "Live agent session" }),
	).toHaveTextContent("Step 1 · shape");
	fireEvent.click(screen.getByRole("button", { name: "Context & cost" }));
	await waitFor(() => {
		expect(router.state.location.search).toMatchObject({
			step: "shape",
			view: "context",
		});
	});
	expect(
		await screen.findByRole("heading", {
			name: "Context & cost · saved evidence",
		}),
	).toBeInTheDocument();
	expect(
		screen.getByRole("region", { name: "Run setup & provenance" }),
	).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Results" }));
	expect(
		await screen.findByRole("region", { name: "Step report" }),
	).toHaveTextContent("Step 1 · shape");
}

async function opensARunningRunDirectlyOnActivityAndKeepsTheWorkflowAvailable(): Promise<void> {
	const fetchReplies = new Map<string, unknown>([
		[
			"/api/runs",
			new NamedHistoryBuilder({
				rows: [
					new PipelineRunRowBuilder({ run: RUN })
						.withExecutionProgress({ stage: "build" })
						.build(),
				],
			}).build(),
		],
		[
			`/api/runs/${RUN}`,
			new RunRecordBuilder({
				run: RUN,
				stages: [
					new RunRecordStageBuilder({
						stage: "shape",
						status: "graded",
					}).build(),
					new RunRecordStageBuilder().build(),
				],
			}).build(),
		],
	]);
	renderAppWithStub(`/runs/${RUN}`, fetchReplies);

	expect(
		await screen.findByRole("button", { name: "Activity" }),
	).toHaveAttribute("aria-pressed", "true");
	expect(
		screen.getByRole("region", { name: "Live agent session" }),
	).toHaveTextContent("Step 2 · build");
	expect(
		screen.getByRole("region", { name: "Task graph" }),
	).toBeInTheDocument();
}

async function usesLightweightListing(view: string): Promise<void> {
	const fetchOverrides = new Map([
		...[...SHELL_BASELINE].map(
			([path, body]) => [`GET ${path}`, { body, status: 200 }] as const,
		),
		[
			"GET /api/run-listing",
			{
				body: new NamedHistoryBuilder({
					rows: [
						new PipelineRunRowBuilder({ run: RUN, status: "COMPLETE" })
							.withExecutionProgress()
							.build(),
					],
				}).build(),
				status: 200,
			},
		],
		[`GET /api/runs/${RUN}`, { body: stoppedAtBuild(), status: 200 }],
	]);
	const server = new FakeServer(fetchOverrides);
	server.install();
	renderAppAt(`/runs/${RUN}?view=${view}`);
	await screen.findByRole("region", { name: "Task graph" });
	expect(server.sent.some(({ pathname }) => pathname === "/api/runs")).toBe(
		false,
	);
}
