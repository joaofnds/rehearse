import { fireEvent, screen, within } from "@testing-library/react";

import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";
import type { StageSession } from "#server/stage-session";

import { RUN, renderMonitor, selectStage } from "./monitor-test-fixtures";

const BUILD_SESSION = `/api/runs/${RUN}/stages/build/session`;

async function rowCells(): Promise<readonly (readonly string[])[]> {
	const transcript = await within(await sessionPane()).findByRole("list", {
		name: "Transcript",
	});

	return within(transcript)
		.getAllByRole("listitem")
		.map((row) => [...row.children].map((cell) => cell.textContent));
}

const RUNNING_SESSION: StageSession = {
	latestToolCall: "Bash  pnpm test auth",
	lineCount: 1284,
	lines: [
		{ kind: "tool", line: 1278, text: "Bash  pnpm test auth" },
		{ kind: "result", line: 1281, text: "44 passed, 0 failed" },
		{ kind: "assistant", line: 1284, text: "Tests pass." },
	],
	state: "running",
};

function renderSession(session: StageSession): void {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ stage: "build" })
			.build(),
		new Map<string, StageSession>([[BUILD_SESSION, session]]),
	);
}

async function sessionBody(): Promise<HTMLElement> {
	const transcript = await within(await sessionPane()).findByRole("list", {
		name: "Transcript",
	});
	const body = transcript.parentElement;
	if (body === null) {
		throw new Error("the transcript sits in no scrolling body");
	}

	return body;
}

const PLAN_SESSION = `/api/runs/${RUN}/stages/plan/session`;

const TRANSCRIPT_PATH = `.benchmark-runs/${RUN}.checkpoints/plan/transcript.jsonl`;

function closedBodies(session: StageSession): ReadonlyMap<string, unknown> {
	return new Map<string, unknown>([
		[
			`/api/runs/${RUN}`,
			new RunRecordBuilder({
				run: RUN,
				stages: [
					new RunRecordStageBuilder({
						sessionCost: { state: "available", usd: 1.12 },

						stage: "plan",

						status: "graded",

						wallTime: { ms: 242_000, state: "available" },
					}).build(),
					new RunRecordStageBuilder().build(),
				],
			}).build(),
		],
		[PLAN_SESSION, session],
	]);
}

function renderClosed(session: StageSession): void {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ stage: "build" })
			.build(),
		closedBodies(session),
	);
}

async function selectPlan(): Promise<void> {
	await selectStage("plan");
}

const REVIEW_SESSION = `/api/runs/${RUN}/stages/review/session`;

function queuedBodies(session: StageSession): ReadonlyMap<string, unknown> {
	return new Map<string, unknown>([
		[
			`/api/runs/${RUN}`,
			new RunRecordBuilder({
				run: RUN,
				stages: [
					new RunRecordStageBuilder().build(),
					new RunRecordStageBuilder({ stage: "review" }).build(),
				],
			}).build(),
		],
		[REVIEW_SESSION, session],
	]);
}

async function selectReview(): Promise<void> {
	await selectStage("review");
}

async function sessionPane(): Promise<HTMLElement> {
	return await screen.findByRole("region", {
		name: "Live agent session",
	});
}

function pressKey(key: string): void {
	fireEvent.keyDown(document.body, { key });
}

const CITED_SESSION: StageSession = {
	lineCount: 1284,
	spans: [
		{
			claim: "The agent asked before choosing a scope",
			exchange: 1,
			field: "message",
			index: 0,
			item: "HB-1",
			quote: "Which scope?",
			section: "hardBlockers",
		},
		{
			claim: "The owner answered with the scope",
			exchange: 1,
			field: "productOwnerAnswer",
			index: 0,
			item: "R1",
			quote: "Use the small scope",
			section: "requirements",
		},
		{
			claim: "The owner chose the small scope",
			index: 1,
			item: "R1",
			section: "requirements",
		},
	],
	state: "closed",
	transcriptPath: TRANSCRIPT_PATH,
};

export {
	BUILD_SESSION,
	CITED_SESSION,
	RUNNING_SESSION,
	TRANSCRIPT_PATH,
	closedBodies,
	pressKey,
	queuedBodies,
	renderClosed,
	renderSession,
	rowCells,
	selectPlan,
	selectReview,
	sessionBody,
	sessionPane,
};
