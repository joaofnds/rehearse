import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LoadedCase, SessionCase } from "#benchmark/case";
import { CaseDeclarationError } from "#benchmark/case";
import { sessionAttemptPaths } from "#benchmark/run-layout";
import { parseAssessment } from "#benchmark/session-regrade";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import { runRegrade } from "#cli/regrade-command";

const ATTEMPT = { caseId: "smoke", uuid: "uuid-1" };

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

async function runsDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-regrade-cli-"));
	roots.push(root);

	return root;
}

function sessionCase(max: number): SessionCase {
	const checks = [{ kind: "word-band" as const, max }];

	return {
		kind: "session",
		declaration: {
			kind: "session",
			id: "smoke",
			title: "smoke",
			prompt: "write the reply",
			tools: [],
			corpusFiles: ["CLAUDE.md"],
			projectFiles: [],
			checks,
		},
		fixturePath: undefined,
		transcriptPath: undefined,
		prompt: "write the reply",
		tools: [],
		settings: undefined,
		agents: undefined,
		corpusFiles: ["CLAUDE.md"],
		projectFiles: [],
		checks,
	};
}

async function savedAttempt(directory: string): Promise<void> {
	const paths = sessionAttemptPaths(directory, ATTEMPT);
	await Bun.write(
		paths.recordFile,
		`${JSON.stringify({
			schemaVersion: 3,
			caseId: "smoke",
			lineage: "session-lineage",
			model: "sonnet",
			sessionBudgetUsd: 2,
			corpusFiles: [],
			prompt: "write the reply",
			reply: "one two three",
			transcriptFile: "transcript.jsonl",
			outcome: "SUCCESSFUL",
			checks: [{ kind: "word-band", status: "PASS", detail: "3 words" }],
			elapsedMs: 1000,
		})}\n`,
	);
}

/**
 * A clock the command reads for the pass's timestamp, so the file a test
 * looks for is the file the command wrote.
 */
function clockAt(timestamp: string): () => string {
	return () => timestamp;
}

describe(runRegrade.name, () => {
	it("writes an assessment reflecting the case's corrected check", async () => {
		const directory = await runsDirectory();
		await savedAttempt(directory);
		const recorder = recordOutput();

		await runRegrade(
			{
				id: "attempt:session:smoke/uuid-1",
				runsDirectory: directory,
				json: false,
			},
			{
				output: recorder.output,
				requireCase: () => Promise.resolve<LoadedCase>(sessionCase(2)),
				now: clockAt("2026-09-20T12:00:00.000Z"),
			},
		);

		const written = sessionAttemptPaths(directory, ATTEMPT).gradeFile(
			"2026-09-20T12:00:00.000Z",
		);
		expect(recorder.stdout.join("")).toBe(`${written}\n`);
		const assessment = parseAssessment(await Bun.file(written).text());
		expect(assessment.checks).toEqual([
			{
				kind: "word-band",
				status: "FAIL",
				detail: "3 words outside at most 2",
			},
		]);
	});

	it("leaves the attempt's own record untouched", async () => {
		const directory = await runsDirectory();
		await savedAttempt(directory);
		const { recordFile } = sessionAttemptPaths(directory, ATTEMPT);
		const before = await Bun.file(recordFile).text();

		await runRegrade(
			{
				id: "attempt:session:smoke/uuid-1",
				runsDirectory: directory,
				json: false,
			},
			{
				output: recordOutput().output,
				requireCase: () => Promise.resolve<LoadedCase>(sessionCase(2)),
				now: clockAt("2026-09-20T12:00:00.000Z"),
			},
		);

		expect(await Bun.file(recordFile).text()).toBe(before);
	});

	describe("when the attempt's case no longer exists", () => {
		it("refuses, naming the case and the attempt", async () => {
			const directory = await runsDirectory();
			await savedAttempt(directory);

			const failure = await failureOf(
				runRegrade(
					{
						id: "attempt:session:smoke/uuid-1",
						runsDirectory: directory,
						json: false,
					},
					{
						output: recordOutput().output,
						requireCase: () =>
							Promise.reject(new CaseDeclarationError("Unknown case smoke")),
						now: clockAt("2026-09-20T12:00:00.000Z"),
					},
				),
			);

			expect(failure).toBeInstanceOf(RefusedPreconditionError);
			expect(failure.message).toContain("smoke");
			expect(failure.message).toContain("uuid-1");
		});
	});

	describe("when no attempt is recorded under the id", () => {
		it("refuses, naming the record it looked for", async () => {
			const directory = await runsDirectory();

			const failure = await failureOf(
				runRegrade(
					{
						id: "attempt:session:smoke/uuid-1",
						runsDirectory: directory,
						json: false,
					},
					{
						output: recordOutput().output,
						requireCase: () => Promise.resolve<LoadedCase>(sessionCase(2)),
						now: clockAt("2026-09-20T12:00:00.000Z"),
					},
				),
			);

			expect(failure).toBeInstanceOf(RefusedPreconditionError);
			expect(failure.message).toContain("attempt:session:smoke/uuid-1");
		});
	});
});
