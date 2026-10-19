import { caseRelative } from "#benchmark/case";
import type {
	PipelineCaseDeclaration,
	SessionCaseDeclaration,
} from "#benchmark/case";
import RECORD_JSON_INDENT_SPACES from "#server/json-record-format";

import { redactAbsolutePaths } from "./redact-path";

type DefinitionText =
	| {
			readonly state: "available";
			readonly text: string;
			readonly source: string;
	  }
	| {
			readonly state: "unavailable";
			readonly reason: string;
			readonly source: string;
	  };

interface CaseDefinition {
	readonly prompt: DefinitionText;
	readonly evaluation: DefinitionText;
	readonly productBrief?: DefinitionText;
	readonly corpusFiles?: readonly string[];
	readonly tools?: readonly string[];
	readonly sessionBudgetUsd: number | null;
}

async function declaredText(
	root: string,
	declaration: PipelineCaseDeclaration,
	source: string,
): Promise<DefinitionText> {
	try {
		const text = await Bun.file(caseRelative(declaration, source, root)).text();
		return { source, state: "available", text };
	} catch (error) {
		return {
			reason: redactAbsolutePaths(
				error instanceof Error ? error.message : String(error),
			),
			source,
			state: "unavailable",
		};
	}
}

async function pipelineDefinition(
	root: string,
	declaration: PipelineCaseDeclaration,
): Promise<CaseDefinition> {
	const [prompt, productBrief, evaluation] = await Promise.all([
		declaredText(root, declaration, declaration.task),
		declaredText(root, declaration, declaration.productBrief),
		declaredText(root, declaration, declaration.finalRubric),
	]);
	return {
		evaluation,
		productBrief,
		prompt,
		sessionBudgetUsd: declaration.sessionBudgetUsd ?? null,
	};
}

function sessionDefinition(
	declaration: SessionCaseDeclaration,
): CaseDefinition {
	return {
		corpusFiles: declaration.corpusFiles,
		evaluation: {
			source: "case.json · checks / stateCheck",
			state: "available",
			text: JSON.stringify(
				{ checks: declaration.checks, stateCheck: declaration.stateCheck },
				null,
				RECORD_JSON_INDENT_SPACES,
			),
		},
		prompt: {
			source: "case.json · prompt",
			state: "available",
			text: declaration.prompt,
		},
		sessionBudgetUsd: declaration.sessionBudgetUsd ?? null,
		tools: declaration.tools,
	};
}

export { pipelineDefinition, sessionDefinition };
export type { DefinitionText, CaseDefinition };
