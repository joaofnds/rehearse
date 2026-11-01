import { describe, expect, it } from "bun:test";

import { SessionCaseBuilder } from "#cli/session-case-test-fixture";

import { sessionJudgeResponse } from "./session-judge-test-fixtures";
import { regradeAttempt } from "./session-regrade";
import SessionRegradeRecordBuilder from "./session-regrade-record-test-builder";
import { createSpendCeiling } from "./spend-ceiling";

describe(regradeAttempt.name, () => {
	it("judges the original prompt and reply against an edited rubric without rerunning the worker", async () => {
		const sessionCase = new SessionCaseBuilder({
			judge: {
				files: [],
				rubric: "1. `quality`: answer clearly",
				rubricPath: "rubric.md",
			},
			prompt: "a changed prompt which must not replace the original",
		}).build();
		const record = new SessionRegradeRecordBuilder({
			prompt: "original prompt",
			reply: "OK",
		}).build();
		const invoke = async (prompt: string): Promise<string> => {
			expect(prompt).toContain("original prompt");
			expect(prompt).not.toContain(sessionCase.prompt);
			return await Promise.resolve(
				sessionJudgeResponse({ id: "quality", quote: "OK", status: "FAIL" }),
			);
		};

		const assessment = await regradeAttempt({
			attemptId: { caseId: record.caseId, uuid: "saved" },
			judge: { invoke, spendCeiling: createSpendCeiling({ ceilingUsd: 1 }) },
			paths: {
				directory: "/absent-evidence",
				transcriptFile: "/absent-evidence/transcript.jsonl",
			},
			record,
			sessionCase,
		});

		expect(assessment.judge).toMatchObject({
			costUsd: 0.1,
			grade: { verdict: "FAIL" },
			status: "GRADED",
		});
		expect(assessment.outcome).toBe("UNSUCCESSFUL");
	});
});
