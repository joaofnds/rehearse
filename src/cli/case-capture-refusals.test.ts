import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { z } from "zod";

import type { CaseDeclaration } from "#benchmark/case";
import { caseDeclarationSchema } from "#benchmark/case";
import { DEFAULT_CASE_ID } from "#benchmark/config";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { runCaseCapture } from "#cli/case-command";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { UsageError } from "#cli/command-usage";

import {
	CAPTURE_CASE_ID,
	CaseCaptureFixture,
	SESSION_ID,
} from "./case-capture-test-fixture";

const fixture = CaseCaptureFixture.forEachTest();

function printedDeclaration(text: string): CaseDeclaration {
	return caseDeclarationSchema.parse(z.json().parse(JSON.parse(text)));
}

async function resolvesAUniqueSessionPrefix(): Promise<void> {
	const cases = await fixture.probeCase();
	const projects = await fixture.probeProjects(SESSION_ID);

	const recorder = recordOutput();

	await runCaseCapture(
		{ caseId: CAPTURE_CASE_ID, cut: "1", json: true, session: "aaaaaaaa" },
		{
			casesDirectory: cases,
			output: recorder.output,
			projectsDirectory: projects,
			runsDirectory: join(projects, "no-runs"),
		},
	);

	expect(printedDeclaration(recorder.stdout.join(""))).toMatchObject({
		transcript: { sourceSession: SESSION_ID },
	});
}

async function refusesAPrefixThatMatchesTwoSessionsNamingBoth(): Promise<void> {
	const cases = await fixture.probeCase();
	const other = "aaaaaaaa-9999-9999-9999-999999999999";
	const projects = await fixture.probeProjects(SESSION_ID, other);

	const recorder = recordOutput();

	const failure = await failureOf(
		runCaseCapture(
			{ caseId: CAPTURE_CASE_ID, cut: "1", json: true, session: "aaaaaaaa" },
			{
				casesDirectory: cases,
				output: recorder.output,
				projectsDirectory: projects,
				runsDirectory: join(projects, "no-runs"),
			},
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toBe(
		`Session prefix aaaaaaaa matches 2 session files: ${SESSION_ID}, ${other}`,
	);
}

async function refusesAPrefixThatMatchesNoSessionNamingThe(): Promise<void> {
	const cases = await fixture.probeCase();
	const projects = await fixture.probeProjects(SESSION_ID);

	const recorder = recordOutput();

	const failure = await failureOf(
		runCaseCapture(
			{ caseId: CAPTURE_CASE_ID, cut: "1", json: true, session: "deadbeef" },
			{
				casesDirectory: cases,
				output: recorder.output,
				projectsDirectory: projects,
				runsDirectory: join(projects, "no-runs"),
			},
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toBe(
		"Session prefix deadbeef matches no session file",
	);
}

async function refusesAPipelineCaseAsAPreconditionNamingWhy(): Promise<void> {
	const projects = await fixture.probeProjects(SESSION_ID);
	const recorder = recordOutput();

	const failure = await failureOf(
		runCaseCapture(
			{
				caseId: DEFAULT_CASE_ID,
				cut: "1",
				json: true,
				session: SESSION_ID,
			},
			{
				output: recorder.output,
				projectsDirectory: projects,
				runsDirectory: join(projects, "no-runs"),
			},
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("only a session case");
}

describe(runCaseCapture.name, () => {
	it("resolves a unique session prefix", resolvesAUniqueSessionPrefix);
	it(
		"refuses a prefix that matches two sessions, naming both",
		refusesAPrefixThatMatchesTwoSessionsNamingBoth,
	);
	it(
		"refuses a prefix that matches no session, naming the prefix",
		refusesAPrefixThatMatchesNoSessionNamingThe,
	);
	it.each(["0", "-1", "5"])(
		"refuses a cut of %s as a usage error, naming the index and the line count",
		async (cut) => {
			const cases = await fixture.probeCase();
			const projects = await fixture.probeProjects(SESSION_ID);

			const recorder = recordOutput();

			const failure = await failureOf(
				runCaseCapture(
					{
						caseId: CAPTURE_CASE_ID,
						cut,
						json: true,
						session: SESSION_ID,
					},
					{
						casesDirectory: cases,
						output: recorder.output,
						projectsDirectory: projects,
						runsDirectory: join(projects, "no-runs"),
					},
				),
			);

			expect(failure).toBeInstanceOf(UsageError);
			expect(failure.message).toBe(
				`Cut ${cut} is outside the source's 4 lines`,
			);
		},
	);
	it(
		"refuses a pipeline case as a precondition, naming why",
		refusesAPipelineCaseAsAPreconditionNamingWhy,
	);
});
