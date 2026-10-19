import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { caseRelative, casesRoot, transcriptPrefixPath } from "#benchmark/case";
import { CONTROL_DIR } from "#benchmark/config";

const declaration = {
	finalRubric: "rubric.md",
	id: "audit-log",
	kind: "pipeline",
	pipeline: "pipelines/default.json",
	productBrief: "product-brief.md",
	rubrics: "rubrics",
	target: { path: "/target" },
	task: "backlog-seed.md",
	title: "Audit log",
} as const;

const refusesSWhichLeavesTheCaseDirectoryCases = [
	"/etc/passwd",
	"../../CLAUDE.md",
	"rubrics/../../CLAUDE.md",
];

const refusesATranscriptAtSWhichLeavesTheCaseDirectoryCases = [
	"../../../../../../etc/passwd",
	"/etc/passwd",
	"../audit-log/x.jsonl",
];

function resolvesAPathInsideTheCaseDirectoryAgainstIt(): void {
	expect(caseRelative(declaration, "rubrics/shape.json")).toBe(
		join(CONTROL_DIR, "cases/audit-log/rubrics/shape.json"),
	);
}

function resolvesADeclaredFileUnderTheCaseSOwnCommittedDirectory(): void {
	expect(transcriptPrefixPath("smoke", "prefix.jsonl")).toBe(
		join(casesRoot(), "smoke", "prefix.jsonl"),
	);
}

describe(caseRelative.name, () => {
	it.each(refusesSWhichLeavesTheCaseDirectoryCases)(
		"refuses %s, which leaves the case directory",
		(path) => {
			expect(() => caseRelative(declaration, path)).toThrow(
				`Case audit-log names a path outside its case directory: ${path}`,
			);
		},
	);
	it(
		"resolves a path inside the case directory against it",
		resolvesAPathInsideTheCaseDirectoryAgainstIt,
	);
});

describe(transcriptPrefixPath.name, () => {
	it(
		"resolves a declared file under the case's own committed directory",
		resolvesADeclaredFileUnderTheCaseSOwnCommittedDirectory,
	);
	it.each(refusesATranscriptAtSWhichLeavesTheCaseDirectoryCases)(
		"refuses a transcript at %s, which leaves the case directory",
		(file) => {
			expect(() => transcriptPrefixPath("smoke", file)).toThrow(
				`Case smoke names a transcript outside its case directory: ${file}`,
			);
		},
	);
});
