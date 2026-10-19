import { describe, expect, it } from "bun:test";

import type { LoadedCase, SessionCase } from "#benchmark/case";
import { CaseDeclarationError } from "#benchmark/case";
import type { Immutable } from "#benchmark/contracts";
import { asRefusedPrecondition } from "#benchmark/preflight";
import { sessionAttemptPaths } from "#benchmark/run-layout";
import { parseAssessment } from "#benchmark/session-regrade";
import {
	CliTestWorkspace,
	failureOf,
	recordOutput,
} from "#cli/cli-test-support";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import type { RegradeRequest } from "#cli/regrade-command";
import runRegrade from "#cli/regrade-command";

import { SessionCaseBuilder } from "./session-case-test-fixture";

const workspace = CliTestWorkspace.forEachTest();

const ATTEMPT = { caseId: "smoke", uuid: "uuid-1" };

async function runsDirectory(): Promise<string> {
	return await workspace.createDirectory("rehearse-regrade-cli-");
}

const CORRECTED_CHECKS: SessionCase["checks"] = [{ kind: "word-band", max: 2 }];
const correctedSessionCase = new SessionCaseBuilder({
	checks: CORRECTED_CHECKS,
	corpusFiles: ["CLAUDE.md"],
	declaration: {
		...new SessionCaseBuilder().build().declaration,
		checks: CORRECTED_CHECKS,
		corpusFiles: ["CLAUDE.md"],
		prompt: "write the reply",
		title: "smoke",
	},
	prompt: "write the reply",
}).build();

class RegradeRequestBuilder {
	public constructor(
		private readonly overrides: Immutable<Partial<RegradeRequest>> = {},
	) {}
	public build(): RegradeRequest {
		return {
			id: "attempt:session:smoke/uuid-1",
			json: false,
			runsDirectory: "/runs",
			...this.overrides,
		};
	}
}

async function savedAttempt(directory: string): Promise<void> {
	const paths = sessionAttemptPaths(directory, ATTEMPT);
	await Bun.write(
		paths.recordFile,
		`${JSON.stringify({
			caseId: "smoke",
			checks: [{ detail: "3 words", kind: "word-band", status: "PASS" }],
			corpusFiles: [],
			elapsedMs: 1000,
			lineage: "session-lineage",
			model: "sonnet",
			outcome: "SUCCESSFUL",
			prompt: "write the reply",
			reply: "one two three",
			schemaVersion: 3,
			sessionBudgetUsd: 2,
			transcriptFile: "transcript.jsonl",
		})}\n`,
	);
}

function clockAt(timestamp: string): () => string {
	return () => timestamp;
}

async function writesAnAssessmentReflectingTheCaseSCorrectedCheck(): Promise<void> {
	const directory = await runsDirectory();
	await savedAttempt(directory);
	const recorder = recordOutput();

	await runRegrade(
		new RegradeRequestBuilder({ runsDirectory: directory }).build(),
		{
			now: clockAt("2026-09-20T12:00:00.000Z"),
			output: recorder.output,
			requireCase: async () =>
				await Promise.resolve<LoadedCase>(correctedSessionCase),
		},
	);

	const written = sessionAttemptPaths(directory, ATTEMPT).gradeFile(
		"2026-09-20T12:00:00.000Z",
	);
	expect(recorder.stdout.join("")).toBe(`${written}\n`);
	const assessment = parseAssessment(await Bun.file(written).text());
	expect(assessment.checks).toEqual([
		{
			detail: "3 words outside at most 2",
			kind: "word-band",
			status: "FAIL",
		},
	]);
}

async function leavesTheAttemptSOwnRecordUntouched(): Promise<void> {
	const directory = await runsDirectory();
	await savedAttempt(directory);
	const { recordFile } = sessionAttemptPaths(directory, ATTEMPT);
	const before = await Bun.file(recordFile).text();

	await runRegrade(
		new RegradeRequestBuilder({ runsDirectory: directory }).build(),
		{
			now: clockAt("2026-09-20T12:00:00.000Z"),
			output: recordOutput().output,
			requireCase: async () =>
				await Promise.resolve<LoadedCase>(correctedSessionCase),
		},
	);

	expect(await Bun.file(recordFile).text()).toBe(before);
}

async function refusesNamingTheCaseAndTheAttempt(): Promise<void> {
	const directory = await runsDirectory();
	await savedAttempt(directory);

	const failure = await failureOf(
		runRegrade(
			new RegradeRequestBuilder({ runsDirectory: directory }).build(),
			{
				now: clockAt("2026-09-20T12:00:00.000Z"),
				output: recordOutput().output,
				requireCase: async (caseId) =>
					await asRefusedPrecondition(
						async () =>
							await Promise.reject(
								new CaseDeclarationError(`Unknown case ${caseId}`),
							),
					),
			},
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("smoke");
	expect(failure.message).toContain("uuid-1");
}

async function refusesNamingTheRecordItLookedFor(): Promise<void> {
	const directory = await runsDirectory();

	const failure = await failureOf(
		runRegrade(
			new RegradeRequestBuilder({ runsDirectory: directory }).build(),
			{
				now: clockAt("2026-09-20T12:00:00.000Z"),
				output: recordOutput().output,
				requireCase: async () =>
					await Promise.resolve<LoadedCase>(correctedSessionCase),
			},
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("attempt:session:smoke/uuid-1");
}

describe(runRegrade.name, () => {
	it(
		"writes an assessment reflecting the case's corrected check",
		writesAnAssessmentReflectingTheCaseSCorrectedCheck,
	);
	it(
		"leaves the attempt's own record untouched",
		leavesTheAttemptSOwnRecordUntouched,
	);
	describe("when the attempt's case no longer exists", () => {
		it(
			"refuses, naming the case and the attempt",
			refusesNamingTheCaseAndTheAttempt,
		);
	});
	describe("when no attempt is recorded under the id", () => {
		it(
			"refuses, naming the record it looked for",
			refusesNamingTheRecordItLookedFor,
		);
	});
});
