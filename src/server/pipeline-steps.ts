import { rename, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { z } from "zod";
import {
	caseRelative,
	CaseDeclarationError,
	readCaseDeclaration,
} from "#benchmark/case";
import type { PipelineCaseDeclaration } from "#benchmark/case";
import { CONTROL_DIR } from "#benchmark/config";
import { PipelineDefinitionError } from "#benchmark/pipeline";
import type { StageDefinition } from "#benchmark/pipeline";
import {
	caseRubrics,
	checkedPipeline,
	declaredPipelineFile,
	readDeclaredPipeline,
} from "./pipelines";
import { projectFormatted } from "./project-format";
import { redactAbsolutePaths } from "./redact-path";

/** A pipeline file's top level, which the harness has already read as valid. */
const WRITTEN_PIPELINE = z.record(z.string(), z.unknown());

/** A pipeline case's steps as its pipeline file declares them. */
export interface DeclaredSteps {
	readonly caseId: string;
	/** The pipeline file, control-relative. */
	readonly pipeline: string;
	readonly stages: readonly StageDefinition[];
	/** The rubrics a step may name, control-relative as a step names one. */
	readonly rubrics: readonly string[];
}

export class PipelineCaseRefusalError extends Error {
	public override name = "PipelineCaseRefusalError";

	public constructor(
		message: string,
		public readonly status: 400 | 404 | 409,
	) {
		super(message);
	}
}

export async function pipelineCase(
	casesRoot: string,
	caseId: string,
): Promise<PipelineCaseDeclaration> {
	let declaration;
	try {
		declaration = await readCaseDeclaration(caseId, casesRoot);
	} catch (error) {
		if (!(error instanceof CaseDeclarationError)) {
			throw error;
		}

		throw new PipelineCaseRefusalError(`No case ${caseId} is declared`, 404);
	}
	if (declaration.kind !== "pipeline") {
		throw new PipelineCaseRefusalError(
			`Case ${caseId} is a session case, which declares no steps`,
			404,
		);
	}

	return declaration;
}

/** Reads through `read`, answering a pipeline the harness refuses with `status`. */
export async function refusingAs<T>(
	status: 400 | 409,
	read: () => Promise<T>,
): Promise<T> {
	try {
		return await read();
	} catch (error) {
		if (!(error instanceof PipelineDefinitionError)) {
			throw error;
		}

		throw new PipelineCaseRefusalError(
			redactAbsolutePaths(error.message),
			status,
		);
	}
}

async function stepsOf(
	casesRoot: string,
	declaration: PipelineCaseDeclaration,
	stages: readonly StageDefinition[],
): Promise<DeclaredSteps> {
	return {
		caseId: declaration.id,
		pipeline: relative(
			CONTROL_DIR,
			caseRelative(declaration, declaration.pipeline),
		),
		stages,
		rubrics: await caseRubrics(casesRoot, declaration),
	};
}

export async function declaredSteps(
	casesRoot: string,
	caseId: string,
): Promise<DeclaredSteps> {
	const declaration = await pipelineCase(casesRoot, caseId);
	const pipeline = await refusingAs(409, () =>
		readDeclaredPipeline(casesRoot, declaration),
	);

	return stepsOf(casesRoot, declaration, pipeline.stages);
}

/**
 * Replaces a pipeline case's steps, keeping the rest of its pipeline file. The
 * new file is checked as the harness would read it before it replaces the
 * old one, so a step the harness would refuse to run is refused here and the
 * file stays as it was. Recorded runs keep the steps their manifests froze.
 */
export async function editDeclaredSteps(
	casesRoot: string,
	caseId: string,
	stages: readonly StageDefinition[],
): Promise<DeclaredSteps> {
	const declaration = await pipelineCase(casesRoot, caseId);
	await refusingAs(409, () => readDeclaredPipeline(casesRoot, declaration));
	const file = declaredPipelineFile(casesRoot, declaration);
	// The rest of the file as written, not as parsed, so a default the parser
	// fills in never reaches it.
	const written = WRITTEN_PIPELINE.parse(
		JSON.parse(await Bun.file(file).text()),
	);
	const text = await projectFormatted(
		file,
		// Expanded, so the formatter keeps each object on its own lines as the
		// pipeline files are written.
		JSON.stringify({ ...written, stages }, null, "\t"),
	);
	const edited = await refusingAs(400, () =>
		checkedPipeline(casesRoot, declaration, text),
	);

	const staged = `${file}.editing`;
	await writeFile(staged, text);
	await rename(staged, file);

	return stepsOf(casesRoot, declaration, edited.stages);
}
