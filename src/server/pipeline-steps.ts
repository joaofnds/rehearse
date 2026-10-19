import { rename, writeFile } from "node:fs/promises";
import { relative } from "node:path";

import { z } from "zod";

import {
	CaseDeclarationError,
	caseRelative,
	readCaseDeclaration,
} from "#benchmark/case";
import type { PipelineCaseDeclaration } from "#benchmark/case";
import { CONTROL_DIR } from "#benchmark/config";
import { PipelineDefinitionError } from "#benchmark/pipeline";
import type { StageDefinition } from "#benchmark/pipeline";
import projectFormatted from "#benchmark/project-format";
import {
	HTTP_STATUS_BAD_REQUEST,
	HTTP_STATUS_CONFLICT,
	HTTP_STATUS_NOT_FOUND,
} from "#server/http-status";

import {
	caseRubrics,
	checkedPipeline,
	declaredPipelineFile,
	readDeclaredPipeline,
} from "./pipelines";
import { redactAbsolutePaths } from "./redact-path";

/** A pipeline file's top level, which the harness has already read as valid. */
const WRITTEN_PIPELINE = z.record(z.string(), z.unknown());

/** A pipeline case's steps as its pipeline file declares them. */
interface DeclaredSteps {
	readonly caseId: string;
	/** The pipeline file, control-relative. */
	readonly pipeline: string;
	readonly stages: readonly StageDefinition[];
	/** The rubrics a step may name, control-relative as a step names one. */
	readonly rubrics: readonly string[];
}

class PipelineCaseRefusalError extends Error {
	public override name = "PipelineCaseRefusalError";

	public constructor(
		message: string,
		public readonly status:
			| typeof HTTP_STATUS_BAD_REQUEST
			| typeof HTTP_STATUS_NOT_FOUND
			| typeof HTTP_STATUS_CONFLICT,
	) {
		super(message);
	}
}

async function pipelineCase(
	casesRoot: string,
	caseId: string,
): Promise<PipelineCaseDeclaration> {
	const readPipelineCaseDeclaration = async (): ReturnType<
		typeof readCaseDeclaration
	> => {
		try {
			return await readCaseDeclaration(caseId, casesRoot);
		} catch (error) {
			if (!(error instanceof CaseDeclarationError)) {
				throw error;
			}

			throw new PipelineCaseRefusalError(
				`No case ${caseId} is declared`,
				HTTP_STATUS_NOT_FOUND,
			);
		}
	};

	const declaration = await readPipelineCaseDeclaration();
	if (declaration.kind !== "pipeline") {
		throw new PipelineCaseRefusalError(
			`Case ${caseId} is a session case, which declares no steps`,
			HTTP_STATUS_NOT_FOUND,
		);
	}

	return declaration;
}

/** Reads through `read`, answering a pipeline the harness refuses with `status`. */
async function refusingAs<T>(
	status: typeof HTTP_STATUS_BAD_REQUEST | typeof HTTP_STATUS_CONFLICT,
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
		rubrics: await caseRubrics(casesRoot, declaration),
		stages,
	};
}

async function declaredSteps(
	casesRoot: string,
	caseId: string,
): Promise<DeclaredSteps> {
	const declaration = await pipelineCase(casesRoot, caseId);
	const pipeline = await refusingAs(
		HTTP_STATUS_CONFLICT,
		async () => await readDeclaredPipeline(casesRoot, declaration),
	);

	return await stepsOf(casesRoot, declaration, pipeline.stages);
}

/**
 * Replaces a pipeline case's steps, keeping the rest of its pipeline file. The
 * new file is checked as the harness would read it before it replaces the
 * old one, so a step the harness would refuse to run is refused here and the
 * file stays as it was. Recorded runs keep the steps their manifests froze.
 */
async function editDeclaredSteps(
	casesRoot: string,
	caseId: string,
	stages: readonly StageDefinition[],
): Promise<DeclaredSteps> {
	const declaration = await pipelineCase(casesRoot, caseId);
	await refusingAs(
		HTTP_STATUS_CONFLICT,
		async () => await readDeclaredPipeline(casesRoot, declaration),
	);
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
	const edited = await refusingAs(
		HTTP_STATUS_BAD_REQUEST,
		async () => await checkedPipeline(casesRoot, declaration, text),
	);

	const staged = `${file}.editing`;
	await writeFile(staged, text);
	await rename(staged, file);

	return await stepsOf(casesRoot, declaration, edited.stages);
}

export {
	PipelineCaseRefusalError,
	pipelineCase,
	refusingAs,
	declaredSteps,
	editDeclaredSteps,
};
export type { DeclaredSteps };
