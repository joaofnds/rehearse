import { relative } from "node:path";

import { readCaseDeclaration } from "./case-catalog";
import { CaseDeclarationError } from "./case-declaration";
import type {
	PipelineCaseDeclaration,
	SessionCaseDeclaration,
} from "./case-declaration";
import type {
	BenchmarkCase,
	LoadedCase,
	LoadedStageRubric,
	SessionCase,
} from "./case-model";
import {
	caseRelative,
	declaredSettingsFilePath,
	declaredTarget,
	transcriptPrefixPath,
} from "./case-paths";
import { CONTROL_DIR } from "./config";
import { loadPipeline } from "./pipeline";
import type { PipelineDefinition } from "./pipeline";
import { loadStageRubric } from "./stage-rubric";

async function loadPipelineWithRubrics(
	declaration: PipelineCaseDeclaration,
	pipelinePath: string,
): Promise<{
	readonly pipeline: PipelineDefinition;
	readonly stageRubrics: Readonly<Record<string, LoadedStageRubric>>;
}> {
	const pipeline = await loadPipeline(
		pipelinePath,
		relative(CONTROL_DIR, caseRelative(declaration, declaration.rubrics)),
	);
	const stageRubrics: Record<string, LoadedStageRubric> = {};
	await Array.fromAsync(pipeline.stages, async (stage) => {
		stageRubrics[stage.name] = await loadStageRubric(stage);
	});

	return { pipeline, stageRubrics };
}

/**
 * Every declared file this reads is untrusted data a case author can get
 * wrong, so a missing one is reported for the field that named it rather than
 * reaching the loader as a bare filesystem error with no fix a reader can act
 * on.
 */
async function readDeclaredFile(
	declaration: PipelineCaseDeclaration,
	field: string,
	relativePath: string,
): Promise<string> {
	const path = caseRelative(declaration, relativePath);
	const file = Bun.file(path);
	if (!(await file.exists())) {
		throw new CaseDeclarationError(
			`Case ${declaration.id} declares ${field} at ${relativePath}, but no file is there; add it or correct the declaration`,
		);
	}

	return await file.text();
}

async function loadPipelineCase(
	declaration: PipelineCaseDeclaration,
): Promise<BenchmarkCase> {
	const pipelinePath = relative(
		CONTROL_DIR,
		caseRelative(declaration, declaration.pipeline),
	);
	const [{ pipeline, stageRubrics }, task, productBrief, finalRubric] =
		await Promise.all([
			loadPipelineWithRubrics(declaration, pipelinePath),
			readDeclaredFile(declaration, "task", declaration.task),
			readDeclaredFile(declaration, "productBrief", declaration.productBrief),
			readDeclaredFile(declaration, "finalRubric", declaration.finalRubric),
		]);

	return {
		declaration,
		finalRubric,
		finalRubricPath: caseRelative(declaration, declaration.finalRubric),
		kind: "pipeline",
		pipeline,
		pipelinePath,
		productBrief,
		rubricsDirectory: caseRelative(declaration, declaration.rubrics),
		settingsFilePath: declaredSettingsFilePath(declaration),
		stageRubrics,
		targetPath: declaredTarget(declaration),
		task,
	};
}

function loadSessionCase(declaration: SessionCaseDeclaration): SessionCase {
	const { fixture, transcript } = declaration;

	return {
		agents: declaration.agents,
		checks: declaration.checks,
		corpusFiles: declaration.corpusFiles,
		declaration,
		fixturePath:
			fixture === undefined ? undefined : caseRelative(declaration, fixture),
		isolated: declaration.isolated === true,
		kind: "session",
		projectFiles: declaration.projectFiles,
		prompt: declaration.prompt,
		settings: declaration.settings,
		stateCheck: declaration.stateCheck,
		tools: declaration.tools,
		transcriptPath:
			transcript === undefined
				? undefined
				: transcriptPrefixPath(declaration.id, transcript.file),
	};
}

async function loadCase(id: string): Promise<LoadedCase> {
	const declaration = await readCaseDeclaration(id);
	if (declaration.kind === "session") {
		return loadSessionCase(declaration);
	}

	return await loadPipelineCase(declaration);
}

/**
 * `--pipeline` replaces the pipeline the case declares, and with it the stage
 * rubrics its stages name, so the override produces a whole case rather than a
 * pipeline the rest of the case no longer matches.
 */
async function withPipeline(
	benchmarkCase: BenchmarkCase,
	pipelinePath: string,
): Promise<BenchmarkCase> {
	const { pipeline, stageRubrics } = await loadPipelineWithRubrics(
		benchmarkCase.declaration,
		pipelinePath,
	);

	return { ...benchmarkCase, pipeline, pipelinePath, stageRubrics };
}

export { loadCase, withPipeline };
