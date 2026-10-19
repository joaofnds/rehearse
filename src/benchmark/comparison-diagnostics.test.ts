import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { planComparison } from "./compare-attempts";
import type { RecordedComparisonBaseline } from "./comparison-baseline-record";
import {
	comparisonBaselineRecordFile,
	readComparisonBaselineRecord,
} from "./comparison-baseline-record";
import { RefusedPreconditionError } from "./exit-codes";
import type { JsonValue } from "./json-value";
import { confirmationGroupPaths } from "./run-layout";

const ROOTS_DRAIN_START_INDEX = 0;

interface BaselineDiagnostic {
	readonly expected: RecordedComparisonBaseline;
	readonly name: string;
	readonly record: JsonValue;
}

// These raw diagnostic bytes were captured from the public readers at d020bf3a.
const BASELINE_DIAGNOSTICS: readonly BaselineDiagnostic[] = [
	{
		expected: {
			kind: "unreadable",
			reason:
				'baseline.json is not a baseline record: [\n  {\n    "code": "invalid_value",\n    "values": [\n      "derived",\n      "armA"\n    ],\n    "path": [\n      "kind"\n    ],\n    "message": "Invalid option: expected one of \\"derived\\"|\\"armA\\""\n  },\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "skillUnderTest"\n    ],\n    "message": "Invalid input: expected string, received undefined"\n  },\n  {\n    "expected": "object",\n    "code": "invalid_type",\n    "path": [\n      "arms"\n    ],\n    "message": "Invalid input: expected object, received undefined"\n  },\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "controlCorpus"\n    ],\n    "message": "Invalid input: expected string, received undefined"\n  }\n]',
		},
		name: "prioritizes current baseline identity before its arms and corpus",
		record: {
			schemaVersion: 3,
		},
	},
	{
		expected: {
			kind: "unreadable",
			reason:
				'baseline.json is not a baseline record: [\n  {\n    "code": "invalid_value",\n    "values": [\n      "derived",\n      "armA"\n    ],\n    "path": [\n      "kind"\n    ],\n    "message": "Invalid option: expected one of \\"derived\\"|\\"armA\\""\n  },\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "skillUnderTest"\n    ],\n    "message": "Invalid input: expected string, received number"\n  },\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "arms",\n      "baseline"\n    ],\n    "message": "Invalid input: expected string, received number"\n  },\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "arms",\n      "candidate"\n    ],\n    "message": "Invalid input: expected string, received number"\n  },\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "arms",\n      "control"\n    ],\n    "message": "Invalid input: expected string, received number"\n  },\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "baselineCorpus"\n    ],\n    "message": "Invalid input: expected string, received number"\n  }\n]',
		},
		name: "preserves legacy baseline identity and arm diagnostics",
		record: {
			arms: {
				baseline: 7,
				candidate: 7,
				control: 7,
			},
			baselineCorpus: 7,
			schemaVersion: 1,
			skillUnderTest: 7,
		},
	},
];

