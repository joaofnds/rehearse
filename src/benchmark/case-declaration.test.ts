import { describe, expect, it } from "bun:test";

import { CaseDeclarationError, parseCaseDeclaration } from "#benchmark/case";

import { CaseDeclarationBuilder } from "./case-test-fixtures";

const SHA256_HEX_DIGITS = 64;

interface CaseDiagnosticExample {
	readonly json: string;
	readonly message: string;
	readonly name: string;
}

function rejectsWithHistoricalCaseDiagnostic({
	json,
	message,
}: CaseDiagnosticExample): void {
	expect(() => parseCaseDeclaration("probe", json)).toThrow(
		new CaseDeclarationError(message),
	);
}

const keepsHistoricalDiagnosticPriorityForNameCases = [
	{
		json: '{"kind":"session"}',
		message:
			"Case probe declaration has an invalid id: Invalid input: expected string, received undefined",
		name: "missing session identity",
	},
	{
		json: '{"kind":"pipeline"}',
		message:
			"Case probe declaration has an invalid id: Invalid input: expected string, received undefined",
		name: "missing pipeline identity",
	},
	{
		json: '{"id":"probe","kind":"session"}',
		message:
			"Case probe declaration has an invalid title: Invalid input: expected string, received undefined",
		name: "missing title before later required fields",
	},
	{
		json: '{"checks":[{"kind":"word-band","max":1}],"corpusFiles":[],"id":"probe","kind":"session","prompt":"hi","title":"Probe","tools":[],"transcript":{"cut":0,"file":1,"sha256":"bad","sourceSession":0}}',
		message:
			"Case probe declaration has an invalid transcript.file: Invalid input: expected string, received number",
		name: "transcript filename before its other fields",
	},
	{
		json: '{"checks":[{"kind":"word-band","max":-1,"min":-1}],"corpusFiles":[],"id":"probe","kind":"session","prompt":"hi","title":"Probe","tools":[]}',
		message:
			"Case probe declaration has an invalid checks.0.min: Too small: expected number to be >=0",
		name: "check minimum before maximum",
	},
	{
		json: '{"checks":[{"kind":"word-band","max":1}],"corpusFiles":[],"id":"probe","kind":"session","prompt":"hi","title":"Probe","tools":[],"agents":[],"settings":[]}',
		message:
			"Case probe declaration has an invalid settings: Invalid input: expected record, received array",
		name: "settings before agents",
	},
	{
		json: '{"id":"probe","kind":"session","extra":true}',
		message:
			"Case probe declaration has an invalid title: Invalid input: expected string, received undefined",
		name: "declared fields before strict unknown keys",
	},
];

const refusesATranscriptFileSWhichIsNotABareJsonlNameCases = [
	"sub/prefix.jsonl",
	"prefix.json",
	"prefix.jsonl.bak",
];

function refusesADeclarationWhoseIdIsNotItsDirectoryNameNamingBoth(): void {
	expect(() =>
		parseCaseDeclaration(
			"audit-log",
			new CaseDeclarationBuilder({ id: "other" }).pipelineJson(),
		),
	).toThrow(
		"Case declaration id other does not match its directory name audit-log",
	);
}

function acceptsADeclarationWhoseIdIsItsDirectoryName(): void {
	expect(
		parseCaseDeclaration(
			"audit-log",
			new CaseDeclarationBuilder().pipelineJson(),
		).id,
	).toBe("audit-log");
}

function carriesTheModelAndSessionBudgetAPipelineCaseDeclares(): void {
	const parsed = parseCaseDeclaration(
		"audit-log",
		new CaseDeclarationBuilder({
			model: "sonnet",
			sessionBudgetUsd: 10,
		}).pipelineJson(),
	);

	expect(parsed).toMatchObject({ model: "sonnet", sessionBudgetUsd: 10 });
}

function carriesTheModelAndSessionBudgetASessionCaseDeclares(): void {
	const parsed = parseCaseDeclaration(
		"smoke",
		new CaseDeclarationBuilder({
			checks: [{ kind: "tool-calls", max: 0 }],
			corpusFiles: ["output-styles/brief.md"],
			model: "sonnet",
			sessionBudgetUsd: 0.2,
		}).sessionJson(),
	);

	expect(parsed).toMatchObject({ model: "sonnet", sessionBudgetUsd: 0.2 });
}

function carriesTheIsolationASessionCaseDeclares(): void {
	const parsed = parseCaseDeclaration(
		"smoke",
		new CaseDeclarationBuilder({ isolated: true }).sessionJson(),
	);

	expect(parsed).toMatchObject({ isolated: true });
}

function describeWhenTheDeclarationMatchesItsCaseDirectory(): void {
	it(
		"accepts a declaration whose id is its directory name",
		acceptsADeclarationWhoseIdIsItsDirectoryName,
	);
	it(
		"carries the model and session budget a pipeline case declares",
		carriesTheModelAndSessionBudgetAPipelineCaseDeclares,
	);
	it(
		"carries the model and session budget a session case declares",
		carriesTheModelAndSessionBudgetASessionCaseDeclares,
	);
	it(
		"carries the isolation a session case declares",
		carriesTheIsolationASessionCaseDeclares,
	);
}
function describeWhenTheDeclaredIdentityDisagreesWithItsDirectory(): void {
	it(
		"refuses a declaration whose id is not its directory name, naming both",
		refusesADeclarationWhoseIdIsNotItsDirectoryNameNamingBoth,
	);
}
function describeWhenDeclarationFieldsAreInvalid(): void {
	it.each(keepsHistoricalDiagnosticPriorityForNameCases)(
		"keeps historical diagnostic priority for $name",
		rejectsWithHistoricalCaseDiagnostic,
	);
}
function describeWhenTheTranscriptNamesAPathOrAnotherFileType(): void {
	it.each(refusesATranscriptFileSWhichIsNotABareJsonlNameCases)(
		"refuses a transcript file %s, which is not a bare .jsonl name",
		(file) => {
			expect(() =>
				parseCaseDeclaration(
					"smoke",
					new CaseDeclarationBuilder({
						checks: [{ kind: "tool-calls", max: 0 }],
						corpusFiles: ["output-styles/brief.md"],
						transcript: {
							cut: 3,
							file,
							sha256: "a".repeat(SHA256_HEX_DIGITS),
							sourceSession: "aaaaaaaa-1111-2222-3333-444444444444",
						},
					}).sessionJson(),
				),
			).toThrow(
				"Case smoke declaration has an invalid transcript.file: A transcript prefix is a .jsonl file name in the case directory",
			);
		},
	);
}
describe(parseCaseDeclaration.name, () => {
	describe(
		"when the declaration matches its case directory",
		describeWhenTheDeclarationMatchesItsCaseDirectory,
	);
	describe(
		"when the declared identity disagrees with its directory",
		describeWhenTheDeclaredIdentityDisagreesWithItsDirectory,
	);
	describe(
		"when declaration fields are invalid",
		describeWhenDeclarationFieldsAreInvalid,
	);
	describe(
		"when the transcript names a path or another file type",
		describeWhenTheTranscriptNamesAPathOrAnotherFileType,
	);
});
