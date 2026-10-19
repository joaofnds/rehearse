import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import type { CaseDeclaration } from "#benchmark/case";
import { caseDeclarationSchema } from "#benchmark/case";
import { runCaseCapture } from "#cli/case-command";
import { failureOf, recordOutput } from "#cli/cli-test-support";

import {
	CAPTURE_CASE_ID,
	CaseCaptureFixture,
	SESSION_ID,
} from "./case-capture-test-fixture";

const fixture = CaseCaptureFixture.forEachTest();

function printedDeclaration(text: string): CaseDeclaration {
	return caseDeclarationSchema.parse(z.json().parse(JSON.parse(text)));
}

const capturedTranscriptSchema = z.object({
	transcript: z.object({ file: z.string() }),
});

async function writesTheSourceSFirstCutLinesIntoThe(): Promise<void> {
	const expectedSplitCount = 3;

	const cases = await fixture.probeCase();
	const projects = await fixture.probeProjects(SESSION_ID);

	const recorder = recordOutput();

	await runCaseCapture(
		{ caseId: CAPTURE_CASE_ID, cut: "3", json: true, session: SESSION_ID },
		{
			casesDirectory: cases,
			output: recorder.output,
			projectsDirectory: projects,
			runsDirectory: join(projects, "no-runs"),
		},
	);

	const printed = printedDeclaration(recorder.stdout.join(""));
	expect(printed).toMatchObject({
		transcript: { cut: 3, sourceSession: SESSION_ID },
	});
	const captured = capturedTranscriptSchema.parse(printed);
	const written = await Bun.file(
		join(cases, CAPTURE_CASE_ID, captured.transcript.file),
	).text();
	expect(written.trimEnd().split("\n")).toHaveLength(expectedSplitCount);
}

async function capturesFromASessionTheHarnessItselfSavedWhose(): Promise<void> {
	const cases = await fixture.probeCase();
	const runs = await fixture.probeRuns(SESSION_ID);

	const recorder = recordOutput();

	await runCaseCapture(
		{ caseId: CAPTURE_CASE_ID, cut: "2", json: true, session: SESSION_ID },
		{
			casesDirectory: cases,
			output: recorder.output,
			projectsDirectory: await fixture.emptyProjects(),
			runsDirectory: runs,
		},
	);

	expect(printedDeclaration(recorder.stdout.join(""))).toMatchObject({
		transcript: { sourceSession: SESSION_ID },
	});
}

async function capturesFromTheHarnessStoreOnAMachineWith(): Promise<void> {
	const cases = await fixture.probeCase();
	const runs = await fixture.probeRuns(SESSION_ID);

	const recorder = recordOutput();

	await runCaseCapture(
		{ caseId: CAPTURE_CASE_ID, cut: "2", json: true, session: SESSION_ID },
		{
			casesDirectory: cases,
			output: recorder.output,
			projectsDirectory: join(runs, "no-interactive-sessions"),
			runsDirectory: runs,
		},
	);

	expect(printedDeclaration(recorder.stdout.join(""))).toMatchObject({
		transcript: { sourceSession: SESSION_ID },
	});
}

async function namesThePrefixItWritesAfterTheSessionId(): Promise<void> {
	const cases = await fixture.probeCase();
	const runs = await fixture.probeRuns(SESSION_ID);

	const recorder = recordOutput();

	await runCaseCapture(
		{ caseId: CAPTURE_CASE_ID, cut: "2", json: true, session: SESSION_ID },
		{
			casesDirectory: cases,
			output: recorder.output,
			projectsDirectory: await fixture.emptyProjects(),
			runsDirectory: runs,
		},
	);

	expect(printedDeclaration(recorder.stdout.join(""))).toMatchObject({
		transcript: { file: `${SESSION_ID}-cut-2.jsonl` },
	});
}

async function refusesAnUnreadableInteractiveStoreBeforeWriting(): Promise<void> {
	const cases = await fixture.probeCase();
	const projects = join(cases, "projects");
	const runs = await fixture.probeRuns(SESSION_ID);
	const original = await Bun.file(
		join(cases, CAPTURE_CASE_ID, "case.json"),
	).text();
	const recorder = recordOutput();
	await Bun.write(projects, "not a transcript directory\n");

	const failure = await failureOf(
		runCaseCapture(
			{ caseId: CAPTURE_CASE_ID, cut: "2", json: true, session: SESSION_ID },
			{
				casesDirectory: cases,
				output: recorder.output,
				projectsDirectory: projects,
				runsDirectory: runs,
			},
		),
	);

	expect(failure).toMatchObject({ code: "ENOTDIR" });
	expect(await Bun.file(join(cases, CAPTURE_CASE_ID, "case.json")).text()).toBe(
		original,
	);
	expect({
		files: await readdir(join(cases, CAPTURE_CASE_ID)),
		stdout: recorder.stdout,
	}).toEqual({ files: ["case.json"], stdout: [] });
}

describe(runCaseCapture.name, () => {
	it(
		"writes the source's first cut lines into the case directory and records the digest",
		writesTheSourceSFirstCutLinesIntoThe,
	);
	it(
		"captures from a session the harness itself saved, whose transcript is not named after it",
		capturesFromASessionTheHarnessItselfSavedWhose,
	);
	it(
		"captures from the harness store on a machine with no interactive sessions directory",
		capturesFromTheHarnessStoreOnAMachineWith,
	);
	it(
		"names the prefix it writes after the session id inside the transcript, not the source file",
		namesThePrefixItWritesAfterTheSessionId,
	);
	describe("when the interactive store cannot be enumerated", () => {
		it(
			"refuses without changing the declaration or writing a prefix",
			refusesAnUnreadableInteractiveStoreBeforeWriting,
		);
	});
});
