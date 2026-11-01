import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { CliTestWorkspace, failureOf } from "#cli/cli-test-support";

import { CaseDeclarationError, parseCaseDeclaration } from "./case-declaration";
import { loadSessionCase } from "./case-loader";
import { CaseDeclarationBuilder } from "./case-test-fixtures";

const workspace = CliTestWorkspace.forEachTest();

function declaration(): ReturnType<typeof parseCaseDeclaration> & {
	readonly kind: "session";
} {
	const parsed = parseCaseDeclaration(
		"smoke",
		new CaseDeclarationBuilder({
			judge: { rubric: "quality.md" },
		}).sessionJson(),
	);
	if (parsed.kind !== "session") {
		throw new Error("Expected session declaration");
	}
	return parsed;
}

describe(loadSessionCase.name, () => {
	it("loads a declared rubric before a session can start", async () => {
		const root = await workspace.createDirectory("rehearse-judge-case-");
		await Bun.write(
			join(root, "smoke/quality.md"),
			"1. `accuracy`: The reply is accurate.",
		);

		const loaded = await loadSessionCase(declaration(), root);

		expect(loaded.judge).toEqual({
			files: [],
			rubric: "1. `accuracy`: The reply is accurate.",
			rubricPath: "quality.md",
		});
	});
	it("refuses a missing rubric while loading the case", async () => {
		const root = await workspace.createDirectory("rehearse-judge-case-");

		const pending = loadSessionCase(declaration(), root);
		const error = await failureOf(pending);

		expect(error).toBeInstanceOf(CaseDeclarationError);
	});
	it("refuses duplicate rubric requirements while loading the case", async () => {
		const root = await workspace.createDirectory("rehearse-judge-case-");
		await Bun.write(
			join(root, "smoke/quality.md"),
			"1. `same`: One.\n2. `same`: Two.",
		);

		const pending = loadSessionCase(declaration(), root);
		const error = await failureOf(pending);

		expect(error).toBeInstanceOf(CaseDeclarationError);
	});
});

describe("session Judge file declarations", () => {
	it.each([
		"../outside.txt",
		"/etc/passwd",
		"a/../../outside.txt",
		"a//b.txt",
		"a/./b.txt",
		String.raw`a\b.txt`,
	])("refuses invalid selected file %s before execution", (path) => {
		const text = new CaseDeclarationBuilder({
			judge: { files: [path], rubric: "rubric.md" },
		}).sessionJson();

		expect(() => parseCaseDeclaration("smoke", text)).toThrow(
			CaseDeclarationError,
		);
	});
});
