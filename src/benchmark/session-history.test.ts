import { describe, expect, it, afterEach } from "bun:test";
import { mkdtemp, open, rm } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UNPRICED_REASONS } from "#benchmark/context-evidence-contract";
import type { JsonValue } from "#benchmark/json-value";
import { syntheticRateProvenance } from "#benchmark/rate-catalog-test-support";
import type { SessionHistoryRequestSeries } from "#benchmark/session-history";
import {
	MAX_EVENT_DETAIL_BYTES,
	sessionHistoryAttemptCost,
	sessionHistoryDetail,
	sessionHistoryReport,
	sessionHistoryRequestCosts,
	sessionHistoryRequestSeries,
	sessionHistoryRequestSeriesFromLines,
	stageCorpusReconciliation,
} from "#benchmark/session-history";

function row(record: JsonValue): string {
	return JSON.stringify(record);
}

function call(
	id: string,
	name: string,
	input: Readonly<Record<string, JsonValue>>,
): JsonValue {
	return {
		type: "assistant",
		timestamp: `2026-09-14T00:00:0${id.at(-1) ?? "0"}.000Z`,
		cwd: "/work",
		message: {
			content: [{ type: "tool_use", id, name, input }],
		},
	};
}

function result(
	id: string,
	content: string,
	options: {
		readonly error?: boolean;
		readonly snapshot?: string;
		readonly startLine?: number;
		readonly numLines?: number;
		readonly totalLines?: number;
	} = {},
): JsonValue {
	const base = {
		type: "user",
		cwd: "/work",
		message: {
			content: [
				{
					type: "tool_result",
					tool_use_id: id,
					content,
					is_error: options.error ?? false,
				},
			],
		},
	} satisfies JsonValue;
	if (options.snapshot === undefined) {
		return base;
	}

	return {
		...base,
		toolUseResult: {
			type: "text",
			file: {
				filePath: "/work/CLAUDE.md",
				content: options.snapshot,
				numLines: options.numLines ?? 1,
				startLine: options.startLine ?? 1,
				totalLines: options.totalLines ?? 1,
			},
		},
	};
}

function callIn(
	cwd: string | undefined,
	id: string,
	name: string,
	input: Readonly<Record<string, JsonValue>>,
): JsonValue {
	const base = {
		type: "assistant",
		timestamp: "2026-09-14T00:00:00.000Z",
		message: { content: [{ type: "tool_use", id, name, input }] },
	} satisfies JsonValue;

	return cwd === undefined ? base : { ...base, cwd };
}

function resultIn(
	cwd: string | undefined,
	id: string,
	content: string,
): JsonValue {
	const base = {
		type: "user",
		message: {
			content: [
				{ type: "tool_result", tool_use_id: id, content, is_error: false },
			],
		},
	} satisfies JsonValue;

	return cwd === undefined ? base : { ...base, cwd };
}

