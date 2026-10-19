import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import { CASE_ID } from "#benchmark/run-records-test-support";
import {
	PIPELINE_CASE,
	SESSION_CASE,
	clearCaseRoots,
	serving,
} from "#server/cases-test-fixture";
import RECORD_JSON_INDENT_SPACES from "#server/json-record-format";

afterEach(clearCaseRoots);

const SESSION_CASE_ID = "smoke";

describe("GET /api/cases", () => {
	it(
		"omits archived declarations from the browser's case and launch choices",
		verifyOmitsArchivedDeclarationsFromTheBrowserSCaseAnd,
	);
	it(
		"gives a pipeline case its target, its steps with their rubrics, and its final rubric",
		verifyGivesAPipelineCaseItsTargetItsStepsWith,
	);
	it(
		"gives a session case no repository and its declared checks as its judges",
		verifyGivesASessionCaseNoRepositoryAndItsDeclared,
	);
});

async function verifyOmitsArchivedDeclarationsFromTheBrowserSCaseAnd(): Promise<void> {
	const { casesDirectory, list } = await serving();
	await Bun.write(
		join(casesDirectory, SESSION_CASE_ID, "case.json"),
		JSON.stringify({ ...SESSION_CASE, archived: true }),
	);

	const listing = await list();

	expect(listing.cases.map(({ id }) => id)).not.toContain(SESSION_CASE_ID);
	expect(listing.cases.map(({ id }) => id)).toContain(CASE_ID);
	expect(listing.unreadable.map(({ id }) => id)).not.toContain(SESSION_CASE_ID);
}

async function verifyGivesAPipelineCaseItsTargetItsStepsWith(): Promise<void> {
	const { listed } = await serving();

	expect(await listed(CASE_ID)).toEqual({
		cohorts: [],
		definition: {
			evaluation: {
				source: "final-rubric.md",
				state: "available",
				text: "The audit trail is complete.",
			},
			productBrief: {
				source: "brief.md",
				state: "available",
				text: "Keep an audit trail.",
			},
			prompt: {
				source: "task.md",
				state: "available",
				text: "Add the audit log module.",
			},
			sessionBudgetUsd: null,
		},
		figures: { state: "no-runs" },
		finalRubric: "final-rubric.md",
		id: CASE_ID,
		kind: "pipeline",
		latestMinimumGrade: null,
		model: null,
		pipeline: {
			stages: [
				{ name: "discuss", rubric: "cases/audit-log/rubrics/discuss.json" },
				{ name: "build", rubric: "cases/audit-log/rubrics/build.json" },
			],
			state: "available",
		},
		target: "/sources/template",
		title: PIPELINE_CASE.title,
	});
}

async function verifyGivesASessionCaseNoRepositoryAndItsDeclared(): Promise<void> {
	const { listed } = await serving();

	expect(await listed(SESSION_CASE_ID)).toEqual({
		checks: ["word-band", "forbidden-text"],
		cohorts: [],
		definition: {
			corpusFiles: ["skills/brief/SKILL.md"],
			evaluation: {
				source: "case.json · checks / stateCheck",
				state: "available",
				text: JSON.stringify(
					{ checks: SESSION_CASE.checks },
					null,
					RECORD_JSON_INDENT_SPACES,
				),
			},
			prompt: {
				source: "case.json · prompt",
				state: "available",
				text: SESSION_CASE.prompt,
			},
			sessionBudgetUsd: 0.5,
			tools: ["Read"],
		},
		figures: { state: "no-runs" },
		id: SESSION_CASE_ID,
		kind: "session",
		model: null,
		target: null,
		title: SESSION_CASE.title,
	});
}
