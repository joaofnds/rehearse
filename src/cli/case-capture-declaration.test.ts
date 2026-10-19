import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { z } from "zod";

import type { CaseDeclaration } from "#benchmark/case";
import { caseDeclarationSchema } from "#benchmark/case";
import projectFormatted from "#benchmark/project-format";
import { runCaseCapture } from "#cli/case-command";
import { recordOutput } from "#cli/cli-test-support";

import {
	CAPTURE_CASE_ID,
	CaseCaptureFixture,
	SESSION_ID,
} from "./case-capture-test-fixture";

const fixture = CaseCaptureFixture.forEachTest();

function printedDeclaration(text: string): CaseDeclaration {
	return caseDeclarationSchema.parse(z.json().parse(JSON.parse(text)));
}

async function writesTheCommittedDeclarationWithATabIndentRather(): Promise<void> {
	const cases = await fixture.probeCase();
	const projects = await fixture.probeProjects(SESSION_ID);

	const recorder = recordOutput();

	await runCaseCapture(
		{ caseId: CAPTURE_CASE_ID, cut: "2", json: false, session: SESSION_ID },
		{
			casesDirectory: cases,
			output: recorder.output,
			projectsDirectory: projects,
			runsDirectory: join(projects, "no-runs"),
		},
	);

	const written = await Bun.file(
		join(cases, CAPTURE_CASE_ID, "case.json"),
	).text();
	expect(written).toContain('\n\t"id": "capture-probe"');
}

async function writesTheCommittedDeclarationAsTheProjectSFormatter(): Promise<void> {
	const cases = await fixture.probeCase();
	const projects = await fixture.probeProjects(SESSION_ID);

	const recorder = recordOutput();

	await runCaseCapture(
		{ caseId: CAPTURE_CASE_ID, cut: "2", json: false, session: SESSION_ID },
		{
			casesDirectory: cases,
			output: recorder.output,
			projectsDirectory: projects,
			runsDirectory: join(projects, "no-runs"),
		},
	);

	const written = await Bun.file(
		join(cases, CAPTURE_CASE_ID, "case.json"),
	).text();
	expect(written).toBe(await projectFormatted("case.json", written));
}

async function leavesTheOperatorNothingToRunBeforeCommitting(): Promise<void> {
	const cases = await fixture.probeCase();
	const projects = await fixture.probeProjects(SESSION_ID);

	const recorder = recordOutput();

	await runCaseCapture(
		{ caseId: CAPTURE_CASE_ID, cut: "2", json: false, session: SESSION_ID },
		{
			casesDirectory: cases,
			output: recorder.output,
			projectsDirectory: projects,
			runsDirectory: join(projects, "no-runs"),
		},
	);

	expect(recorder.stderr).toEqual([]);
}

async function recordsTheTranscriptInTheCommittedDeclarationOnDisk(): Promise<void> {
	const cases = await fixture.probeCase();
	const projects = await fixture.probeProjects(SESSION_ID);

	const recorder = recordOutput();

	await runCaseCapture(
		{ caseId: CAPTURE_CASE_ID, cut: "2", json: false, session: SESSION_ID },
		{
			casesDirectory: cases,
			output: recorder.output,
			projectsDirectory: projects,
			runsDirectory: join(projects, "no-runs"),
		},
	);

	const declaration = printedDeclaration(
		await Bun.file(join(cases, CAPTURE_CASE_ID, "case.json")).text(),
	);
	expect(declaration).toMatchObject({ transcript: { cut: 2 } });
}

describe(runCaseCapture.name, () => {
	it(
		"writes the committed declaration with a tab indent rather than the two spaces a record takes",
		writesTheCommittedDeclarationWithATabIndentRather,
	);
	it(
		"writes the committed declaration as the project's formatter leaves it",
		writesTheCommittedDeclarationAsTheProjectSFormatter,
	);
	it(
		"leaves the operator nothing to run before committing",
		leavesTheOperatorNothingToRunBeforeCommitting,
	);
	it(
		"records the transcript in the committed declaration on disk",
		recordsTheTranscriptInTheCommittedDeclarationOnDisk,
	);
});
