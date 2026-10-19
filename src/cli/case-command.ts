import type { CaseDeclaration, LoadedCase } from "#benchmark/case";
import {
	caseDeclarationPath,
	casesRoot,
	listCases,
	loadCase,
	readCaseDeclaration,
} from "#benchmark/case";
import { asRefusedPrecondition } from "#benchmark/preflight";
import { UsageError } from "#cli/command-usage";
import type { CommandOutput } from "#cli/output";

import { serialize } from "./case-declaration-output";

async function requireCase(caseId: string): Promise<LoadedCase> {
	return await asRefusedPrecondition(async () => await loadCase(caseId));
}

function declarationFile(caseId: string, root?: string): string {
	return caseDeclarationPath(caseId, root ?? casesRoot());
}

interface CaseListRequest {
	readonly json: boolean;
	readonly includeArchived?: boolean;
}

async function runCaseList(
	request: CaseListRequest,
	output: CommandOutput,
): Promise<void> {
	const listing = await asRefusedPrecondition(
		async () =>
			await listCases(undefined, {
				includeArchived: request.includeArchived ?? false,
			}),
	);
	for (const { reason } of listing.unreadable) {
		output.stderr(`${reason}\n`);
	}
	if (request.json) {
		output.stdout(serialize(listing.declarations));

		return;
	}

	for (const declaration of listing.declarations) {
		output.stdout(`${declaration.id}\t${declaration.title}\n`);
	}
}

interface CaseShowRequest {
	readonly caseId: string | undefined;
	readonly json: boolean;
}

async function runCaseShow(
	request: CaseShowRequest,
	output: CommandOutput,
): Promise<void> {
	const { caseId } = request;
	if (caseId === undefined) {
		throw new UsageError("Provide the case id: rehearse case show <case-id>");
	}

	const declaration: CaseDeclaration = await asRefusedPrecondition(
		async () => await readCaseDeclaration(caseId),
	);

	output.stdout(
		request.json ? serialize(declaration) : `${declarationFile(caseId)}\n`,
	);
}

export { default as runCaseCapture } from "./case-capture-command";
export type {
	CaseCaptureDependencies,
	CaseCaptureRequest,
} from "./case-capture-command";
export { requireCase, runCaseList, runCaseShow };
export type { CaseListRequest, CaseShowRequest };
