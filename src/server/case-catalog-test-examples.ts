import type { PipelineCaseDeclaration } from "#benchmark/case";
import { CASE_ID } from "#benchmark/run-records-test-support";

import PipelineDeclarationBuilder from "./pipeline-declaration-test-builder";
import SessionDeclarationBuilder from "./session-declaration-test-builder";
import type { SessionDeclarationInput } from "./session-declaration-test-builder";

interface CaseCatalog {
	readonly pipeline: PipelineCaseDeclaration;
	readonly session: SessionDeclarationInput;
}

interface LaunchCaseCatalog extends CaseCatalog {
	readonly unmodelled: SessionDeclarationInput;
	readonly effortless: SessionDeclarationInput;
}

const CaseCatalogExamples = {
	caseListing(): CaseCatalog {
		return {
			pipeline: new PipelineDeclarationBuilder({
				finalRubric: "final-rubric.md",
				id: CASE_ID,
				target: { path: "/sources/template" },
				title: "Add an audit log module",
			}).build(),
			session: new SessionDeclarationBuilder({
				checks: [
					{ kind: "word-band", max: 120 },
					{ kind: "forbidden-text", strings: ["As an AI"] },
				],
				corpusFiles: ["skills/brief/SKILL.md"],
				id: "smoke",
				sessionBudgetUsd: 0.5,
				title: "Reply in the brief style",
				tools: ["Read"],
			}).build(),
		};
	},
	declarations(): CaseCatalog {
		return {
			pipeline: new PipelineDeclarationBuilder().build(),
			session: new SessionDeclarationBuilder().build(),
		};
	},
	launches(): LaunchCaseCatalog {
		return {
			effortless: new SessionDeclarationBuilder({
				id: "no-effort",
				model: "haiku",
				title: "A case that declares no effort",
			}).build(),
			pipeline: new PipelineDeclarationBuilder({
				effort: "medium",
				model: "sonnet",
			}).build(),
			session: new SessionDeclarationBuilder({
				effort: "low",
				model: "haiku",
			}).build(),
			unmodelled: new SessionDeclarationBuilder({
				effort: "low",
				id: "no-model",
				title: "A case that declares no model",
			}).build(),
		};
	},
};

export { CaseCatalogExamples as default };
