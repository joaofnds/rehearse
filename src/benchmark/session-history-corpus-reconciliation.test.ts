import { describe, expect, it } from "bun:test";

import {
	sessionHistoryReport,
	stageCorpusReconciliation,
} from "#benchmark/session-history";

import { callIn, resultIn, row } from "./session-history-event-test-fixtures";
import {
	sessionAttempt,
	stageAttempt,
} from "./session-history-test-identities";

const SHA256_HEX_CHARACTERS = 64;

const declaredCorpusTranscript = [
	row(
		callIn("/wt", {
			id: "read-1",
			input: {
				file_path: "/home/someone/.claude/CLAUDE.md",
			},
			name: "Read",
		}),
	),
	row(resultIn("/wt", "read-1", "instructions")),
	row(
		callIn("/wt", {
			id: "read-2",
			input: {
				file_path: "/home/someone/.claude/agents/reviewer.md",
			},
			name: "Read",
		}),
	),
	row(resultIn("/wt", "read-2", "reviewer")),
].join("\n");

function reportsADeclaredFileTheTranscriptShowsBeingReadAsObserved(): void {
	const report = sessionHistoryReport({
		attempt: {
			caseId: "case-a",
			corpusFiles: [
				{ path: "CLAUDE.md", sha256: "a".repeat(SHA256_HEX_CHARACTERS) },
				{
					path: "skills/build/SKILL.md",
					sha256: "b".repeat(SHA256_HEX_CHARACTERS),
				},
			],
			kind: "stage",
			lineage: "lineage-1",
			model: "sonnet",
			run: "run-1",
			stage: "shape",
			upstream: "upstream-1",
		},
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [],
		transcript: declaredCorpusTranscript,
	});

	expect(stageCorpusReconciliation(report)).toEqual([
		{
			firstLocator: { block: 1, line: 1 },
			path: "CLAUDE.md",
			state: "observed",
		},
		{ path: "skills/build/SKILL.md", state: "no-observation-recorded" },
		{
			firstLocator: { block: 1, line: 3 },
			path: "agents/reviewer.md",
			state: "undeclared",
		},
	]);
}

function leavesANonLayoutFileUnderTheWorktreeClaudeOutOfTheReconciliation(): void {
	const report = sessionHistoryReport({
		attempt: stageAttempt,
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [],
		transcript: [
			row(
				callIn("/wt", {
					id: "settings",
					input: {
						file_path: "/wt/.claude/settings.json",
					},
					name: "Read",
				}),
			),
			row(resultIn("/wt", "settings", "{}")),
		].join("\n"),
	});

	expect(stageCorpusReconciliation(report)).toEqual([]);
}

function reconcilesNothingForASessionAttemptWhoseCorpusIsResolvedToRealPaths(): void {
	const report = sessionHistoryReport({
		attempt: sessionAttempt,
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [],
		transcript: undefined,
	});

	expect(stageCorpusReconciliation(report)).toEqual([]);
}

function reconcilesTheReadsOfAStageWhoseJudgingNeverCompleted(): void {
	const report = sessionHistoryReport({
		attempt: {
			caseId: "case-a",
			corpusFiles: [
				{ path: "CLAUDE.md", sha256: "a".repeat(SHA256_HEX_CHARACTERS) },
			],
			kind: "awaiting-judge-stage",
			model: "sonnet",
			run: "run-1",
			stage: "build",
		},
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [],
		transcript: [
			row(
				callIn("/wt", {
					id: "read-1",
					input: {
						file_path: "/home/someone/.claude/agents/reviewer.md",
					},
					name: "Read",
				}),
			),
			row(resultIn("/wt", "read-1", "reviewer")),
		].join("\n"),
	});

	expect(stageCorpusReconciliation(report)).toEqual([
		{ path: "CLAUDE.md", state: "no-observation-recorded" },
		{
			firstLocator: { block: 1, line: 1 },
			path: "agents/reviewer.md",
			state: "undeclared",
		},
	]);
}

function recordsNoObservationRatherThanAbsenceWhenAStageKeptNoTranscript(): void {
	const report = sessionHistoryReport({
		attempt: {
			caseId: "case-a",
			corpusFiles: [
				{ path: "CLAUDE.md", sha256: "a".repeat(SHA256_HEX_CHARACTERS) },
			],
			kind: "stage",
			lineage: "lineage-1",
			model: "sonnet",
			run: "run-1",
			stage: "shape",
			upstream: "upstream-1",
		},
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [],
		transcript: undefined,
		unavailableReason: "no-capture-recorded",
	});

	expect(stageCorpusReconciliation(report)).toEqual([
		{ path: "CLAUDE.md", state: "no-observation-recorded" },
	]);
}

describe(stageCorpusReconciliation.name, () => {
	it(
		"reports a declared file the transcript shows being read as observed",
		reportsADeclaredFileTheTranscriptShowsBeingReadAsObserved,
	);
	it(
		"leaves a non-layout file under the worktree .claude out of the reconciliation",
		leavesANonLayoutFileUnderTheWorktreeClaudeOutOfTheReconciliation,
	);
	it(
		"reconciles nothing for a session attempt, whose corpus is resolved to real paths",
		reconcilesNothingForASessionAttemptWhoseCorpusIsResolvedToRealPaths,
	);
	it(
		"reconciles the reads of a stage whose judging never completed",
		reconcilesTheReadsOfAStageWhoseJudgingNeverCompleted,
	);
	it(
		"records no observation rather than absence when a stage kept no transcript",
		recordsNoObservationRatherThanAbsenceWhenAStageKeptNoTranscript,
	);
});