const GROUP_DIAGNOSTICS = [
	{
		expected:
			'group malformed is not a confirmation group record this comparison can read: [\n  {\n    "code": "invalid_value",\n    "values": [\n      1\n    ],\n    "path": [\n      "schemaVersion"\n    ],\n    "message": "Invalid input: expected 1"\n  },\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "groupId"\n    ],\n    "message": "Invalid input: expected string, received undefined"\n  },\n  {\n    "code": "invalid_value",\n    "values": [\n      "stage",\n      "pipeline",\n      "session"\n    ],\n    "path": [\n      "mode"\n    ],\n    "message": "Invalid option: expected one of \\"stage\\"|\\"pipeline\\"|\\"session\\""\n  },\n  {\n    "expected": "number",\n    "code": "invalid_type",\n    "path": [\n      "reps"\n    ],\n    "message": "Invalid input: expected number, received undefined"\n  },\n  {\n    "expected": "array",\n    "code": "invalid_type",\n    "path": [\n      "declaredStages"\n    ],\n    "message": "Invalid input: expected array, received undefined"\n  },\n  {\n    "expected": "object",\n    "code": "invalid_type",\n    "path": [\n      "inputs"\n    ],\n    "message": "Invalid input: expected object, received undefined"\n  },\n  {\n    "expected": "object",\n    "code": "invalid_type",\n    "path": [\n      "projectedCost"\n    ],\n    "message": "Invalid input: expected object, received undefined"\n  },\n  {\n    "expected": "object",\n    "code": "invalid_type",\n    "path": [\n      "approval"\n    ],\n    "message": "Invalid input: expected object, received undefined"\n  },\n  {\n    "expected": "array",\n    "code": "invalid_type",\n    "path": [\n      "repRecords"\n    ],\n    "message": "Invalid input: expected array, received undefined"\n  },\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "reportFile"\n    ],\n    "message": "Invalid input: expected string, received undefined"\n  },\n  {\n    "expected": "number",\n    "code": "invalid_type",\n    "path": [\n      "makespanMs"\n    ],\n    "message": "Invalid input: expected number, received undefined"\n  }\n]',
		name: "prioritizes group identity before inputs and approval",
		record: {},
	},
	{
		expected:
			'group malformed is not a confirmation group record this comparison can read: [\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "inputs",\n      "lineage",\n      "lineage"\n    ],\n    "message": "Invalid input: expected string, received number"\n  },\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "inputs",\n      "lineage",\n      "targetSha"\n    ],\n    "message": "Invalid input: expected string, received number"\n  },\n  {\n    "code": "invalid_value",\n    "values": [\n      "checkpoint",\n      "corpus",\n      "rubric",\n      "pipeline",\n      "instructions",\n      "task",\n      "product-brief"\n    ],\n    "path": [\n      "inputs",\n      "files",\n      0,\n      "kind"\n    ],\n    "message": "Invalid option: expected one of \\"checkpoint\\"|\\"corpus\\"|\\"rubric\\"|\\"pipeline\\"|\\"instructions\\"|\\"task\\"|\\"product-brief\\""\n  },\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "inputs",\n      "files",\n      0,\n      "path"\n    ],\n    "message": "Invalid input: expected string, received number"\n  },\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "inputs",\n      "files",\n      0,\n      "sha256"\n    ],\n    "message": "Invalid input: expected string, received number"\n  },\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "inputs",\n      "model"\n    ],\n    "message": "Invalid input: expected string, received number"\n  },\n  {\n    "code": "invalid_value",\n    "values": [\n      "low",\n      "medium",\n      "high",\n      "xhigh",\n      "max"\n    ],\n    "path": [\n      "inputs",\n      "effort"\n    ],\n    "message": "Invalid option: expected one of \\"low\\"|\\"medium\\"|\\"high\\"|\\"xhigh\\"|\\"max\\""\n  },\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "inputs",\n      "judgeModel"\n    ],\n    "message": "Invalid input: expected string, received number"\n  },\n  {\n    "code": "invalid_value",\n    "values": [\n      "low",\n      "medium",\n      "high",\n      "xhigh",\n      "max"\n    ],\n    "path": [\n      "inputs",\n      "judgeEffort"\n    ],\n    "message": "Invalid option: expected one of \\"low\\"|\\"medium\\"|\\"high\\"|\\"xhigh\\"|\\"max\\""\n  },\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "inputs",\n      "pipelinePath"\n    ],\n    "message": "Invalid input: expected string, received number"\n  },\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "inputs",\n      "corpusVersion",\n      "digest"\n    ],\n    "message": "Invalid input: expected string, received number"\n  },\n  {\n    "expected": "number",\n    "code": "invalid_type",\n    "path": [\n      "projectedCost",\n      "reps"\n    ],\n    "message": "Invalid input: expected number, received string"\n  },\n  {\n    "code": "invalid_value",\n    "values": [\n      "interactive",\n      "yes",\n      "browser"\n    ],\n    "path": [\n      "approval",\n      "method"\n    ],\n    "message": "Invalid option: expected one of \\"interactive\\"|\\"yes\\"|\\"browser\\""\n  },\n  {\n    "code": "invalid_value",\n    "values": [\n      true\n    ],\n    "path": [\n      "approval",\n      "approved"\n    ],\n    "message": "Invalid input: expected true"\n  },\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "repRecords",\n      0,\n      "repId"\n    ],\n    "message": "Invalid input: expected string, received number"\n  },\n  {\n    "expected": "string",\n    "code": "invalid_type",\n    "path": [\n      "repRecords",\n      0,\n      "path"\n    ],\n    "message": "Invalid input: expected string, received number"\n  }\n]',
		name: "preserves priorities inside frozen inputs, costs, approval and rep references",
		record: {
			approval: {
				approved: 7,
				method: 7,
			},
			declaredStages: ["shape"],
			groupId: "malformed",
			inputs: {
				corpusVersion: {
					digest: 7,
					kind: "version",
				},
				effort: 7,
				files: [
					{
						kind: 7,
						path: 7,
						sha256: 7,
					},
				],
				judgeEffort: 7,
				judgeModel: 7,
				lineage: {
					kind: "CHECKPOINT",
					lineage: 7,
					targetSha: 7,
				},
				model: 7,
				pipelinePath: 7,
				sessionBudgetUsd: 7,
				spendCeilingUsd: 7,
			},
			makespanMs: 0,
			mode: "stage",
			projectedCost: {
				perRepMaximumUsd: 7,
				reps: "invalid",
				totalMaximumUsd: 7,
			},
			repRecords: [
				{
					ordinal: 7,
					path: 7,
					repId: 7,
				},
			],
			reportFile: "report.md",
			reps: 2,
			schemaVersion: 1,
		},
	},
	{
		expected:
			'group malformed is not a confirmation group record this comparison can read: [\n  {\n    "origin": "number",\n    "code": "too_small",\n    "minimum": 2,\n    "inclusive": true,\n    "path": [\n      "reps"\n    ],\n    "message": "Too small: expected number to be >=2"\n  },\n  {\n    "origin": "string",\n    "code": "too_small",\n    "minimum": 1,\n    "inclusive": true,\n    "path": [\n      "inputs",\n      "model"\n    ],\n    "message": "Too small: expected string to have >=1 characters"\n  },\n  {\n    "origin": "string",\n    "code": "too_small",\n    "minimum": 1,\n    "inclusive": true,\n    "path": [\n      "reportFile"\n    ],\n    "message": "Too small: expected string to have >=1 characters"\n  },\n  {\n    "origin": "string",\n    "code": "invalid_format",\n    "format": "datetime",\n    "pattern": "/^(?:(?:\\\\d\\\\d[2468][048]|\\\\d\\\\d[13579][26]|\\\\d\\\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\\\d|30)|(?:02)-(?:0[1-9]|1\\\\d|2[0-8])))T(?:(?:[01]\\\\d|2[0-3]):[0-5]\\\\d(?::[0-5]\\\\d(?:\\\\.\\\\d+)?)?(?:Z))$/",\n    "path": [\n      "startedAt"\n    ],\n    "message": "Invalid ISO datetime"\n  },\n  {\n    "code": "custom",\n    "path": [\n      "startedAt"\n    ],\n    "message": "Expected an instant to the second"\n  },\n  {\n    "code": "custom",\n    "message": "Group must reference every requested rep exactly once",\n    "path": [\n      "repRecords"\n    ]\n  },\n  {\n    "code": "custom",\n    "message": "Projected cost rep count must match the group",\n    "path": [\n      "projectedCost",\n      "reps"\n    ]\n  }\n]',
		name: "reports field failures before group relationship failures",
		record: {
			approval: {
				approved: true,
				method: "yes",
			},
			declaredStages: ["shape"],
			groupId: "malformed",
			inputs: {
				files: [
					{
						kind: "pipeline",
						path: "pipeline.json",
						sha256:
							"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					},
				],
				judgeModel: "sonnet",
				lineage: {
					kind: "CHECKPOINT",
					lineage: "lineage",
					targetSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				},
				model: "",
				pipelinePath: "pipeline.json",
				sessionBudgetUsd: 7,
			},
			makespanMs: 0,
			mode: "stage",
			projectedCost: {
				perRepMaximumUsd: 1,
				reps: 2,
				totalMaximumUsd: 2,
			},
			repRecords: [],
			reportFile: "",
			reps: 1,
			schemaVersion: 1,
			startedAt: "bad",
		},
	},
];

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(ROOTS_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
});

