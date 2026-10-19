import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import {
	CASES_DIRECTORY,
	listCases,
	loadCase,
	parseCaseDeclaration,
	requireSessionCase,
	transcriptPrefixPath,
} from "#benchmark/case";
import { runCommand } from "#benchmark/command";
import { PROJECT_ROOT } from "#benchmark/test-support";

import { CaseDeclarationBuilder } from "./case-test-fixtures";

const NO_AVAILABLE_CASES = 0;

const SHA256_HEX_DIGITS = 64;

function acceptedName(file: string): string | undefined {
	const declaration = parseCaseDeclaration(
		"smoke",
		new CaseDeclarationBuilder({
			checks: [{ kind: "tool-calls", max: 0 }],
			transcript: {
				cut: 3,
				file,
				sha256: "a".repeat(SHA256_HEX_DIGITS),
				sourceSession: "aaaaaaaa-1111-2222-3333-444444444444",
			},
		}).sessionJson(),
	);

	return declaration.kind === "session"
		? declaration.transcript?.file
		: undefined;
}

async function ignored(path: string): Promise<boolean> {
	try {
		await runCommand(["git", "check-ignore", "-q", path], PROJECT_ROOT);

		return true;
	} catch {
		return false;
	}
}

const TURNS = [
	{
		acceptedWords: 145,
		caseId: "brief-reply-e3dea673",
		cut: 873,
		sourceSession: "e3dea673-663a-4a3e-b89f-4ffb568e7109",
	},
	{
		acceptedWords: 136,
		caseId: "brief-reply-02f0f204",
		cut: 1270,
		sourceSession: "02f0f204-613d-49d2-8999-67ba79fedbb1",
	},
	{
		acceptedWords: 108,
		caseId: "brief-reply-40878d26",
		cut: 491,
		sourceSession: "40878d26-3572-4a08-a668-4e4c275e462e",
	},
	{
		acceptedWords: 76,
		caseId: "brief-reply-92b2e8b0",
		cut: 1268,
		sourceSession: "92b2e8b0-1cac-4855-87be-ba84d5cee5b9",
	},
];

const coversSANameTheDeclarationSchemaAcceptsCases = [
	"capture.jsonl",
	"a0491c04-fb39-42b6-851e-37aba8250e82-cut-24.jsonl",
];

async function declaresASourceSessionItsPrefixSBytesCarry(): Promise<void> {
	const listing = await listCases(undefined, { includeArchived: true });
	const withheld: string[] = [];
	const declared: { id: string; sourceSession: string; found: boolean }[] = [];
	await Array.fromAsync(listing.declarations, async (declaration) => {
		if (
			declaration.kind !== "session" ||
			declaration.transcript === undefined
		) {
			return;
		}

		const path = transcriptPrefixPath(
			declaration.id,
			declaration.transcript.file,
		);
		if (!(await Bun.file(path).exists())) {
			withheld.push(declaration.id);
			return;
		}

		const bytes = await Bun.file(path).text();
		declared.push({
			found: bytes.includes(declaration.transcript.sourceSession),
			id: declaration.id,
			sourceSession: declaration.transcript.sourceSession,
		});
	});

	expect(declared.length + withheld.length).toBeGreaterThan(NO_AVAILABLE_CASES);
	expect(declared.filter(({ found }) => !found)).toEqual([]);
}

async function leavesACaseSOtherDeclaredInputFilesTracked(): Promise<void> {
	expect(
		await ignored(
			join(CASES_DIRECTORY, "manifest-probe", "fixture", "x.jsonl"),
		),
	).toBe(false);
}

async function cutsAtTheRecordedTurn({
	caseId,
	sourceSession,
	cut,
	acceptedWords,
}: Readonly<(typeof TURNS)[number]>): Promise<void> {
	const loaded = requireSessionCase(await loadCase(caseId));

	expect(loaded.declaration.title).toContain(`${String(acceptedWords)} words`);
	expect(loaded.declaration).toMatchObject({
		transcript: { cut, sourceSession },
	});
}

async function judgesByTheDeclaredBand({
	caseId,
}: Readonly<(typeof TURNS)[number]>): Promise<void> {
	const loaded = requireSessionCase(await loadCase(caseId));

	expect(loaded.checks).toEqual([
		{ kind: "word-band", max: 154 },
		{ kind: "forbidden-text", strings: ["\u2014"] },
		{ kind: "tool-calls", max: 0 },
	]);
}

async function usesTheBriefStyleCorpus({
	caseId,
}: Readonly<(typeof TURNS)[number]>): Promise<void> {
	const loaded = requireSessionCase(await loadCase(caseId));

	expect(loaded).toMatchObject({
		corpusFiles: ["output-styles/brief.md"],
		prompt:
			"Tools are unavailable now. Write your reply to João for this turn.",
		settings: { outputStyle: "brief" },
		tools: [],
	});
}

describe("committed transcript cases", () => {
	it(
		"declares a source session its prefix's bytes carry",
		declaresASourceSessionItsPrefixSBytesCarry,
	);
	it.each(TURNS)(
		"cuts $caseId at its own turn and states the accepted length in its title",
		cutsAtTheRecordedTurn,
	);
	it.each(TURNS)(
		"judges $caseId by a band with a ceiling and no floor, the em dash alone, and no tool calls",
		judgesByTheDeclaredBand,
	);
	it.each(TURNS)(
		"runs $caseId against the brief style overlay with the same prompt, no tools, and the one corpus file it reads",
		usesTheBriefStyleCorpus,
	);
	it.each(coversSANameTheDeclarationSchemaAcceptsCases)(
		"covers %s, a name the declaration schema accepts",
		async (file) => {
			expect(acceptedName(file)).toBe(file);
			expect(await ignored(join(CASES_DIRECTORY, "smoke", file))).toBe(true);
		},
	);
	it(
		"leaves a case's other declared input files tracked",
		leavesACaseSOtherDeclaredInputFilesTracked,
	);
});
