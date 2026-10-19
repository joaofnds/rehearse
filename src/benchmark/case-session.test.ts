import { describe, expect, it } from "bun:test";

import {
	CaseDeclarationError,
	caseRelative,
	loadCase,
	parseCaseDeclaration,
	requireSessionCase,
} from "#benchmark/case";

import { CaseDeclarationBuilder } from "./case-test-fixtures";

const refusesAFixtureAtSWhichLeavesTheCaseDirectoryCases = [
	"/etc",
	"../../CLAUDE.md",
];

async function returnsTheSmokeCaseCarryingItsPromptToolsAndChecks(): Promise<void> {
	const loaded = requireSessionCase(await loadCase("smoke"));

	expect(loaded).toMatchObject({
		checks: [
			{ kind: "word-band", max: 1 },
			{ kind: "tool-calls", max: 0 },
		],
		prompt: "Reply with the single word OK.",
		tools: [],
	});
}

function carriesTheStateCheckASessionCaseDeclares(): void {
	const declaration = parseCaseDeclaration(
		"smoke",
		new CaseDeclarationBuilder({
			stateCheck: {
				command: ["sh", "score.sh"],
				outcomes: ["tree-clean", "cards-archived"],
			},
		}).sessionJson(),
	);

	expect(declaration).toMatchObject({
		stateCheck: {
			command: ["sh", "score.sh"],
			outcomes: ["tree-clean", "cards-archived"],
		},
	});
}

function refusesAStateCheckDeclaringNoOutcomeToReport(): void {
	expect(() =>
		parseCaseDeclaration(
			"smoke",
			new CaseDeclarationBuilder({
				stateCheck: { command: ["sh", "score.sh"], outcomes: [] },
			}).sessionJson(),
		),
	).toThrow(CaseDeclarationError);
}

function refusesAStateCheckDeclaringTheSameOutcomeTwice(): void {
	expect(() =>
		parseCaseDeclaration(
			"smoke",
			new CaseDeclarationBuilder({
				stateCheck: {
					command: ["sh", "score.sh"],
					outcomes: ["tree-clean", "tree-clean"],
				},
			}).sessionJson(),
		),
	).toThrow(CaseDeclarationError);
}

function defaultsProjectFilesToAnEmptyListWhenASessionDeclarationOmitsIt(): void {
	const declaration = parseCaseDeclaration(
		"smoke",
		new CaseDeclarationBuilder().sessionJson(),
	);

	expect(declaration).toMatchObject({ projectFiles: [] });
}

function refusesASessionDeclarationCarryingAPipelineFieldNamingTheKey(): void {
	expect(() =>
		parseCaseDeclaration(
			"smoke",
			new CaseDeclarationBuilder({
				pipeline: "pipelines/default.json",
			}).sessionJson(),
		),
	).toThrow(
		'Case smoke declaration has an invalid declaration: Unrecognized key: "pipeline"',
	);
}

function describeWhenLoadingASessionDeclaration(): void {
	it(
		"returns the smoke case carrying its prompt, tools, and checks",
		returnsTheSmokeCaseCarryingItsPromptToolsAndChecks,
	);
	it(
		"defaults projectFiles to an empty list when a session declaration omits it",
		defaultsProjectFilesToAnEmptyListWhenASessionDeclarationOmitsIt,
	);
}
function describeWhenAStateCheckDeclaresUniqueOutcomes(): void {
	it(
		"carries the state check a session case declares",
		carriesTheStateCheckASessionCaseDeclares,
	);
}
function describeWhenStateCheckOutcomesAreInvalid(): void {
	it(
		"refuses a state check declaring no outcome to report",
		refusesAStateCheckDeclaringNoOutcomeToReport,
	);
	it(
		"refuses a state check declaring the same outcome twice",
		refusesAStateCheckDeclaringTheSameOutcomeTwice,
	);
}
function describeWhenAFixturePathLeavesTheCaseDirectory(): void {
	it.each(refusesAFixtureAtSWhichLeavesTheCaseDirectoryCases)(
		"refuses a fixture at %s, which leaves the case directory",
		(fixture) => {
			const declaration = parseCaseDeclaration(
				"smoke",
				new CaseDeclarationBuilder({ fixture }).sessionJson(),
			);

			expect(() => caseRelative(declaration, fixture)).toThrow(
				`Case smoke names a path outside its case directory: ${fixture}`,
			);
		},
	);
}
function describeWhenASessionDeclaresPipelineOnlyFields(): void {
	it(
		"refuses a session declaration carrying a pipeline field, naming the key",
		refusesASessionDeclarationCarryingAPipelineFieldNamingTheKey,
	);
}
describe("session cases", () => {
	describe(
		"when loading a session declaration",
		describeWhenLoadingASessionDeclaration,
	);
	describe(
		"when a state check declares unique outcomes",
		describeWhenAStateCheckDeclaresUniqueOutcomes,
	);
	describe(
		"when state-check outcomes are invalid",
		describeWhenStateCheckOutcomesAreInvalid,
	);
	describe(
		"when a fixture path leaves the case directory",
		describeWhenAFixturePathLeavesTheCaseDirectory,
	);
	describe(
		"when a session declares pipeline-only fields",
		describeWhenASessionDeclaresPipelineOnlyFields,
	);
});