describe(sessionHistoryReport.name, () => {
	it("separates inherited and repeated Read deliveries in source order", () => {
		const transcript = [
			row(call("read-0", "Read", { file_path: "/work/CLAUDE.md" })),
			row(result("read-0", "1\tinherited")),
			row(call("read-1", "Read", { file_path: "/work/CLAUDE.md" })),
			row(result("read-1", "1\talpha", { snapshot: "alpha" })),
			row(call("read-2", "Read", { file_path: "/work/CLAUDE.md" })),
			row(result("read-2", "1\talpha", { snapshot: "alpha" })),
		].join("\n");

		const report = sessionHistoryReport({
			attempt: {
				kind: "session",
				caseId: "case-a",
				id: "attempt-a",
				model: "sonnet",
				outcome: "SUCCESSFUL",
				corpusFiles: [],
			},
			resolvedCorpusFiles: [],
			transcript,
			prefixLinesExcluded: 2,
		});

		expect(report.evidence).toEqual({ state: "complete" });
		expect(report.boundary).toBe("known");
		expect(report.startingContext.map(({ id }) => id)).toEqual(["1:1", "2:1"]);
		expect(report.startingContext.at(1)?.deliveryOrdinal).toBe(1);
		expect(report.startingContext.at(1)?.label).toBe("Read delivered · first");
		expect(
			report.attemptEvents.map(({ id, state }) => ({ id, state })),
		).toEqual([
			{ id: "3:1", state: "invoked" },
			{ id: "4:1", state: "delivered" },
			{ id: "5:1", state: "invoked" },
			{ id: "6:1", state: "delivered" },
		]);
		expect(report.attemptEvents[0]?.measurement).toEqual({
			state: "unavailable",
			reasons: ["tool invocation carries no result content"],
		});
		expect(
			report.attemptEvents
				.filter(({ state }) => state === "delivered")
				.map(({ deliveryOrdinal, label }) => ({ deliveryOrdinal, label })),
		).toEqual([
			{ deliveryOrdinal: 1, label: "Read delivered · first" },
			{ deliveryOrdinal: 2, label: "Read delivered · subsequent" },
		]);
		expect(report.sources).toEqual([
			expect.objectContaining({
				kind: "project",
				name: "CLAUDE.md",
				measurement: { state: "complete", characters: 14 },
				observedDeliveryCount: 2,
				repeatDeliveryCount: 1,
				failedOccurrences: 0,
				partialOccurrences: 0,
				missingOccurrences: 0,
				unavailableOccurrences: 0,
			}),
		]);
	});

	it("keeps no-cut rows inspectable without inventing activity totals", () => {
		const transcript = [
			row(call("read-1", "Read", { file_path: "/work/notes.md" })),
			row(result("read-1", "notes")),
		].join("\n");

		const report = sessionHistoryReport({
			attempt: {
				kind: "session",
				caseId: "case-a",
				id: "attempt-a",
				model: "sonnet",
				outcome: "SUCCESSFUL",
				corpusFiles: [],
			},
			resolvedCorpusFiles: [],
			transcript,
			prefixLinesExcluded: undefined,
		});

		expect(report.evidence).toEqual({
			state: "partial",
			reasons: ["attempt boundary unavailable"],
		});
		expect(report.boundary).toBe("unknown");
		expect(report.startingContext).toEqual([]);
		expect(report.attemptEvents).toEqual([]);
		expect(report.boundaryUnknown.map(({ id }) => id)).toEqual(["1:1", "2:1"]);
		expect(report.boundaryUnknown.at(1)?.label).toBe("Read delivered");
		expect(report.boundaryUnknown[1]?.deliveryOrdinal).toBeUndefined();
		expect(report.sources).toEqual([
			expect.objectContaining({
				region: "boundary-unknown",
				measurement: { state: "complete", characters: 5 },
				observedDeliveryCount: undefined,
				repeatDeliveryCount: undefined,
			}),
		]);
	});

	it("keeps duplicate result IDs as separate partial evidence", () => {
		const transcript = [
			row(call("read-1", "Read", { file_path: "/work/notes.md" })),
			row(result("read-1", "first body")),
			row(result("read-1", "second body")),
		].join("\n");

		const report = sessionHistoryReport({
			attempt: {
				kind: "session",
				caseId: "case-a",
				id: "attempt-a",
				model: "sonnet",
				outcome: "SUCCESSFUL",
				corpusFiles: [],
			},
			resolvedCorpusFiles: [],
			transcript,
			prefixLinesExcluded: 0,
		});

		expect(
			report.attemptEvents.map(({ id, state }) => ({ id, state })),
		).toEqual([
			{ id: "1:1", state: "invoked" },
			{ id: "2:1", state: "partial" },
			{ id: "3:1", state: "partial" },
		]);
		expect(report.evidence).toEqual({
			state: "partial",
			reasons: [
				"ambiguous tool result read-1 at 2:1",
				"ambiguous tool result read-1 at 3:1",
			],
		});
		expect(report.sources).toEqual([
			expect.objectContaining({
				observedDeliveryCount: 0,
				partialOccurrences: 2,
				missingOccurrences: 0,
				unavailableOccurrences: 0,
			}),
		]);
	});

	it("retains no-content historical rows as unsupported locator evidence", () => {
		const report = sessionHistoryReport({
			attempt: {
				kind: "session",
				caseId: "case-a",
				id: "attempt-a",
				model: "sonnet",
				outcome: "SUCCESSFUL",
				corpusFiles: [],
			},
			resolvedCorpusFiles: [],
			transcript: [
				row({ type: "system" }),
				row({ message: { content: [] } }),
			].join("\n"),
			prefixLinesExcluded: undefined,
		});

		expect(report.boundaryUnknown).toEqual([
			expect.objectContaining({ id: "1:1", state: "recorded" }),
			expect.objectContaining({ id: "2:1", state: "recorded" }),
		]);
		expect(report.evidence).toEqual({
			state: "partial",
			reasons: [
				"unsupported content at 1:1",
				"unsupported content at 2:1",
				"attempt boundary unavailable",
			],
		});
		expect(report.sources).toEqual([
			expect.objectContaining({
				measurement: {
					state: "partial",
					observedCharacters: 0,
					reasons: ["unsupported text body"],
				},
			}),
		]);
	});

	it("makes unsupported result content partial at report level", () => {
		const report = sessionHistoryReport({
			attempt: {
				kind: "session",
				caseId: "case-a",
				id: "attempt-a",
				model: "sonnet",
				outcome: "SUCCESSFUL",
				corpusFiles: [],
			},
			resolvedCorpusFiles: [],
			transcript: [
				row(call("bash-1", "Bash", { command: "pwd" })),
				row({
					message: {
						content: [
							{
								type: "tool_result",
								tool_use_id: "bash-1",
								content: { unsupported: true },
							},
						],
					},
				}),
			].join("\n"),
			prefixLinesExcluded: 0,
		});

		expect(report.attemptEvents.at(1)?.state).toBe("unavailable");
		expect(report.evidence).toEqual({
			state: "partial",
			reasons: ["unsupported text body at 2:1"],
		});
	});

	it("keeps a post-cut result separate from its inherited call", () => {
		const transcript = [
			row(call("read-1", "Read", { file_path: "/work/notes.md" })),
			row(result("read-1", "entered after the cut")),
		].join("\n");

		const report = sessionHistoryReport({
			attempt: {
				kind: "session",
				caseId: "case-a",
				id: "attempt-a",
				model: "sonnet",
				outcome: "SUCCESSFUL",
				corpusFiles: [],
			},
			resolvedCorpusFiles: [],
			transcript,
			prefixLinesExcluded: 1,
		});

		expect(report.attemptEvents).toEqual([
			expect.objectContaining({
				id: "2:1",
				state: "partial",
				measurement: { state: "complete", characters: 21 },
				relatedEventIds: ["1:1"],
			}),
		]);
		expect(report.sources).toEqual([
			expect.objectContaining({
				kind: "unclassified",
				measurement: { state: "complete", characters: 21 },
				observedDeliveryCount: 0,
			}),
		]);
	});

	it("matches a relative Read against its exact recorded corpus path", () => {
		const report = sessionHistoryReport({
			attempt: {
				kind: "session",
				caseId: "case-a",
				id: "attempt-a",
				model: "sonnet",
				outcome: "SUCCESSFUL",
				corpusFiles: [{ path: "shared.md", resolvedPath: "/work/shared.md" }],
			},
			resolvedCorpusFiles: [
				{ path: "shared.md", resolvedPath: "/work/shared.md" },
			],
			transcript: [
				row(call("read-1", "Read", { file_path: "shared.md" })),
				row(result("read-1", "corpus body")),
			].join("\n"),
			prefixLinesExcluded: 0,
		});

		expect(report.sources).toEqual([
			expect.objectContaining({
				kind: "corpus",
				name: "shared.md",
				path: "shared.md",
			}),
		]);
	});

	it("names why raw evidence is unavailable, distinctly per readable cause", () => {
		const stage = {
			kind: "stage",
			caseId: "case-a",
			run: "run-1",
			stage: "shape",
			lineage: "lineage-1",
			upstream: "upstream-1",
			model: "sonnet",
			corpusFiles: [],
		} as const;

		const reasons = (
			[
				"provider-wrote-none",
				"no-capture-recorded",
				"recorded-transcript-missing",
			] as const
		).map(
			(unavailableReason) =>
				sessionHistoryReport({
					attempt: stage,
					resolvedCorpusFiles: [],
					transcript: undefined,
					prefixLinesExcluded: 0,
					unavailableReason,
				}).evidence,
		);

		expect(reasons).toEqual([
			{
				state: "unavailable",
				reasons: ["the provider wrote no transcript for this stage session"],
			},
			{
				state: "unavailable",
				reasons: ["no raw transcript capture was recorded for this stage"],
			},
			{
				state: "unavailable",
				reasons: [
					"the checkpoint records a transcript whose file is no longer beside it",
				],
			},
		]);
		expect(
			new Set(
				reasons.map((evidence) =>
					evidence.state === "unavailable" ? evidence.reasons.at(0) : undefined,
				),
			).size,
		).toBe(3);
	});

	it("keeps the session wording when no unavailable reason is supplied", () => {
		const report = sessionHistoryReport({
			attempt: {
				kind: "session",
				caseId: "case-a",
				id: "attempt-a",
				model: "sonnet",
				outcome: "SUCCESSFUL",
				corpusFiles: [],
			},
			resolvedCorpusFiles: [],
			transcript: undefined,
			prefixLinesExcluded: 0,
		});

		expect(report.evidence).toEqual({
			state: "unavailable",
			reasons: ["transcript unavailable"],
		});
	});

	it("splits two stage reads of one corpus file into first and subsequent deliveries", () => {
		const report = sessionHistoryReport({
			attempt: {
				kind: "stage",
				caseId: "case-a",
				run: "run-1",
				stage: "shape",
				lineage: "lineage-1",
				upstream: "upstream-1",
				model: "sonnet",
				corpusFiles: [],
			},
			resolvedCorpusFiles: [],
			transcript: [
				row(
					callIn("/wt", "read-1", "Read", {
						file_path: "/home/someone/.claude/CLAUDE.md",
					}),
				),
				row(resultIn("/wt", "read-1", "1\talpha")),
				row(
					callIn("/wt", "read-2", "Read", {
						file_path: "/home/someone/.claude/CLAUDE.md",
					}),
				),
				row(resultIn("/wt", "read-2", "1\talpha")),
			].join("\n"),
			prefixLinesExcluded: 0,
		});

		expect(
			report.attemptEvents.map(({ id, kind, label }) => ({ id, kind, label })),
		).toEqual([
			{ id: "1:1", kind: "call", label: "Read invoked" },
			{ id: "2:1", kind: "result", label: "Read delivered · first" },
			{ id: "3:1", kind: "call", label: "Read invoked" },
			{ id: "4:1", kind: "result", label: "Read delivered · subsequent" },
		]);
		expect(report.sources).toHaveLength(1);
		expect(report.sources.at(0)).toMatchObject({
			kind: "corpus",
			name: "CLAUDE.md",
			observedDeliveryCount: 2,
			repeatDeliveryCount: 1,
		});
		expect(report.startingContext).toEqual([]);
	});

	it("echoes a stage identity naming its run, stage and lineage", () => {
		const report = sessionHistoryReport({
			attempt: {
				kind: "stage",
				caseId: "case-a",
				run: "2026-09-06T21-58-29.508Z",
				stage: "shape",
				lineage: "lineage-1",
				upstream: "upstream-1",
				model: "sonnet",
				corpusFiles: [{ path: "CLAUDE.md", sha256: "abc123" }],
			},
			resolvedCorpusFiles: [],
			transcript: [
				row(callIn("/wt", "read-1", "Read", { file_path: "/wt/src/index.ts" })),
				row(resultIn("/wt", "read-1", "body")),
			].join("\n"),
			prefixLinesExcluded: 0,
		});

		expect(report.attempt).toEqual({
			kind: "stage",
			caseId: "case-a",
			run: "2026-09-06T21-58-29.508Z",
			stage: "shape",
			lineage: "lineage-1",
			upstream: "upstream-1",
			model: "sonnet",
			corpusFiles: [{ path: "CLAUDE.md", sha256: "abc123" }],
		});
	});

	it("refuses to name a stage read under a nested .claude as a declared corpus file", () => {
		const report = sessionHistoryReport({
			attempt: {
				kind: "stage",
				caseId: "case-a",
				run: "run-1",
				stage: "shape",
				lineage: "lineage-1",
				upstream: "upstream-1",
				model: "sonnet",
				corpusFiles: [{ path: "CLAUDE.md", sha256: "a".repeat(64) }],
			},
			resolvedCorpusFiles: [],
			transcript: [
				row(
					callIn("/wt", "vendored", "Read", {
						file_path: "/wt/node_modules/dep/.claude/CLAUDE.md",
					}),
				),
				row(resultIn("/wt", "vendored", "a vendored copy")),
			].join("\n"),
			prefixLinesExcluded: 0,
		});

		expect(report.sources.map(({ kind, name }) => ({ kind, name }))).toEqual([
			{ kind: "project", name: "node_modules/dep/.claude/CLAUDE.md" },
		]);
		expect(stageCorpusReconciliation(report)).toEqual([
			{ path: "CLAUDE.md", state: "no-observation-recorded" },
		]);
	});

	it("leaves a session attempt declaring no corpus files classifying as it did", () => {
		const report = sessionHistoryReport({
			attempt: {
				kind: "session",
				caseId: "case-a",
				id: "attempt-a",
				model: "sonnet",
				outcome: "SUCCESSFUL",
				corpusFiles: [],
			},
			resolvedCorpusFiles: [],
			transcript: [
				row(
					call("outside", "Read", {
						file_path: "/home/someone/.claude/rulebook/core.md",
					}),
				),
				row(result("outside", "another install")),
			].join("\n"),
			prefixLinesExcluded: 0,
		});

		expect(report.sources.map(({ kind, name }) => ({ kind, name }))).toEqual([
			{ kind: "external", name: "/home/someone/.claude/rulebook/core.md" },
		]);
	});

	it("names a stage's corpus reads by layout path", () => {
		const transcript = [
			row(
				callIn("/wt", "live", "Read", {
					file_path: "/home/someone/.claude/rulebook/coding-style/core.md",
				}),
			),
			row(resultIn("/wt", "live", "live corpus")),
			row(
				callIn("/wt", "overlay", "Read", {
					file_path: "/wt/.claude/skills/build/SKILL.md",
				}),
			),
			row(resultIn("/wt", "overlay", "overlay corpus")),
			row(callIn("/wt", "repo", "Read", { file_path: "/wt/src/index.ts" })),
			row(resultIn("/wt", "repo", "project body")),
		].join("\n");

		const report = sessionHistoryReport({
			attempt: {
				kind: "stage",
				caseId: "case-a",
				run: "run-1",
				stage: "shape",
				lineage: "lineage-1",
				upstream: "upstream-1",
				model: "sonnet",
				corpusFiles: [],
			},
			resolvedCorpusFiles: [],
			transcript,
			prefixLinesExcluded: 0,
		});

		expect(report.sources.map(({ kind, path }) => ({ kind, path }))).toEqual([
			{ kind: "corpus", path: "rulebook/coding-style/core.md" },
			{ kind: "corpus", path: "skills/build/SKILL.md" },
			{ kind: "project", path: "src/index.ts" },
		]);
	});

	it("leaves every session-attempt classification unmoved when resolved corpus paths are supplied", () => {
		const transcript = [
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
			row(
				call("own", "Read", { file_path: "/work/.claude/skills/a/SKILL.md" }),
			),
			row(result("own", "own corpus")),
			row(callIn(undefined, "bare-root", "Read", { file_path: "CLAUDE.md" })),
			row(resultIn(undefined, "bare-root", "bare instructions")),
			row(
				callIn(undefined, "bare-skill", "Read", {
					file_path: "skills/a/SKILL.md",
				}),
			),
			row(resultIn(undefined, "bare-skill", "bare skill")),
		].join("\n");

		const report = sessionHistoryReport({
			attempt: {
				kind: "session",
				caseId: "case-a",
				id: "attempt-a",
				model: "sonnet",
				outcome: "SUCCESSFUL",
				corpusFiles: [],
			},
			resolvedCorpusFiles: [
				{ path: "shared.md", resolvedPath: "/work/shared.md" },
			],
			transcript,
			prefixLinesExcluded: 0,
		});

		expect(report.sources.map(({ kind, path }) => ({ kind, path }))).toEqual([
			{ kind: "external", path: "/home/someone/.claude/rulebook/core.md" },
			{ kind: "project", path: "vendor/.claude/skills/build/SKILL.md" },
			{ kind: "corpus", path: "skills/a/SKILL.md" },
			{ kind: "unclassified", path: undefined },
			{ kind: "unclassified", path: undefined },
		]);
	});

	it("classifies saved corpus, project, external, tool, and escaping sources", () => {
		const transcript = [
			row(call("corpus", "Read", { file_path: "/work/.claude/rules.md" })),
			row(result("corpus", "corpus")),
			row(call("project", "Read", { file_path: "/work/project.md" })),
			row(result("project", "project")),
			row(call("external", "Read", { file_path: "/outside.md" })),
			row(result("external", "external")),
			row(call("escape", "Read", { file_path: "../escape.md" })),
			row(result("escape", "escape")),
			row(call("bash", "Bash", { command: "pwd" })),
			row(result("bash", "output")),
		].join("\n");
		const report = sessionHistoryReport({
			attempt: {
				kind: "session",
				caseId: "case-a",
				id: "attempt-a",
				model: "sonnet",
				outcome: "SUCCESSFUL",
				corpusFiles: [],
			},
			resolvedCorpusFiles: [],
			transcript,
			prefixLinesExcluded: 0,
		});

		expect(report.sources.map(({ kind }) => kind)).toEqual([
			"corpus",
			"project",
			"external",
			"unclassified",
			"tool-output",
		]);
	});

	it("distinguishes failed and missing Reads from absent and delivered Skills", () => {
		const transcript = [
			row(call("read-failed", "Read", { file_path: "/work/failure.md" })),
			row(result("read-failed", "permission denied", { error: true })),
			row(call("read-missing", "Read", { file_path: "/work/missing.md" })),
			row(call("skill-missing", "Skill", { skill: "verify" })),
			row(call("skill-done", "Skill", { skill: "build" })),
			row(result("skill-done", "loading build")),
			row({
				type: "user",
				sourceToolUseID: "skill-done",
				message: { content: "build instructions" },
			}),
		].join("\n");

		const report = sessionHistoryReport({
			attempt: {
				kind: "session",
				caseId: "case-a",
				id: "attempt-a",
				model: "sonnet",
				outcome: "SUCCESSFUL",
				corpusFiles: [],
			},
			resolvedCorpusFiles: [],
			transcript,
			prefixLinesExcluded: 0,
		});

		expect(
			report.attemptEvents.map(({ id, state }) => ({ id, state })),
		).toEqual([
			{ id: "1:1", state: "invoked" },
			{ id: "2:1", state: "failed" },
			{ id: "3:1", state: "unavailable" },
			{ id: "4:1", state: "unavailable" },
			{ id: "5:1", state: "invoked" },
			{ id: "6:1", state: "recorded" },
			{ id: "7:1", state: "delivered" },
		]);
		expect(report.sources.map(({ kind, name }) => ({ kind, name }))).toEqual([
			{ kind: "project", name: "failure.md" },
			{ kind: "project", name: "missing.md" },
			{ kind: "skill", name: "skills/verify/SKILL.md" },
			{ kind: "skill", name: "skills/build/SKILL.md" },
			{ kind: "tool-output", name: "Skill result · 5:1" },
		]);
		expect(
			report.sources
				.filter(({ name }) => name === "missing.md" || name.includes("verify"))
				.map(({ missingOccurrences, unavailableOccurrences }) => ({
					missingOccurrences,
					unavailableOccurrences,
				})),
		).toEqual([
			{ missingOccurrences: 1, unavailableOccurrences: 0 },
			{ missingOccurrences: 1, unavailableOccurrences: 0 },
		]);
	});
});

