import { screen } from "@testing-library/react";

import { renderAppWithStub } from "#client/test-support/render-app";

import type { CasesResponse } from "./cases-query";

const originalFetch = globalThis.fetch;

const DIGEST =
	"e73e56621fca244376a085a27f68834c9e15038e7f53966ff1aff9b199891922";

type ListedCase = CasesResponse["cases"][number];

type PipelineCase = Extract<ListedCase, { kind: "pipeline" }>;

type SessionCase = Extract<ListedCase, { kind: "session" }>;

function pipelineCase(overrides: Partial<PipelineCase> = {}): PipelineCase {
	return {
		figures: {
			corpusVersion: DIGEST,
			costPerRun: { costed: 3, lacking: 1, meanUsd: 3.5 },
			counted: 4,
			judged: 3,
			leftOut: 2,
			median: "PASS",
			passed: 2,
			state: "measured",
		},
		finalRubric: "final-rubric.md",
		id: "audit-log",
		kind: "pipeline",
		latestMinimumGrade: { letter: "B", state: "recorded" },
		model: "sonnet",
		pipeline: {
			stages: [
				{ name: "shape", rubric: "cases/audit-log/rubrics/shape.json" },
				{ name: "build", rubric: "cases/audit-log/rubrics/build.json" },
			],
			state: "available",
		},
		target: "../../../nest/template",
		title: "Asynchronous audit log module against the NestJS template",
		...overrides,
	};
}

function sessionCase(overrides: Partial<SessionCase> = {}): SessionCase {
	return {
		checks: ["word-band", "forbidden-text"],
		figures: {
			corpusVersion: DIGEST,
			costPerRun: { costed: 3, lacking: 0, meanUsd: 0.5 },
			counted: 3,
			judged: 3,
			leftOut: 0,
			passed: 2,
			state: "measured",
		},
		id: "brief-reply",
		kind: "session",
		model: "sonnet",
		target: null,
		title: "Reply in the brief style",
		...overrides,
	};
}

interface ServedCases {
	readonly cases: readonly ListedCase[];
	readonly problems?: Partial<Omit<CasesResponse, "cases">> | undefined;
	readonly additional?: ReadonlyMap<string, unknown> | undefined;
}

function renderCasesAt(
	path: string,
	{ cases, problems = {}, additional = new Map() }: ServedCases,
): void {
	const response: CasesResponse = {
		cases: [...cases],
		unreadable: [...(problems.unreadable ?? [])],
		unreadableRecords: [...(problems.unreadableRecords ?? [])],
	};
	renderAppWithStub(
		path,
		new Map<string, unknown>([
			...additional,
			["/api/cases", response],
			[
				"/api/settings",
				{
					setCommand: "rehearse settings --spend-ceiling-usd <USD>",
					spendCeilingUsd: 5,
				},
			],
		]),
	);
}

async function card(id: string): Promise<HTMLElement> {
	return await screen.findByRole("article", { name: id });
}

function workflowCaseResources(): ReadonlyMap<string, unknown> {
	const task = {
		cases: ["audit-log"],
		declaredBy: {
			id: "audit-log",
			target: "../../../nest/template",
			title: "Asynchronous audit log module against the NestJS template",
		},
		figures: { corpusVersion: null, counted: 0, leftOut: 0 },
		path: "cases/audit-log/pipelines/default.json",
		runs: [],
		stageJudges: 2,
		stages: ["shape", "build"],
		targets: ["../../../nest/template"],
		taskJudges: 1,
	};
	return new Map<string, unknown>([
		[
			"/api/cases",
			{
				cases: [pipelineCase(), pipelineCase({ id: "other-case" })],
				unreadable: [],
				unreadableRecords: [],
			},
		],
		[
			"/api/pipelines",
			{
				pipelines: [
					task,
					{
						...task,
						cases: ["other-case"],
						declaredBy: null,
						path: "other.json",
					},
				],
				unreadable: [],
			},
		],
	]);
}

export {
	card,
	DIGEST,
	originalFetch,
	pipelineCase,
	renderCasesAt,
	sessionCase,
	workflowCaseResources,
};
export type { ListedCase, SessionCase };
