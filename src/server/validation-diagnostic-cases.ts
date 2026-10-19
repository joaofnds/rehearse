import type { JsonValue } from "#benchmark/json-value";

interface DiagnosticCase {
	readonly app: "calibration" | "launch";
	readonly body: JsonValue;
	readonly expected: { readonly error: string };
	readonly method: "POST" | "PUT";
	readonly name: string;
	readonly path: string;
	readonly status: number;
}

// These response bodies were captured from the routes at d020bf3a.
const DIAGNOSTIC_CASES: readonly DiagnosticCase[] = [
	{
		app: "launch",
		body: {},
		expected: {
			error:
				"✖ Invalid input: expected string, received undefined\n  → at id\n✖ Invalid input: expected string, received undefined\n  → at title\n✖ Invalid input: expected string, received undefined\n  → at targetPath\n✖ Invalid input: expected object, received undefined\n  → at bundle",
		},
		method: "POST",
		name: "prioritizes import identity before the missing bundle",
		path: "/api/cases/import",
		status: 400,
	},
	{
		app: "launch",
		body: {},
		expected: {
			error:
				"✖ Invalid input: expected string, received undefined\n  → at id\n✖ Invalid input: expected string, received undefined\n  → at title\n✖ Invalid input: expected string, received undefined\n  → at targetPath\n✖ Invalid input: expected string, received undefined\n  → at task\n✖ Invalid input: expected string, received undefined\n  → at productBrief\n✖ Invalid input: expected string, received undefined\n  → at from",
		},
		method: "POST",
		name: "prioritizes pipeline identity and task before the source",
		path: "/api/cases/pipeline",
		status: 400,
	},
	{
		app: "launch",
		body: {
			attempts: 7,
			caseId: 7,
			kind: "case",
		},
		expected: {
			error:
				"✖ Invalid input: expected string, received number\n  → at caseId\n✖ Invalid input\n  → at attempts",
		},
		method: "POST",
		name: "prioritizes the case identity before its attempt count",
		path: "/api/launches",
		status: 400,
	},
	{
		app: "launch",
		body: {
			attempts: 7,
			kind: "replay",
			run: 7,
			stage: 7,
		},
		expected: {
			error:
				"✖ Invalid input: expected string, received number\n  → at run\n✖ Invalid input: expected string, received number\n  → at stage\n✖ Invalid input\n  → at attempts",
		},
		method: "POST",
		name: "prioritizes replay identity before its attempt count",
		path: "/api/launches",
		status: 400,
	},
	{
		app: "launch",
		body: {
			attempts: 0,
			comparison: 7,
			kind: "extension",
			statedUsd: -1,
		},
		expected: {
			error:
				"✖ Invalid input: expected string, received number\n  → at comparison\n✖ Too small: expected number to be >0\n  → at attempts\n✖ Too small: expected number to be >=0\n  → at statedUsd",
		},
		method: "POST",
		name: "prioritizes extension identity before its spend",
		path: "/api/launches",
		status: 400,
	},
	{
		app: "launch",
		body: {},
		expected: {
			error:
				"✖ Invalid input: expected string, received undefined\n  → at path\n✖ Invalid input: expected string, received undefined\n  → at text\n✖ Invalid input: expected string, received undefined\n  → at startsFrom",
		},
		method: "POST",
		name: "prioritizes corpus review text before its starting version",
		path: "/api/corpus/edits/review",
		status: 400,
	},
	{
		app: "launch",
		body: {},
		expected: {
			error:
				"✖ Invalid input: expected string, received undefined\n  → at path\n✖ Invalid input: expected string, received undefined\n  → at text\n✖ Invalid input: expected string, received undefined\n  → at startsFrom",
		},
		method: "POST",
		name: "prioritizes corpus application text before its starting version",
		path: "/api/corpus/edits/apply",
		status: 400,
	},
	{
		app: "launch",
		body: {},
		expected: {
			error:
				'✖ Invalid input: expected string, received undefined\n  → at id\n✖ Invalid input: expected "session"\n  → at kind\n✖ Invalid input: expected string, received undefined\n  → at title\n✖ Invalid input: expected string, received undefined\n  → at prompt\n✖ Invalid input: expected array, received undefined\n  → at tools\n✖ Invalid input: expected array, received undefined\n  → at corpusFiles\n✖ Invalid input: expected array, received undefined\n  → at checks\n✖ Invalid input: expected string, received undefined\n  → at model',
		},
		method: "POST",
		name: "prioritizes the declaration identity and prompt before its model",
		path: "/api/cases",
		status: 400,
	},
	{
		app: "launch",
		body: {
			stages: [
				{
					artifact: 7,
					kind: "planning",
					name: 7,
					requiresAcceptanceCriteria: 7,
					rubric: 7,
					skill: 7,
				},
				{
					kind: "delivery",
					name: 7,
					rubric: 7,
					skill: 7,
				},
			],
		},
		expected: {
			error:
				"✖ Invalid input: expected string, received number\n  → at stages[0].name\n✖ Invalid input: expected string, received number\n  → at stages[0].skill\n✖ Invalid input: expected string, received number\n  → at stages[0].artifact\n✖ Invalid input: expected string, received number\n  → at stages[0].rubric\n✖ Invalid input: expected boolean, received number\n  → at stages[0].requiresAcceptanceCriteria\n✖ Invalid input: expected string, received number\n  → at stages[1].name\n✖ Invalid input: expected string, received number\n  → at stages[1].skill\n✖ Invalid input: expected string, received number\n  → at stages[1].rubric",
		},
		method: "PUT",
		name: "preserves field priority within each ordered pipeline stage",
		path: "/api/cases/invalid/steps",
		status: 400,
	},
	{
		app: "launch",
		body: {
			bundle: {},
		},
		expected: {
			error:
				'✖ Invalid input: expected "rehearse-task-bundle"\n  → at bundle.format\n✖ Invalid input: expected 1\n  → at bundle.version\n✖ Invalid input: expected string, received undefined\n  → at bundle.caseId\n✖ Invalid input: expected string, received undefined\n  → at bundle.title\n✖ Invalid input: expected object, received undefined\n  → at bundle.target\n✖ Invalid input: expected string, received undefined\n  → at bundle.task\n✖ Invalid input: expected string, received undefined\n  → at bundle.productBrief\n✖ Invalid input: expected string, received undefined\n  → at bundle.finalRubric\n✖ Invalid input: expected object, received undefined\n  → at bundle.pipeline\n✖ Invalid input: expected record, received undefined\n  → at bundle.rubrics',
		},
		method: "POST",
		name: "prioritizes the nested bundle version and identity before its content",
		path: "/api/task-bundles/preview",
		status: 400,
	},
	{
		app: "launch",
		body: {
			bundle: {
				caseId: "invalid",
				finalRubric: "rubric",
				format: "rehearse-task-bundle",
				pipeline: {
					stages: [
						{
							artifact: 7,
							kind: "planning",
							name: 7,
							rubric: "shape.json",
							skill: 7,
						},
					],
					statuses: 7,
					target: {
						checks: 7,
						integrityFiles: 7,
						services: [
							{
								exports: 7,
								image: 7,
								name: 7,
								port: 7,
								ready: 7,
							},
						],
					},
				},
				productBrief: "brief",
				rubrics: {},
				target: {
					path: "target",
				},
				task: "task",
				title: "title",
				version: 1,
			},
		},
		expected: {
			error:
				"✖ Invalid input: expected array, received number\n  → at bundle.pipeline.statuses\n✖ Invalid input: expected array, received number\n  → at bundle.pipeline.target.checks\n✖ Invalid input: expected array, received number\n  → at bundle.pipeline.target.integrityFiles\n✖ Invalid input: expected string, received number\n  → at bundle.pipeline.stages[0].name\n✖ Invalid input: expected string, received number\n  → at bundle.pipeline.stages[0].skill\n✖ Invalid input: expected string, received number\n  → at bundle.pipeline.stages[0].artifact\n✖ Invalid input: expected string, received number\n  → at bundle.pipeline.target.services[0].name\n✖ Invalid input: expected string, received number\n  → at bundle.pipeline.target.services[0].image\n✖ Invalid input: expected array, received number\n  → at bundle.pipeline.target.services[0].ready\n✖ Invalid input: expected record, received number\n  → at bundle.pipeline.target.services[0].exports",
		},
		method: "POST",
		name: "preserves priority across nested bundle pipeline diagnostics",
		path: "/api/task-bundles/preview",
		status: 400,
	},
	{
		app: "calibration",
		body: {},
		expected: {
			error:
				"✖ Invalid input: expected array, received undefined\n  → at hardBlockers\n✖ Invalid input: expected array, received undefined\n  → at requirements\n✖ Invalid input: expected array, received undefined\n  → at dimensions",
		},
		method: "POST",
		name: "prioritizes blocker grades before requirements and dimensions",
		path: "/api/calibration/runs/invalid/stages/shape/grade",
		status: 400,
	},
	{
		app: "calibration",
		body: {
			dimensions: [
				{
					grade: 7,
					id: 7,
				},
				{
					grade: 7,
					id: 7,
				},
			],
			hardBlockers: [
				{
					id: 7,
					status: 7,
				},
			],
			note: 7,
			requirements: [
				{
					id: 7,
					status: 7,
				},
			],
		},
		expected: {
			error:
				'✖ Invalid input: expected string, received number\n  → at note\n✖ Invalid input: expected string, received number\n  → at hardBlockers[0].id\n✖ Invalid option: expected one of "PASS"|"FAIL"\n  → at hardBlockers[0].status\n✖ Invalid input: expected string, received number\n  → at requirements[0].id\n✖ Invalid option: expected one of "PASS"|"FAIL"\n  → at requirements[0].status\n✖ Invalid input: expected string, received number\n  → at dimensions[0].id\n✖ Invalid option: expected one of "A"|"B"|"C"|"D"|"F"\n  → at dimensions[0].grade\n✖ Invalid input: expected string, received number\n  → at dimensions[1].id\n✖ Invalid option: expected one of "A"|"B"|"C"|"D"|"F"\n  → at dimensions[1].grade',
		},
		method: "POST",
		name: "preserves priority inside grade arrays and between criterion groups",
		path: "/api/calibration/runs/invalid/stages/shape/grade",
		status: 400,
	},
];

export { DIAGNOSTIC_CASES as default };
export type { DiagnosticCase };