describe(sessionHistoryDetail.name, () => {
	it("shares one Unicode-safe byte budget between delivery and snapshot", () => {
		const half = MAX_EVENT_DETAIL_BYTES / 2;
		const delivered = `${"a".repeat(half - 1)}€tail`;
		const snapshot = `${"b".repeat(half - 1)}€tail`;
		const transcript = [
			row(call("read-1", "Read", { file_path: "/work/CLAUDE.md" })),
			row(result("read-1", delivered, { snapshot })),
		].join("\n");
		const input = {
			attempt: {
				kind: "session",
				caseId: "case-a",
				id: "attempt-a",
				model: "sonnet",
				outcome: "SUCCESSFUL",
				corpusFiles: [],
			},
			resolvedCorpusFiles: [],
			transcript,
			prefixLinesExcluded: 0,
		} as const;

		const detail = sessionHistoryDetail(input, "2:1");
		if (detail === undefined) {
			throw new Error("Expected selected Read detail");
		}

		expect(detail.applicationTruncated).toBe(true);
		expect(detail.deliveredText).toBe("a".repeat(half - 1));
		expect(detail.sourceSnapshot).toBe("b".repeat(half - 1));
		expect(
			Buffer.byteLength(detail.deliveredText ?? "", "utf8") +
				Buffer.byteLength(detail.sourceSnapshot ?? "", "utf8"),
		).toBeLessThanOrEqual(MAX_EVENT_DETAIL_BYTES);
		expect(delivered.startsWith(detail.deliveredText ?? "missing")).toBe(true);
		expect(snapshot.startsWith(detail.sourceSnapshot ?? "missing")).toBe(true);
	});

	it("marks an incomplete structured Read line range as partial coverage", () => {
		const transcript = [
			row(call("read-1", "Read", { file_path: "/work/CLAUDE.md" })),
			row(
				result("read-1", "delivered", {
					snapshot: "middle line",
					startLine: 3,
					numLines: 1,
					totalLines: 8,
				}),
			),
		].join("\n");
		const detail = sessionHistoryDetail(
			{
				attempt: {
					kind: "session",
					caseId: "case-a",
					id: "attempt-a",
					model: "sonnet",
					outcome: "SUCCESSFUL",
					corpusFiles: [],
				},
				resolvedCorpusFiles: [],
				transcript,
				prefixLinesExcluded: 0,
			},
			"2:1",
		);

		expect(detail?.snapshotMeasurement).toEqual({
			state: "partial",
			observedCharacters: 11,
			reasons: ["source snapshot is a partial line range"],
		});
		expect(detail?.sourceSnapshotRange).toEqual({
			startLine: 3,
			deliveredLineCount: 1,
			totalLineCount: 8,
			coverage: "partial",
		});
	});
});