async function temporaryDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-comparison-diagnostic-"));
	roots.push(root);
	return root;
}

async function refusalOf(attempt: Promise<unknown>): Promise<string> {
	try {
		await attempt;
	} catch (error) {
		if (error instanceof RefusedPreconditionError) {
			return error.message;
		}
		throw error;
	}
	throw new Error("Expected the malformed group to be refused");
}

describe(readComparisonBaselineRecord.name, () => {
	it.each([...BASELINE_DIAGNOSTICS])("$name", async ({ expected, record }) => {
		const directory = await temporaryDirectory();
		await Bun.write(
			comparisonBaselineRecordFile(directory),
			JSON.stringify(record),
		);

		const recorded = await readComparisonBaselineRecord(directory);

		expect(recorded).toEqual(expected);
	});
});

describe(planComparison.name, () => {
	it.each(GROUP_DIAGNOSTICS)("$name", async ({ expected, record }) => {
		const directory = await temporaryDirectory();
		await Bun.write(
			confirmationGroupPaths(directory, "malformed").groupFile,
			JSON.stringify(record),
		);

		const refusal = await refusalOf(
			planComparison({
				armA: "malformed",
				armB: "unused",
				runsDirectory: directory,
			}),
		);

		expect(refusal).toBe(expected);
	});
});
