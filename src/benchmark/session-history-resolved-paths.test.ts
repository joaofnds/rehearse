import { describe, expect, it } from "bun:test";

import {
	sessionHistoryReport,
	stageCorpusReconciliation,
} from "#benchmark/session-history";

import {
	call,
	callIn,
	result,
	resultIn,
	row,
} from "./session-history-event-test-fixtures";
import { sessionAttempt } from "./session-history-test-identities";

const SHA256_HEX_CHARACTERS = 64;

const unresolvedCorpusTranscript = [
	row(
		call("other-root", "Read", {
			file_path: "/home/someone/.claude/rulebook/core.md",
		}),
	),
	row(result("other-root", "another install")),
	row(
		call("nested", "Read", {
			file_path: "/work/vendor/.claude/skills/build/SKILL.md",
		}),
	),
	row(result("nested", "vendored")),
	row(call("own", "Read", { file_path: "/work/.claude/skills/a/SKILL.md" })),
	row(result("own", "own corpus")),
	row(
		callIn(undefined, {
			id: "bare-root",
			input: { file_path: "CLAUDE.md" },
			name: "Read",
		}),
	),
	row(resultIn(undefined, "bare-root", "bare instructions")),
	row(
		callIn(undefined, {
			id: "bare-skill",
			input: {
				file_path: "skills/a/SKILL.md",
			},
			name: "Read",
		}),
	),
	row(resultIn(undefined, "bare-skill", "bare skill")),
].join("\n");

function matchesARelativeReadAgainstItsExactRecordedCorpusPath(): void {
	const report = sessionHistoryReport({
		attempt: {
			caseId: "case-a",
			corpusFiles: [{ path: "shared.md", resolvedPath: "/work/shared.md" }],
			id: "attempt-a",
			kind: "session",
			model: "sonnet",
			outcome: "SUCCESSFUL",
		},
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [
			{ path: "shared.md", resolvedPath: "/work/shared.md" },
		],
		transcript: [
			row(call("read-1", "Read", { file_path: "shared.md" })),
			row(result("read-1", "corpus body")),
		].join("\n"),
	});

	expect(report.sources).toEqual([
		expect.objectContaining({
			kind: "corpus",
			name: "shared.md",
			path: "shared.md",
		}),
	]);
}

function refusesToNameAStageReadUnderANestedClaudeAsADeclaredCorpusFile(): void {
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
		transcript: [
			row(
				callIn("/wt", {
					id: "vendored",
					input: {
						file_path: "/wt/node_modules/dep/.claude/CLAUDE.md",
					},
					name: "Read",
				}),
			),
			row(resultIn("/wt", "vendored", "a vendored copy")),
		].join("\n"),
	});

	expect(report.sources.map(({ kind, name }) => ({ kind, name }))).toEqual([
		{ kind: "project", name: "node_modules/dep/.claude/CLAUDE.md" },
	]);
	expect(stageCorpusReconciliation(report)).toEqual([
		{ path: "CLAUDE.md", state: "no-observation-recorded" },
	]);
}

function leavesASessionAttemptDeclaringNoCorpusFilesClassifyingAsItDid(): void {
	const report = sessionHistoryReport({
		attempt: sessionAttempt,
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [],
		transcript: [
			row(
				call("outside", "Read", {
					file_path: "/home/someone/.claude/rulebook/core.md",
				}),
			),
			row(result("outside", "another install")),
		].join("\n"),
	});

	expect(report.sources.map(({ kind, name }) => ({ kind, name }))).toEqual([
		{ kind: "external", name: "/home/someone/.claude/rulebook/core.md" },
	]);
}

function leavesEverySessionAttemptClassificationUnmovedWhenResolvedCorpusPathsAreSupplied(): void {
	const report = sessionHistoryReport({
		attempt: sessionAttempt,
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [
			{ path: "shared.md", resolvedPath: "/work/shared.md" },
		],
		transcript: unresolvedCorpusTranscript,
	});

	expect(report.sources.map(({ kind, path }) => ({ kind, path }))).toEqual([
		{ kind: "external", path: "/home/someone/.claude/rulebook/core.md" },
		{ kind: "project", path: "vendor/.claude/skills/build/SKILL.md" },
		{ kind: "corpus", path: "skills/a/SKILL.md" },
		{ kind: "unclassified", path: undefined },
		{ kind: "unclassified", path: undefined },
	]);
}

describe(sessionHistoryReport.name, () => {
	it(
		"matches a relative Read against its exact recorded corpus path",
		matchesARelativeReadAgainstItsExactRecordedCorpusPath,
	);
	it(
		"refuses to name a stage read under a nested .claude as a declared corpus file",
		refusesToNameAStageReadUnderANestedClaudeAsADeclaredCorpusFile,
	);
	it(
		"leaves a session attempt declaring no corpus files classifying as it did",
		leavesASessionAttemptDeclaringNoCorpusFilesClassifyingAsItDid,
	);
	it(
		"leaves every session-attempt classification unmoved when resolved corpus paths are supplied",
		leavesEverySessionAttemptClassificationUnmovedWhenResolvedCorpusPathsAreSupplied,
	);
});