describe(sessionHistoryRequestSeries.name, () => {
	function assistantRow(
		second: string,
		requestId: string | null | undefined,
		model: string,
		usage: {
			readonly input: number;
			readonly output: number;
			readonly cacheRead: number;
			readonly cacheWrite: number;
		},
	): JsonValue {
		const message = {
			model,
			usage: {
				input_tokens: usage.input,
				output_tokens: usage.output,
				cache_read_input_tokens: usage.cacheRead,
				cache_creation_input_tokens: usage.cacheWrite,
			},
			content: [{ type: "text", text: "reply" }],
		} satisfies JsonValue;
		const withoutRequestId = {
			type: "assistant",
			timestamp: `2026-09-14T00:00:0${second}.000Z`,
			cwd: "/work",
			message,
		} satisfies JsonValue;
		if (requestId === undefined) {
			return withoutRequestId;
		}

		return { ...withoutRequestId, requestId };
	}

	it("marks each entry with the region its line falls in", () => {
		const usage = { input: 2, output: 10, cacheRead: 100, cacheWrite: 20 };
		const transcript = [
			row(assistantRow("1", "req-inherited", "claude-opus-5", usage)),
			row(assistantRow("2", "req-attempt", "claude-sonnet-5", usage)),
		].join("\n");

		const series = sessionHistoryRequestSeries({
			transcript,
			prefixLinesExcluded: 1,
		});

		expect(
			series.entries.map(({ requestId, region }) => ({ requestId, region })),
		).toEqual([
			{ requestId: "req-inherited", region: "starting-context" },
			{ requestId: "req-attempt", region: "attempt" },
		]);
	});

	it("reports totals unavailable rather than zero when the transcript is absent", () => {
		const series = sessionHistoryRequestSeries({
			transcript: undefined,
			prefixLinesExcluded: 1268,
		});

		expect(series.boundary).toBe("known");
		expect(series.entries).toEqual([]);
		expect(series.attemptTotals).toEqual({
			state: "unavailable",
			reasons: ["the attempt has no saved transcript"],
		});
	});

	it("marks every entry boundary-unknown when the transcript carries no boundary", () => {
		const usage = { input: 2, output: 10, cacheRead: 100, cacheWrite: 20 };
		const transcript = [
			row(assistantRow("1", "req-a", "claude-opus-5", usage)),
			row(assistantRow("2", "req-b", "claude-sonnet-5", usage)),
		].join("\n");

		const series = sessionHistoryRequestSeries({
			transcript,
			prefixLinesExcluded: undefined,
		});

		expect(series.boundary).toBe("unknown");
		expect(series.entries.map(({ region }) => region)).toEqual([
			"boundary-unknown",
			"boundary-unknown",
		]);
	});

	it("totals only the requests inside the attempt region", () => {
		const transcript = [
			row(
				assistantRow("1", "req-inherited", "claude-opus-5", {
					input: 7,
					output: 90_592,
					cacheRead: 5,
					cacheWrite: 9,
				}),
			),
			row(
				assistantRow("2", "req-attempt", "claude-sonnet-5", {
					input: 2,
					output: 151,
					cacheRead: 0,
					cacheWrite: 251_695,
				}),
			),
		].join("\n");

		const series = sessionHistoryRequestSeries({
			transcript,
			prefixLinesExcluded: 1,
		});

		expect(series.boundary).toBe("known");
		expect(series.attemptTotals).toEqual({
			state: "complete",
			requestCount: 1,
			usage: {
				inputTokens: 2,
				outputTokens: 151,
				cacheReadTokens: 0,
				cacheWriteTokens: 251_695,
			},
			totalInputTokens: 251_697,
		});
	});

	it("reports attempt totals unavailable rather than zero when the boundary is unknown", () => {
		const transcript = row(
			assistantRow("1", "req-a", "claude-opus-5", {
				input: 2,
				output: 151,
				cacheRead: 0,
				cacheWrite: 251_695,
			}),
		);

		const series = sessionHistoryRequestSeries({
			transcript,
			prefixLinesExcluded: undefined,
		});

		expect(series.attemptTotals).toEqual({
			state: "unavailable",
			reasons: ["the transcript carries no attempt boundary"],
		});
	});

	it("marks attempt totals incomplete when a request in the region has no settled usage", () => {
		const transcript = [
			row(
				assistantRow("1", "req-conflict", "claude-sonnet-5", {
					input: 2,
					output: 10,
					cacheRead: 0,
					cacheWrite: 20,
				}),
			),
			row(
				assistantRow("2", "req-conflict", "claude-sonnet-5", {
					input: 3,
					output: 10,
					cacheRead: 0,
					cacheWrite: 20,
				}),
			),
			row(
				assistantRow("3", "req-settled", "claude-sonnet-5", {
					input: 2,
					output: 151,
					cacheRead: 0,
					cacheWrite: 251_695,
				}),
			),
		].join("\n");

		const series = sessionHistoryRequestSeries({
			transcript,
			prefixLinesExcluded: 0,
		});

		expect(series.attemptTotals).toEqual({
			state: "incomplete",
			requestCount: 2,
			countedRequestCount: 1,
			usage: {
				inputTokens: 2,
				outputTokens: 151,
				cacheReadTokens: 0,
				cacheWriteTokens: 251_695,
			},
			totalInputTokens: 251_697,
			reasons: ["1 of 2 attempt-region requests carry no settled usage"],
		});
	});

	it("carries the cache-write TTL split the row reports", () => {
		const transcript = row({
			type: "assistant",
			timestamp: "2026-09-14T00:00:01.000Z",
			cwd: "/work",
			requestId: "req-a",
			message: {
				model: "claude-sonnet-5",
				usage: {
					input_tokens: 2,
					output_tokens: 151,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: 251_695,
					cache_creation: {
						ephemeral_1h_input_tokens: 251_695,
						ephemeral_5m_input_tokens: 0,
					},
				},
				content: [{ type: "text", text: "reply" }],
			},
		});

		const series = sessionHistoryRequestSeries({
			transcript,
			prefixLinesExcluded: 0,
		});

		const [entry] = series.entries;

		expect(entry?.usageState === "complete" && entry.cacheWriteSplit).toEqual({
			state: "complete",
			fiveMinuteTokens: 0,
			oneHourTokens: 251_695,
		});
	});

	it("reports the TTL split missing when the row omits it", () => {
		const series = sessionHistoryRequestSeries({
			transcript: row(
				assistantRow("1", "req-a", "claude-sonnet-5", {
					input: 2,
					output: 151,
					cacheRead: 0,
					cacheWrite: 251_695,
				}),
			),
			prefixLinesExcluded: 0,
		});

		const [entry] = series.entries;

		expect(entry?.usageState === "complete" && entry.cacheWriteSplit).toEqual({
			state: "missing",
			reasons: ["the row reports no cache-creation TTL split"],
		});
	});

	it("keeps a request whose TTL split reports only one tier, marking the split missing", () => {
		const transcript = row({
			type: "assistant",
			timestamp: "2026-09-14T00:00:01.000Z",
			cwd: "/work",
			requestId: "req-a",
			message: {
				model: "claude-sonnet-5",
				usage: {
					input_tokens: 2,
					output_tokens: 151,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: 251_695,
					cache_creation: { ephemeral_5m_input_tokens: 251_695 },
				},
				content: [{ type: "text", text: "reply" }],
			},
		});

		const series = sessionHistoryRequestSeries({
			transcript,
			prefixLinesExcluded: 0,
		});

		const [entry] = series.entries;

		expect(series.entries).toHaveLength(1);
		expect(entry?.usageState === "complete" && entry.usage.outputTokens).toBe(
			151,
		);
		expect(entry?.usageState === "complete" && entry.cacheWriteSplit).toEqual({
			state: "missing",
			reasons: ["the row's cache-creation TTL split is unreadable"],
		});
	});

	it("reports the TTL split in conflict when it disagrees with cache-write usage", () => {
		const transcript = row({
			type: "assistant",
			timestamp: "2026-09-14T00:00:01.000Z",
			cwd: "/work",
			requestId: "req-a",
			message: {
				model: "claude-sonnet-5",
				usage: {
					input_tokens: 2,
					output_tokens: 151,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: 251_695,
					cache_creation: {
						ephemeral_1h_input_tokens: 1,
						ephemeral_5m_input_tokens: 1,
					},
				},
				content: [{ type: "text", text: "reply" }],
			},
		});

		const series = sessionHistoryRequestSeries({
			transcript,
			prefixLinesExcluded: 0,
		});

		const [entry] = series.entries;

		expect(entry?.usageState === "complete" && entry.cacheWriteSplit).toEqual({
			state: "conflict",
			reasons: ["the TTL split totals 2 against 251695 cache-write tokens"],
		});
	});

	it("yields one entry per distinct request in transcript order", () => {
		const transcript = [
			row(
				assistantRow("1", "req-b", "claude-opus-5", {
					input: 2,
					output: 10,
					cacheRead: 100,
					cacheWrite: 20,
				}),
			),
			row(
				assistantRow("2", "req-a", "claude-sonnet-5", {
					input: 3,
					output: 11,
					cacheRead: 200,
					cacheWrite: 30,
				}),
			),
		].join("\n");

		const series = sessionHistoryRequestSeries({
			transcript,
			prefixLinesExcluded: 0,
		});

		expect(
			series.entries.map((entry) => ({
				requestId: entry.requestId,
				model: entry.model,
				usage: entry.usageState === "complete" ? entry.usage : undefined,
			})),
		).toEqual([
			{
				requestId: "req-b",
				model: "claude-opus-5",
				usage: {
					inputTokens: 2,
					outputTokens: 10,
					cacheReadTokens: 100,
					cacheWriteTokens: 20,
				},
			},
			{
				requestId: "req-a",
				model: "claude-sonnet-5",
				usage: {
					inputTokens: 3,
					outputTokens: 11,
					cacheReadTokens: 200,
					cacheWriteTokens: 30,
				},
			},
		]);
	});
	it("collapses duplicate rows sharing a request into one entry", () => {
		const usage = { input: 2, output: 10, cacheRead: 100, cacheWrite: 20 };
		const transcript = [
			row(assistantRow("1", "req-a", "claude-opus-5", usage)),
			row(assistantRow("2", "req-a", "claude-opus-5", usage)),
			row(assistantRow("3", "req-a", "claude-opus-5", usage)),
		].join("\n");

		const series = sessionHistoryRequestSeries({
			transcript,
			prefixLinesExcluded: 0,
		});

		expect(
			series.entries.map(({ requestId, line, usageState }) => ({
				requestId,
				line,
				usageState,
			})),
		).toEqual([{ requestId: "req-a", line: 1, usageState: "complete" }]);
	});

	it.each([
		["input", { input: 5, output: 10, cacheRead: 100, cacheWrite: 20 }],
		["output", { input: 2, output: 11, cacheRead: 100, cacheWrite: 20 }],
		["cache read", { input: 2, output: 10, cacheRead: 101, cacheWrite: 20 }],
		["cache write", { input: 2, output: 10, cacheRead: 100, cacheWrite: 21 }],
	])(
		"reports conflict when duplicates disagree on %s tokens",
		(_category, second) => {
			const transcript = [
				row(
					assistantRow("1", "req-a", "claude-opus-5", {
						input: 2,
						output: 10,
						cacheRead: 100,
						cacheWrite: 20,
					}),
				),
				row(assistantRow("2", "req-a", "claude-opus-5", second)),
			].join("\n");

			const series = sessionHistoryRequestSeries({
				transcript,
				prefixLinesExcluded: 0,
			});

			expect(series.entries).toEqual([
				{
					requestId: "req-a",
					line: 1,
					region: "attempt",
					model: "claude-opus-5",
					usageState: "conflict",
				},
			]);
		},
	);

	it("withholds the model when duplicates disagree on which one ran", () => {
		const usage = { input: 2, output: 10, cacheRead: 100, cacheWrite: 20 };
		const transcript = [
			row(assistantRow("1", "req-a", "claude-opus-5", usage)),
			row(assistantRow("2", "req-a", "claude-haiku-4-5", usage)),
		].join("\n");

		const series = sessionHistoryRequestSeries({
			transcript,
			prefixLinesExcluded: 0,
		});

		expect(series.entries).toEqual([
			{
				requestId: "req-a",
				line: 1,
				region: "attempt",
				model: undefined,
				modelState: "conflict",
				usage: {
					inputTokens: 2,
					outputTokens: 10,
					cacheReadTokens: 100,
					cacheWriteTokens: 20,
				},
				totalInputTokens: 122,
				cumulativeTotalInputTokens: 122,
				usageState: "complete",
				cacheWriteSplit: {
					state: "missing",
					reasons: ["the row reports no cache-creation TTL split"],
				},
			},
		]);
	});
	it("totals the three input categories as total input tokens", () => {
		const transcript = row(
			assistantRow("1", "req-a", "claude-opus-5", {
				input: 2,
				output: 151,
				cacheRead: 30_000,
				cacheWrite: 251_695,
			}),
		);

		const series = sessionHistoryRequestSeries({
			transcript,
			prefixLinesExcluded: 0,
		});

		const [entry] = series.entries;

		expect(entry?.usageState).toBe("complete");
		expect(entry?.usageState === "complete" && entry.totalInputTokens).toBe(
			281_697,
		);
	});

	it.each([
		["absent from the row", undefined],
		["present and null", null],
	])(
		"values a row whose requestId is %s at zero rather than omitting it",
		(_label, requestId) => {
			const transcript = [
				row(
					assistantRow("1", requestId, "<synthetic>", {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
					}),
				),
				row(
					assistantRow("2", "req-a", "claude-sonnet-5", {
						input: 2,
						output: 151,
						cacheRead: 0,
						cacheWrite: 251_695,
					}),
				),
			].join("\n");

			const series = sessionHistoryRequestSeries({
				transcript,
				prefixLinesExcluded: 0,
			});

			expect(
				series.entries.map((entry) => ({
					requestId: entry.requestId,
					model: entry.model,
					totalInputTokens:
						entry.usageState === "complete"
							? entry.totalInputTokens
							: undefined,
				})),
			).toEqual([
				{ requestId: undefined, model: "<synthetic>", totalInputTokens: 0 },
				{
					requestId: "req-a",
					model: "claude-sonnet-5",
					totalInputTokens: 251_697,
				},
			]);
		},
	);

	it("names what the total omits without claiming the categories overlap", () => {
		const series = sessionHistoryRequestSeries({
			transcript: row(
				assistantRow("1", "req-a", "claude-opus-5", {
					input: 2,
					output: 151,
					cacheRead: 0,
					cacheWrite: 251_695,
				}),
			),
			prefixLinesExcluded: 0,
		});

		expect(series.name).toBe("total input tokens");
		expect(series.omits).toEqual([
			"the request's own output tokens",
			"the model's context window limit, which the transcript does not carry",
		]);
		expect(series.measuresActiveContextWindow).toBe(false);
	});

	describe("when the transcript arrives as lines", () => {
		const openHandles: FileHandle[] = [];
		const roots: string[] = [];

		afterEach(async () => {
			for (const handle of openHandles.splice(0)) {
				await handle.close();
			}
			await Promise.all(
				roots
					.splice(0)
					.map((root) => rm(root, { force: true, recursive: true })),
			);
		});

		async function linesOf(contents: string): Promise<AsyncIterable<string>> {
			const root = await mkdtemp(join(tmpdir(), "rehearse-series-lines-"));
			roots.push(root);
			const path = join(root, "transcript.jsonl");
			await Bun.write(path, contents);
			const handle = await open(path);
			openHandles.push(handle);

			return handle.readLines({ autoClose: false });
		}

		const multiRequestTranscript = [
			row(
				assistantRow("1", "req-inherited", "claude-opus-5", {
					input: 2,
					output: 10,
					cacheRead: 100,
					cacheWrite: 20,
				}),
			),
			"",
			row(
				assistantRow("2", "req-attempt", "claude-sonnet-5", {
					input: 3,
					output: 151,
					cacheRead: 200,
					cacheWrite: 251_695,
				}),
			),
			row(
				assistantRow("3", "req-attempt-2", "claude-sonnet-5", {
					input: 5,
					output: 7,
					cacheRead: 300,
					cacheWrite: 40,
				}),
			),
		].join("\n");

		it("builds the same series the string input builds", async () => {
			const streamed = await sessionHistoryRequestSeriesFromLines(
				{ prefixLinesExcluded: 1 },
				await linesOf(`${multiRequestTranscript}\n`),
			);

			expect(streamed).toEqual(
				sessionHistoryRequestSeries({
					transcript: multiRequestTranscript,
					prefixLinesExcluded: 1,
				}),
			);
		});

		it("reads a final line carrying no trailing newline as the same entry", async () => {
			const withoutNewline = await sessionHistoryRequestSeriesFromLines(
				{ prefixLinesExcluded: 1 },
				await linesOf(multiRequestTranscript),
			);

			expect(withoutNewline.entries).toEqual(
				sessionHistoryRequestSeries({
					transcript: multiRequestTranscript,
					prefixLinesExcluded: 1,
				}).entries,
			);
		});

		it("reads a transcript written with carriage-return line endings", async () => {
			const crlf = await linesOf(
				`${multiRequestTranscript.replaceAll("\n", "\r\n")}\r\n`,
			);

			const streamed = await sessionHistoryRequestSeriesFromLines(
				{ prefixLinesExcluded: 1 },
				crlf,
			);

			expect(streamed.entries).toEqual(
				sessionHistoryRequestSeries({
					transcript: multiRequestTranscript,
					prefixLinesExcluded: 1,
				}).entries,
			);
		});

		it("counts an empty saved transcript as zero requests, not as an absent one", async () => {
			const series = await sessionHistoryRequestSeriesFromLines(
				{ prefixLinesExcluded: 1268 },
				await linesOf(""),
			);

			expect(series.transcriptState).toBe("saved");
			expect(series.entries).toEqual([]);
			expect(series.attemptTotals).toEqual({
				state: "complete",
				requestCount: 0,
				usage: {
					inputTokens: 0,
					outputTokens: 0,
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
				},
				totalInputTokens: 0,
			});
		});
	});
});

