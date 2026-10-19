import { describe, expect, it } from "bun:test";

import { sessionHistoryReport } from "#benchmark/session-history";

import { callIn, resultIn, row } from "./session-history-event-test-fixtures";
import { stageAttempt } from "./session-history-test-identities";

const EXPECTED_CORPUS_SOURCE_COUNT = 1;

const FIRST_CONTEXT_SOURCE_INDEX = 0;

function splitsTwoStageReadsOfOneCorpusFileIntoFirstAndSubsequentDeliveries(): void {
	const report = sessionHistoryReport({
		attempt: stageAttempt,
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [],
		transcript: [
			row(
				callIn("/wt", {
					id: "read-1",
					input: {
						file_path: "/home/someone/.claude/CLAUDE.md",
					},
					name: "Read",
				}),
			),
			row(resultIn("/wt", "read-1", "1\talpha")),
			row(
				callIn("/wt", {
					id: "read-2",
					input: {
						file_path: "/home/someone/.claude/CLAUDE.md",
					},
					name: "Read",
				}),
			),
			row(resultIn("/wt", "read-2", "1\talpha")),
		].join("\n"),
	});

	expect(
		report.attemptEvents.map(({ id, kind, label }) => ({ id, kind, label })),
	).toEqual([
		{ id: "1:1", kind: "call", label: "Read invoked" },
		{ id: "2:1", kind: "result", label: "Read delivered · first" },
		{ id: "3:1", kind: "call", label: "Read invoked" },
		{ id: "4:1", kind: "result", label: "Read delivered · subsequent" },
	]);
	expect(report.sources).toHaveLength(EXPECTED_CORPUS_SOURCE_COUNT);
	expect(report.sources.at(FIRST_CONTEXT_SOURCE_INDEX)).toMatchObject({
		kind: "corpus",
		name: "CLAUDE.md",
		observedDeliveryCount: 2,
		repeatDeliveryCount: 1,
	});
	expect(report.startingContext).toEqual([]);
}

function echoesAStageIdentityNamingItsRunStageAndLineage(): void {
	const report = sessionHistoryReport({
		attempt: {
			caseId: "case-a",
			corpusFiles: [{ path: "CLAUDE.md", sha256: "abc123" }],
			kind: "stage",
			lineage: "lineage-1",
			model: "sonnet",
			run: "2026-09-06T21-58-29.508Z",
			stage: "shape",
			upstream: "upstream-1",
		},
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [],
		transcript: [
			row(
				callIn("/wt", {
					id: "read-1",
					input: { file_path: "/wt/src/index.ts" },
					name: "Read",
				}),
			),
			row(resultIn("/wt", "read-1", "body")),
		].join("\n"),
	});

	expect(report.attempt).toEqual({
		caseId: "case-a",
		corpusFiles: [{ path: "CLAUDE.md", sha256: "abc123" }],
		kind: "stage",
		lineage: "lineage-1",
		model: "sonnet",
		run: "2026-09-06T21-58-29.508Z",
		stage: "shape",
		upstream: "upstream-1",
	});
}

function namesAStageSCorpusReadsByLayoutPath(): void {
	const transcript = [
		row(
			callIn("/wt", {
				id: "live",
				input: {
					file_path: "/home/someone/.claude/rulebook/coding-style/core.md",
				},
				name: "Read",
			}),
		),
		row(resultIn("/wt", "live", "live corpus")),
		row(
			callIn("/wt", {
				id: "overlay",
				input: {
					file_path: "/wt/.claude/skills/build/SKILL.md",
				},
				name: "Read",
			}),
		),
		row(resultIn("/wt", "overlay", "overlay corpus")),
		row(
			callIn("/wt", {
				id: "repo",
				input: { file_path: "/wt/src/index.ts" },
				name: "Read",
			}),
		),
		row(resultIn("/wt", "repo", "project body")),
	].join("\n");

	const report = sessionHistoryReport({
		attempt: stageAttempt,
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [],
		transcript,
	});

	expect(report.sources.map(({ kind, path }) => ({ kind, path }))).toEqual([
		{ kind: "corpus", path: "rulebook/coding-style/core.md" },
		{ kind: "corpus", path: "skills/build/SKILL.md" },
		{ kind: "project", path: "src/index.ts" },
	]);
}

describe(sessionHistoryReport.name, () => {
	it(
		"splits two stage reads of one corpus file into first and subsequent deliveries",
		splitsTwoStageReadsOfOneCorpusFileIntoFirstAndSubsequentDeliveries,
	);
	it(
		"echoes a stage identity naming its run, stage and lineage",
		echoesAStageIdentityNamingItsRunStageAndLineage,
	);
	it(
		"names a stage's corpus reads by layout path",
		namesAStageSCorpusReadsByLayoutPath,
	);
});
