import type { z } from "zod";

import { EMPTY_COLLECTION_LENGTH } from "./session-record-context-schema";

interface RecordedOutcome {
	readonly outcome: "SUCCESSFUL" | "UNSUCCESSFUL" | "NO_REPLY";
	readonly reply?: string | undefined;
	readonly checks: readonly { readonly status: "PASS" | "FAIL" }[];
	readonly stateResults?: readonly unknown[] | undefined;
	readonly stateGradingError?: string | undefined;
}

interface RecordProblem {
	readonly message: string;
	readonly path: string;
}

function problemsWith(record: RecordedOutcome): readonly RecordProblem[] {
	const state = stateGradeProblems(record);
	if (record.outcome === "NO_REPLY") {
		return [...state, ...noReplyProblems(record)];
	}

	return [...state, ...checkedProblems(record)];
}

function stateGradeProblems(record: RecordedOutcome): readonly RecordProblem[] {
	if (
		record.stateResults === undefined ||
		record.stateGradingError === undefined
	) {
		return [];
	}

	return [
		{
			message:
				"A state grade records either its results or the reason it could not grade",
			path: "stateGradingError",
		},
	];
}

function noReplyProblems(record: RecordedOutcome): readonly RecordProblem[] {
	const problems: RecordProblem[] = [];
	if (record.reply !== undefined) {
		problems.push({
			message: "A session attempt with no reply records no reply",
			path: "reply",
		});
	}
	if (record.checks.length > EMPTY_COLLECTION_LENGTH) {
		problems.push({
			message: "A session attempt with no reply evaluates no check",
			path: "checks",
		});
	}

	return problems;
}

function checkedProblems(record: RecordedOutcome): readonly RecordProblem[] {
	const problems: RecordProblem[] = [];
	if (record.reply === undefined) {
		problems.push({
			message:
				"A session attempt that was checked records the reply it checked",
			path: "reply",
		});
	}
	if (record.checks.length === EMPTY_COLLECTION_LENGTH) {
		problems.push({
			message:
				"A checked session attempt records one result per declared check",
			path: "checks",
		});

		return problems;
	}

	const passed = record.checks.every(({ status }) => status === "PASS");
	if (passed !== (record.outcome === "SUCCESSFUL")) {
		problems.push({
			message:
				"A session attempt is successful when and only when every check passes",
			path: "outcome",
		});
	}

	return problems;
}

interface AttemptRefinementContext {
	readonly addIssue: z.RefinementCtx["addIssue"];
}

function refineSessionAttemptRecord(
	record: RecordedOutcome,
	context: Readonly<AttemptRefinementContext>,
): void {
	for (const problem of problemsWith(record)) {
		context.addIssue({
			code: "custom",
			message: problem.message,
			path: [problem.path],
		});
	}
}

export { refineSessionAttemptRecord as default };