describe("compaction in a request series", () => {
	function assistant(
		requestId: string,
		timestamp: string,
		tokens: number,
	): string {
		return row({
			type: "assistant",
			timestamp,
			cwd: "/work",
			requestId,
			message: {
				model: "claude-sonnet-5",
				usage: {
					input_tokens: tokens,
					output_tokens: 1,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: 0,
					cache_creation: {
						ephemeral_1h_input_tokens: 0,
						ephemeral_5m_input_tokens: 0,
					},
				},
				content: [{ type: "text", text: "reply" }],
			},
		});
	}

	const withCompaction = [
		assistant("req-1", "2026-09-14T00:00:01.000Z", 100),
		row({
			type: "system",
			subtype: "compact_boundary",
			timestamp: "2026-09-14T00:00:02.000Z",
			cwd: "/work",
			compactMetadata: { trigger: "auto", preTokens: 101 },
		}),
		assistant("req-2", "2026-09-14T00:00:03.000Z", 20),
	].join("\n");

	it("continues cumulative usage across a compaction without resetting", () => {
		const series = sessionHistoryRequestSeries({
			transcript: withCompaction,
			prefixLinesExcluded: 0,
		});

		expect(
			series.entries.map((entry) =>
				entry.usageState === "complete"
					? entry.cumulativeTotalInputTokens
					: undefined,
			),
		).toEqual([100, 120]);
	});

	it("counts inherited requests in the running total of an attempt-region row", () => {
		const series = sessionHistoryRequestSeries({
			transcript: [
				assistant("req-1", "2026-09-14T00:00:01.000Z", 100),
				assistant("req-2", "2026-09-14T00:00:03.000Z", 20),
			].join("\n"),
			prefixLinesExcluded: 1,
		});

		expect(
			series.entries.map((entry) => ({
				region: entry.region,
				cumulative:
					entry.usageState === "complete"
						? entry.cumulativeTotalInputTokens
						: undefined,
			})),
		).toEqual([
			{ region: "starting-context", cumulative: 100 },
			{ region: "attempt", cumulative: 120 },
		]);
	});

	it("marks the compaction on the series", () => {
		const series = sessionHistoryRequestSeries({
			transcript: withCompaction,
			prefixLinesExcluded: 0,
		});

		expect(series.compactions).toEqual([
			{ line: 2, trigger: "auto", region: "attempt" },
		]);
	});

	it("places a compaction in the inherited prefix outside the attempt region", () => {
		const series = sessionHistoryRequestSeries({
			transcript: withCompaction,
			prefixLinesExcluded: 2,
		});

		expect(series.compactions).toEqual([
			{ line: 2, trigger: "auto", region: "starting-context" },
		]);
	});

	it("reports no compactions for a transcript that carries none", () => {
		const series = sessionHistoryRequestSeries({
			transcript: assistant("req-1", "2026-09-14T00:00:01.000Z", 100),
			prefixLinesExcluded: 0,
		});

		expect(series.compactions).toEqual([]);
	});
});

