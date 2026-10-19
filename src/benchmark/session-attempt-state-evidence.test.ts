import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { runSessionAttempt } from "#benchmark/session-attempt";
import SessionInvocationError from "#benchmark/session-invocation-error";
import { STATE_EVIDENCE_DIRECTORY } from "#benchmark/session-state-evidence";
import { failureOf } from "#cli/cli-test-support";

import { request, sessionCase } from "./session-attempt-case-test-fixtures";
import {
	failingStateClaude,
	writingClaude,
} from "./session-attempt-state-test-fixtures";
import {
	attemptWorkspace,
	projectsRoot,
	recordDirectory,
	resources,
} from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

async function holdsTheFilesASessionWroteBeforeItEndedWithoutAReply(): Promise<void> {
	const { projects, records } = await attemptWorkspace();

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: records,
			runClaude: writingClaude(projects, { "state.txt": "written\n" }),
		}),
	);

	expect(attempt.outcome).toBe("NO_REPLY");
	expect(attempt.checks).toEqual([]);
	expect(attempt.stateEvidenceDirectory).toBe(
		join(records, STATE_EVIDENCE_DIRECTORY),
	);
	expect(
		await Bun.file(join(records, STATE_EVIDENCE_DIRECTORY, "state.txt")).text(),
	).toBe("written\n");
}

async function recordsANamedResultPerDeclaredOutcomeWhileTheOutcomeStaysNoReply(): Promise<void> {
	const projects = await projectsRoot();

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: writingClaude(projects, { "state.txt": "written\n" }),
			sessionCase: sessionCase({
				stateCheck: {
					command: [
						"sh",
						"-c",
						'printf \'{"results":[{"name":"wrote-state","status":"%s","detail":"%s"}]}\' "$(test -f state.txt && echo PASS || echo FAIL)" "state.txt present"',
					],
					outcomes: ["wrote-state"],
				},
			}),
		}),
	);

	expect(attempt.outcome).toBe("NO_REPLY");
	expect(attempt.checks).toEqual([]);
	expect(attempt.stateResults).toEqual([
		{ detail: "state.txt present", name: "wrote-state", status: "PASS" },
	]);
}

async function reportsAScorerThatCannotGradeAsAGradingErrorNotAFailedGrade(): Promise<void> {
	const projects = await projectsRoot();

	const attempt = await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: writingClaude(projects, { "state.txt": "written\n" }),
			sessionCase: sessionCase({
				stateCheck: {
					command: ["sh", "-c", "echo scorer is broken >&2; exit 4"],
					outcomes: ["wrote-state"],
				},
			}),
		}),
	);

	expect(attempt.stateResults).toBeUndefined();
	expect(attempt.stateGradingError).toContain("4");
}

async function preservesNoStateEvidenceWhenTheProviderReportedTheCallAsFailed(): Promise<void> {
	const { projects, records } = await attemptWorkspace();

	const attemptRequest = request({
		projectsDirectory: projects,
		recordDirectory: records,
		runClaude: failingStateClaude(projects),
		sessionCase: sessionCase({
			stateCheck: {
				command: ["sh", "-c", "echo should not run"],
				outcomes: ["wrote-state"],
			},
		}),
	});
	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure).toBeInstanceOf(SessionInvocationError);
	expect(
		await Bun.file(
			join(records, STATE_EVIDENCE_DIRECTORY, "state.txt"),
		).exists(),
	).toBe(false);
	if (!(failure instanceof SessionInvocationError)) {
		throw failure;
	}

	expect(failure.attempt).toMatchObject({
		checks: [],
		outcome: "EXECUTION_FAILED",
	});
	expect(failure.attempt.stateEvidenceDirectory).toBeUndefined();
	expect(failure.attempt.stateResults).toBeUndefined();
}
describe("the state evidence a session attempt preserves", () => {
	it(
		"holds the files a session wrote before it ended without a reply",
		holdsTheFilesASessionWroteBeforeItEndedWithoutAReply,
	);
	it(
		"records a named result per declared outcome while the outcome stays no reply",
		recordsANamedResultPerDeclaredOutcomeWhileTheOutcomeStaysNoReply,
	);
	it(
		"reports a scorer that cannot grade as a grading error, not a failed grade",
		reportsAScorerThatCannotGradeAsAGradingErrorNotAFailedGrade,
	);
	it(
		"preserves no state evidence when the provider reported the call as failed",
		preservesNoStateEvidenceWhenTheProviderReportedTheCallAsFailed,
	);
});
