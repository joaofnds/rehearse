import { expect } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import { renderAppWithStub } from "#client/test-support/render-app";
import { RunRecordBuilder } from "#client/test-support/run-detail";
import type { RunRecordStage } from "#server/run-record";

const RUN = "2026-09-30T10-00-00.000Z";

const TASK_CARD = ".boris/backlog/tasks/task-1 - Add-an-audit-log.md";

const PLAN_JUDGE = `/api/runs/${RUN}/stages/plan/judge`;

const PLAN_SESSION = `/api/runs/${RUN}/stages/plan/session`;

const originalFetch = globalThis.fetch;

const SKILL_PATH = ".agents/skills/plan/SKILL.md";

/** A graded stage with every figure its header reads. */
const FINISHED_PLAN = {
	checkpoint: "recorded",
	grade: {
		letter: "B+",
		reachesMinimum: true,
		state: "available",
		verdict: "CONTINUE",
	},
	judgeCost: { state: "available", usd: 0.22 },
	readManifest: {
		entries: [
			{
				evidence: "declared",
				half: "corpus",
				path: SKILL_PATH,
				role: "stage skill",
				sha256: "88b0d2".padEnd(SHA256_HEX_CHARACTERS, "0"),
				state: "unchanged",
			},
		],
		state: "available",
	},
	sessionCost: { state: "available", usd: 1.12 },
	status: "graded",
	wallTime: { ms: 242_000, state: "available" },
} as const satisfies Partial<RunRecordStage>;

function history(): RunHistoryResponse {
	return {
		launches: [],
		rows: [
			new PipelineRunRowBuilder({ run: RUN })
				.withExecutionProgress({ stage: "build" })
				.build(),
		],
		unreadable: [],
	};
}

/** The monitor on one run in flight at build, with the stages and extra bodies given. */
function renderMonitor(
	stages: readonly RunRecordStage[],
	extra: ReadonlyMap<string, unknown> = new Map(),
): void {
	renderAppWithStub(
		"/monitor",
		new Map<string, unknown>([
			["/api/run-listing", history()],
			["/api/runs", history()],
			[`/api/runs/${RUN}`, new RunRecordBuilder({ run: RUN, stages }).build()],
			...extra,
		]),
	);
}

function renderEndedMonitor(stages: readonly RunRecordStage[]): void {
	const completed = {
		...new RunRecordBuilder({ run: RUN, stages }).build(),
		finalOutcome: { status: "JUDGED", verdict: "PASS" },
	};
	const completedHistory: RunHistoryResponse = {
		launches: [],
		rows: [
			{
				...new PipelineRunRowBuilder({ run: RUN, status: "COMPLETED" })
					.withExecutionProgress()
					.build(),
				replayableStages: stages.map(({ stage }) => stage),
			},
		],
		unreadable: [],
	};
	renderAppWithStub(
		`/runs/${RUN}?view=activity`,
		new Map<string, unknown>([
			["/api/run-listing", completedHistory],
			["/api/runs", completedHistory],
			[`/api/runs/${RUN}`, completed],
		]),
	);
}

/** The task graph's node for a stage. */
async function graphNode(stage: string): Promise<HTMLElement> {
	const graph = await screen.findByRole("region", { name: "Task graph" });
	const shown = within(graph)
		.getAllByRole("listitem")
		.find((item) => within(item).queryByText(stage) !== null);
	if (shown === undefined) {
		throw new Error(`the graph draws no node for ${stage}`);
	}

	return shown;
}

async function inOutAction(stage: string): Promise<HTMLElement> {
	fireEvent.click(within(await graphNode(stage)).getByRole("button"));
	await waitFor(() => {
		expect(screen.getByText(/Selected step/u).parentElement).toHaveTextContent(
			stage,
		);
	});
	return screen.getByRole("button", { name: "Inputs & output" });
}

async function openModal(stage: string): Promise<HTMLElement> {
	fireEvent.click(await inOutAction(stage));

	return await screen.findByRole("dialog", { name: new RegExp(stage, "u") });
}

export {
	FINISHED_PLAN,
	graphNode,
	inOutAction,
	openModal,
	originalFetch,
	PLAN_JUDGE,
	PLAN_SESSION,
	renderEndedMonitor,
	renderMonitor,
	RUN,
	SKILL_PATH,
	TASK_CARD,
};