describe(sessionHistoryAttemptCost.name, () => {
	const rates = {
		schemaVersion: 1,
		source: "test catalog",
		version: "2026-09-15",
		currency: "USD",
		provenance: syntheticRateProvenance,
		models: [
			{
				model: "claude-sonnet-5",
				inputUsdPerMillion: 3,
				outputUsdPerMillion: 15,
				cacheReadUsdPerMillion: 0.3,
				cacheWrite5mUsdPerMillion: 3.75,
				cacheWrite1hUsdPerMillion: 4,
			},
		],
	} as const;

	const bothModels = {
		...rates,
		models: [
			...rates.models,
			{
				model: "claude-opus-5",
				inputUsdPerMillion: 15,
				outputUsdPerMillion: 15,
				cacheReadUsdPerMillion: 1.5,
				cacheWrite5mUsdPerMillion: 18.75,
				cacheWrite1hUsdPerMillion: 30,
			},
		],
	} as const;

	function seriesWith(
		prefixLinesExcluded: number | undefined,
	): SessionHistoryRequestSeries {
		const transcript = [
			row({
				type: "assistant",
				timestamp: "2026-09-14T00:00:01.000Z",
				cwd: "/work",
				requestId: "req-inherited",
				message: {
					model: "claude-opus-5",
					usage: {
						input_tokens: 7,
						output_tokens: 90_592,
						cache_read_input_tokens: 5,
						cache_creation_input_tokens: 9,
						cache_creation: {
							ephemeral_1h_input_tokens: 9,
							ephemeral_5m_input_tokens: 0,
						},
					},
					content: [{ type: "text", text: "reply" }],
				},
			}),
			row({
				type: "assistant",
				timestamp: "2026-09-14T00:00:02.000Z",
				cwd: "/work",
				requestId: "req-attempt",
				message: {
					model: "claude-sonnet-5",
					usage: {
						input_tokens: 2,
						output_tokens: 151,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 251_695,
						cache_creation: {
							ephemeral_1h_input_tokens: 251_695,
							ephemeral_5m_input_tokens: 0,
						},
					},
					content: [{ type: "text", text: "reply" }],
				},
			}),
		].join("\n");

		return sessionHistoryRequestSeries({ transcript, prefixLinesExcluded });
	}

	it("prices each attempt-region request with the reading the sum counts", () => {
		const series = seriesWith(1);

		const costs = sessionHistoryRequestCosts(series, bothModels);

		const attemptRequestCost = (2 * 3 + 151 * 15 + 251_695 * 4) / 1_000_000;
		expect(costs.get(2)).toEqual({
			state: "priced",
			costUsd: attemptRequestCost,
		});
		expect(
			sessionHistoryAttemptCost({
				series,
				reportedCostUsd: undefined,
				rates: bothModels,
			}).calculated,
		).toEqual({ state: "complete", costUsd: attemptRequestCost });
	});

	it("names why a request is unpriced rather than pricing it at zero", () => {
		const series = seriesWith(0);

		const costs = sessionHistoryRequestCosts(series, rates);

		expect(costs.get(1)).toEqual({
			state: "unpriced",
			reason: UNPRICED_REASONS["rates-missing"],
		});
	});

	it("leaves a starting-context request out of the per-request pricing", () => {
		const series = seriesWith(1);

		const costs = sessionHistoryRequestCosts(series, bothModels);

		expect(costs.has(1)).toBe(false);
	});

	it("reports provider, calculated and difference as three readings", () => {
		const cost = sessionHistoryAttemptCost({
			series: seriesWith(1),
			reportedCostUsd: 1.008294,
			rates,
		});

		expect(cost.reported).toEqual({ state: "complete", costUsd: 1.008294 });
		expect(cost.calculated.state).toBe("complete");
		expect(
			cost.calculated.state === "complete" && cost.calculated.costUsd,
		).toBeCloseTo(1.009051, 6);
		expect(cost.difference.state).toBe("complete");
		expect(
			cost.difference.state === "complete" && cost.difference.costUsd,
		).toBeCloseTo(-0.000757, 6);
	});

	it("prices a zero-usage row at zero without a catalogued rate", () => {
		const transcript = [
			row({
				type: "assistant",
				timestamp: "2026-09-14T00:00:01.000Z",
				cwd: "/work",
				requestId: "req-attempt",
				message: {
					model: "claude-sonnet-5",
					usage: {
						input_tokens: 2,
						output_tokens: 151,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 251_695,
						cache_creation: {
							ephemeral_1h_input_tokens: 251_695,
							ephemeral_5m_input_tokens: 0,
						},
					},
					content: [{ type: "text", text: "reply" }],
				},
			}),
			row({
				type: "assistant",
				timestamp: "2026-09-14T00:00:02.000Z",
				cwd: "/work",
				message: {
					model: "<synthetic>",
					usage: {
						input_tokens: 0,
						output_tokens: 0,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 0,
						cache_creation: {
							ephemeral_1h_input_tokens: 0,
							ephemeral_5m_input_tokens: 0,
						},
					},
					content: [{ type: "text", text: "api error" }],
				},
			}),
		].join("\n");

		const cost = sessionHistoryAttemptCost({
			series: sessionHistoryRequestSeries({
				transcript,
				prefixLinesExcluded: 0,
			}),
			reportedCostUsd: 1.008294,
			rates,
		});

		expect(cost.calculated.state).toBe("complete");
		expect(
			cost.calculated.state === "complete" && cost.calculated.costUsd,
		).toBeCloseTo(1.009051, 6);
	});

	it("prices only the attempt region, leaving inherited requests out", () => {
		const confined = sessionHistoryAttemptCost({
			series: seriesWith(1),
			reportedCostUsd: 1.008294,
			rates: bothModels,
		});
		const wholeTranscript = sessionHistoryAttemptCost({
			series: seriesWith(0),
			reportedCostUsd: 1.008294,
			rates: bothModels,
		});

		expect(
			confined.calculated.state === "complete" && confined.calculated.costUsd,
		).toBeCloseTo(1.009051, 6);
		expect(
			wholeTranscript.calculated.state === "complete" &&
				wholeTranscript.calculated.costUsd,
		).toBeCloseTo(2.3683135, 6);
	});

	it("reports the calculated reading unavailable rather than zero when the transcript is absent", () => {
		const cost = sessionHistoryAttemptCost({
			series: sessionHistoryRequestSeries({
				transcript: undefined,
				prefixLinesExcluded: 1268,
			}),
			reportedCostUsd: 0.039296,
			rates,
		});

		expect(cost.calculated).toEqual({
			state: "unavailable",
			reasons: ["the attempt has no saved transcript"],
		});
		expect(cost.difference).toEqual({
			state: "unavailable",
			reasons: ["the calculated reading is unavailable"],
		});
	});

	it("reports the calculated reading unavailable rather than zero without rates", () => {
		const cost = sessionHistoryAttemptCost({
			series: seriesWith(1),
			reportedCostUsd: 1.008294,
			rates: undefined,
		});

		expect(cost.calculated).toEqual({
			state: "unavailable",
			reasons: ["no rate catalog was supplied"],
		});
		expect(cost.difference).toEqual({
			state: "unavailable",
			reasons: ["the calculated reading is unavailable"],
		});
	});

	it("leaves the provider reading complete while the boundary is unknown", () => {
		const cost = sessionHistoryAttemptCost({
			series: seriesWith(undefined),
			reportedCostUsd: 1.008294,
			rates,
		});

		expect(cost.reported).toEqual({ state: "complete", costUsd: 1.008294 });
		expect(cost.calculated).toEqual({
			state: "unavailable",
			reasons: ["the transcript carries no attempt boundary"],
		});
		expect(cost.difference).toEqual({
			state: "unavailable",
			reasons: ["the calculated reading is unavailable"],
		});
	});

	it("refuses to price a request whose usage is in conflict", () => {
		const conflicted = [
			row({
				type: "assistant",
				timestamp: "2026-09-14T00:00:01.000Z",
				cwd: "/work",
				requestId: "req-conflict",
				message: {
					model: "claude-sonnet-5",
					usage: {
						input_tokens: 2,
						output_tokens: 10,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 20,
						cache_creation: {
							ephemeral_1h_input_tokens: 20,
							ephemeral_5m_input_tokens: 0,
						},
					},
					content: [{ type: "text", text: "reply" }],
				},
			}),
			row({
				type: "assistant",
				timestamp: "2026-09-14T00:00:02.000Z",
				cwd: "/work",
				requestId: "req-conflict",
				message: {
					model: "claude-sonnet-5",
					usage: {
						input_tokens: 3,
						output_tokens: 10,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 20,
						cache_creation: {
							ephemeral_1h_input_tokens: 20,
							ephemeral_5m_input_tokens: 0,
						},
					},
					content: [{ type: "text", text: "reply" }],
				},
			}),
			row({
				type: "assistant",
				timestamp: "2026-09-14T00:00:03.000Z",
				cwd: "/work",
				requestId: "req-priced",
				message: {
					model: "claude-sonnet-5",
					usage: {
						input_tokens: 2,
						output_tokens: 151,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 251_695,
						cache_creation: {
							ephemeral_1h_input_tokens: 251_695,
							ephemeral_5m_input_tokens: 0,
						},
					},
					content: [{ type: "text", text: "reply" }],
				},
			}),
		].join("\n");

		const cost = sessionHistoryAttemptCost({
			series: sessionHistoryRequestSeries({
				transcript: conflicted,
				prefixLinesExcluded: 0,
			}),
			reportedCostUsd: 1.008294,
			rates,
		});

		expect(cost.calculated).toEqual({
			state: "incomplete",
			costUsd: 1.009051,
			pricedRequestCount: 1,
			requestCount: 2,
			reasons: ["usage is in conflict"],
		});
		expect(cost.difference).toEqual({
			state: "incomplete",
			costUsd: 1.008294 - 1.009051,
			pricedRequestCount: 1,
			requestCount: 2,
			reasons: [
				"a reading it is drawn from is incomplete",
				"usage is in conflict",
			],
		});
	});

	it("reports the provider reading unavailable rather than zero when absent", () => {
		const cost = sessionHistoryAttemptCost({
			series: seriesWith(1),
			reportedCostUsd: undefined,
			rates,
		});

		expect(cost.reported).toEqual({
			state: "unavailable",
			reasons: ["the attempt record carries no provider cost"],
		});
		expect(cost.difference).toEqual({
			state: "unavailable",
			reasons: ["the provider reading is unavailable"],
		});
	});
});

