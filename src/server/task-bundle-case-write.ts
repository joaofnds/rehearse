import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";

import { CASES_DIRECTORY, caseDeclarationPath } from "#benchmark/case";
import { PipelineDefinitionError } from "#benchmark/pipeline";
import {
	HTTP_STATUS_BAD_REQUEST,
	HTTP_STATUS_CONFLICT,
} from "#server/http-status";
import { checkedPipeline } from "#server/pipeline-definition";
import { PipelineCaseRefusalError } from "#server/pipeline-steps";
import { redactAbsolutePaths } from "#server/redact-path";
import type { ImportedCaseWrite } from "#server/task-bundle-contract";
import {
	importedPipelineText,
	writeImportedFiles,
} from "#server/task-bundle-files";

/**
 * Made without `recursive`, so an id already on disk, declared or left
 * half-written, is refused, and of two imports racing for one id only the
 * first makes it.
 */
async function claimCaseDirectory(
	directory: string,
	id: string,
): Promise<void> {
	try {
		await mkdir(directory);
	} catch (error) {
		if (
			!(error instanceof Error && "code" in error && error.code === "EEXIST")
		) {
			throw error;
		}

		throw new PipelineCaseRefusalError(
			`Case ${id} already has a directory under ${CASES_DIRECTORY}/`,
			HTTP_STATUS_CONFLICT,
		);
	}
}

async function writeImportedCase({
	casesRoot,
	declaration,
	request,
}: ImportedCaseWrite): Promise<void> {
	const caseDirectory = dirname(caseDeclarationPath(request.id, casesRoot));

	await claimCaseDirectory(caseDirectory, request.id);
	try {
		await writeImportedFiles(casesRoot, declaration, request.bundle);
		await checkedPipeline(
			casesRoot,
			declaration,
			await importedPipelineText(caseDirectory),
		);
	} catch (error) {
		await rm(caseDirectory, { force: true, recursive: true });
		if (error instanceof PipelineDefinitionError) {
			throw new PipelineCaseRefusalError(
				redactAbsolutePaths(error.message),
				HTTP_STATUS_BAD_REQUEST,
			);
		}

		throw error;
	}
}

export { writeImportedCase as default };
