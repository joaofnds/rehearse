import { fireEvent, screen, within } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import AnalysisReadingBuilder from "#client/test-support/analysis-reading-test-builder";
import { renderAppWithStub } from "#client/test-support/render-app";
import {
	ANALYSES,
	CORPUS,
	RUN,
	RunRecordBuilder,
	RunRecordStageBuilder,
	renderRunDetail,
	stoppedAtBuild,
} from "#client/test-support/run-detail";
import type { RunRecord } from "#server/run-record";
import { INTERRUPTED_REASON } from "#server/run-record";
import type { StageJudge } from "#server/stage-judge";
import type { StageSession } from "#server/stage-session";

const ENDED: RunRecord["finalOutcome"] = {
	reason: INTERRUPTED_REASON,
	stage: "shape",
	status: "NOT_REACHED",
};

const originalFetch = globalThis.fetch;

const LEDGER = `/runs/${RUN}?layout=ledger`;

const FIRST_STEP_SESSION = `/api/runs/${RUN}/stages/shape/session`;

const STOPPED_STEP_SESSION = `/api/runs/${RUN}/stages/build/session`;

const STOPPED_STEP_JUDGE = `/api/runs/${RUN}/stages/build/judge`;

async function openEvidence(session: StageSession): Promise<HTMLElement> {
	renderLedger(
		new Map<string, unknown>([
			[STOPPED_STEP_JUDGE, judged()],
			[STOPPED_STEP_SESSION, session],
		]),
	);
	const stoppedStep = await ledgerCard("Step 2 · build");
	const card = stoppedStep;

	fireEvent.click(await within(card).findByRole("button", { name: "2 cited" }));

	return within(card).getByRole("region", { name: "Cited evidence" });
}

/** The run, ended or in flight, with shape's record awaiting its judge. */
function renderAwaitingFirstStep(
	status: string,
	finalOutcome: RunRecord["finalOutcome"],
): void {
	const record = stoppedAtBuild();
	const fetchReplies = new Map<string, unknown>([
		[
			"/api/runs",
			new NamedHistoryBuilder({
				rows: [
					new PipelineRunRowBuilder({ run: RUN, status })
						.withExecutionProgress({ stage: "shape" })
						.build(),
				],
			}).build(),
		],
		[
			`/api/runs/${RUN}`,
			{
				...record,
				finalOutcome,
				stages: record.stages.map((stage) =>
					new RunRecordStageBuilder({
						stage: stage.stage,
						status: stage.stage === "shape" ? "awaiting-judgment" : "no-record",
					}).build(),
				),
				status: { state: "available", status },
			},
		],
		[`/api/runs/${RUN}/stages/shape/judge`, { state: "waiting" }],
		[ANALYSES, new AnalysisReadingBuilder().withoutAnalysis().build()],
	]);
	renderAppWithStub(LEDGER, fetchReplies);
}

/** The run ended or in flight at build, with shape's record alone. */
function renderReachedFirstStep(
	status: string,
	finalOutcome: RunRecord["finalOutcome"],
): void {
	const record = stoppedAtBuild();
	const fetchReplies = new Map<string, unknown>([
		[
			"/api/runs",
			new NamedHistoryBuilder({
				rows: [
					new PipelineRunRowBuilder({
						corpusVersion: { digest: CORPUS, kind: "version" },
						run: RUN,
						status,
					})
						.withExecutionProgress({ stage: "build" })
						.build(),
				],
			}).build(),
		],
		[
			`/api/runs/${RUN}`,
			{
				...record,
				finalOutcome,
				stages: record.stages.map((stage) =>
					stage.stage === "shape"
						? stage
						: new RunRecordStageBuilder({ stage: stage.stage }).build(),
				),
				status: { state: "available", status },
			},
		],
		[ANALYSES, new AnalysisReadingBuilder().withoutAnalysis().build()],
	]);
	renderAppWithStub(LEDGER, fetchReplies);
}

async function unreachedStages(): Promise<HTMLElement> {
	return await screen.findByRole("list", {
		name: "Stages without a record",
	});
}

/** The stopped run with shape's figures and both recorded stages' corpus recorded. */
function stoppedWithFigures(): RunRecord {
	const record = stoppedAtBuild();
	const corpus = { digest: CORPUS, kind: "version" } as const;

	return new RunRecordBuilder(record)
		.withStage({
			checkpointShortId: { shortId: "c-0147-1", state: "available" },
			corpusVersion: corpus,
			judgeCost: { state: "available", usd: 0.04 },
			sessionCost: { state: "available", usd: 0.3 },
			stage: "shape",
			wallTime: { ms: 82_000, state: "available" },
		})
		.withStage({ corpusVersion: corpus, stage: "build" })
		.build();
}

/** The stopped run with build stopped by its judge's verdict at a letter that reaches the minimum. */
function stoppedByVerdict(): RunRecord {
	return new RunRecordBuilder(stoppedWithFigures())
		.withStage({
			grade: {
				letter: "B",
				reachesMinimum: true,
				state: "available",
				verdict: "STOP",
			},
			stage: "build",
		})
		.build();
}

function judged(): StageJudge {
	return {
		dimensions: [
			{
				evidence: [
					{
						claim: "Edits files outside the declared scope",
						path: "src/a.ts",
						source: "diff",
					},
				],
				grade: "C",
				id: "scope-discipline",
			},
			{ evidence: [], grade: "B", id: "test-quality" },
		],
		hardBlockers: [
			{
				evidence: [
					{
						claim: "The agent chose a scope without asking",
						path: "transcript",
						place: "exchange 3 message, characters 0-25",
						quote: "I'll take the small scope",
						source: "transcript",
					},
				],
				id: "scope-declared-before-edit",
				status: "FAIL",
			},
			{ evidence: [], id: "no-secrets-in-diff", status: "PASS" },
		],
		state: "judged",
	};
}

function renderLedger(
	routes: ReadonlyMap<string, unknown> = new Map(),
	record: RunRecord = stoppedWithFigures(),
): void {
	renderRunDetail(
		new Map<string, unknown>([[`/api/runs/${RUN}`, record], ...routes]),
		[],
		LEDGER,
	);
}

async function ledgerCards(): Promise<readonly HTMLElement[]> {
	const ledger = await screen.findByRole("region", { name: "Record ledger" });

	return within(ledger).getAllByRole("article");
}

/** The ledger card a step's name labels, failing when it is not drawn. */
async function ledgerCard(step: string): Promise<HTMLElement> {
	const ledger = await screen.findByRole("region", { name: "Record ledger" });

	return await within(ledger).findByRole("article", { name: step });
}

/** The footer of the ledger card a step's name labels. */
async function ledgerFooter(step: string): Promise<HTMLElement> {
	const card = await ledgerCard(step);
	const footer = card.querySelector("footer");
	if (!(footer instanceof HTMLElement)) {
		throw new Error(`${step} has no footer`);
	}

	return footer;
}

export {
	ENDED,
	FIRST_STEP_SESSION,
	STOPPED_STEP_JUDGE,
	judged,
	ledgerCard,
	ledgerCards,
	ledgerFooter,
	openEvidence,
	originalFetch,
	renderAwaitingFirstStep,
	renderLedger,
	renderReachedFirstStep,
	stoppedByVerdict,
	stoppedWithFigures,
	unreachedStages,
};