describe(stageCorpusReconciliation.name, () => {
	it("reports a declared file the transcript shows being read as observed", () => {
		const report = sessionHistoryReport({
			attempt: {
				kind: "stage",
				caseId: "case-a",
				run: "run-1",
				stage: "shape",
				lineage: "lineage-1",
				upstream: "upstream-1",
				model: "sonnet",
				corpusFiles: [
					{ path: "CLAUDE.md", sha256: "a".repeat(64) },
					{ path: "skills/build/SKILL.md", sha256: "b".repeat(64) },
				],
			},
			resolvedCorpusFiles: [],
			transcript: [
				row(
					callIn("/wt", "read-1", "Read", {
						file_path: "/home/someone/.claude/CLAUDE.md",
					}),
				),
				row(resultIn("/wt", "read-1", "instructions")),
				row(
					callIn("/wt", "read-2", "Read", {
						file_path: "/home/someone/.claude/agents/reviewer.md",
					}),
				),
				row(resultIn("/wt", "read-2", "reviewer")),
			].join("\n"),
			prefixLinesExcluded: 0,
		});

		expect(stageCorpusReconciliation(report)).toEqual([
			{
				path: "CLAUDE.md",
				state: "observed",
				firstLocator: { line: 1, block: 1 },
			},
			{ path: "skills/build/SKILL.md", state: "no-observation-recorded" },
			{
				path: "agents/reviewer.md",
				state: "undeclared",
				firstLocator: { line: 3, block: 1 },
			},
		]);
	});

	it("leaves a non-layout file under the worktree .claude out of the reconciliation", () => {
		const report = sessionHistoryReport({
			attempt: {
				kind: "stage",
				caseId: "case-a",
				run: "run-1",
				stage: "shape",
				lineage: "lineage-1",
				upstream: "upstream-1",
				model: "sonnet",
				corpusFiles: [],
			},
			resolvedCorpusFiles: [],
			transcript: [
				row(
					callIn("/wt", "settings", "Read", {
						file_path: "/wt/.claude/settings.json",
					}),
				),
				row(resultIn("/wt", "settings", "{}")),
			].join("\n"),
			prefixLinesExcluded: 0,
		});

		expect(stageCorpusReconciliation(report)).toEqual([]);
	});

	it("reconciles nothing for a session attempt, whose corpus is resolved to real paths", () => {
		const report = sessionHistoryReport({
			attempt: {
				kind: "session",
				caseId: "case-a",
				id: "attempt-a",
				model: "sonnet",
				outcome: "SUCCESSFUL",
				corpusFiles: [],
			},
			resolvedCorpusFiles: [],
			transcript: undefined,
			prefixLinesExcluded: 0,
		});

		expect(stageCorpusReconciliation(report)).toEqual([]);
	});

	it("records no observation rather than absence when a stage kept no transcript", () => {
		const report = sessionHistoryReport({
			attempt: {
				kind: "stage",
				caseId: "case-a",
				run: "run-1",
				stage: "shape",
				lineage: "lineage-1",
				upstream: "upstream-1",
				model: "sonnet",
				corpusFiles: [{ path: "CLAUDE.md", sha256: "a".repeat(64) }],
			},
			resolvedCorpusFiles: [],
			transcript: undefined,
			prefixLinesExcluded: 0,
			unavailableReason: "no-capture-recorded",
		});

		expect(stageCorpusReconciliation(report)).toEqual([
			{ path: "CLAUDE.md", state: "no-observation-recorded" },
		]);
	});
});
