import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
	CASES_DIRECTORY,
	caseDeclarationPath,
	parseCaseDeclaration,
} from "#benchmark/case";

/**
 * The fields the browser may set are the ones that run no command, so a
 * declaration that needs any other is edited by hand. Their values are the
 * case parser's to judge, the same parser a run loads the file with.
 */
export const declareCaseRequestSchema = z.strictObject({
	id: z.string(),
	kind: z.literal("session"),
	title: z.unknown().optional(),
	prompt: z.unknown().optional(),
	tools: z.unknown().optional(),
	corpusFiles: z.unknown().optional(),
	checks: z.unknown().optional(),
	model: z.string().min(1),
	sessionBudgetUsd: z.unknown().optional(),
});

export type DeclareCaseRequest = z.infer<typeof declareCaseRequestSchema>;

export interface DeclaredCase {
	/** The declaration as written, without the defaults the parser fills in. */
	readonly declaration: DeclareCaseRequest;
	/** Relative to the control repository, where the file is uncommitted. */
	readonly path: string;
}

/**
 * Writes the request as typed rather than the parsed declaration, so a default
 * the parser fills in never reaches the file.
 */
export async function declareCase(
	request: DeclareCaseRequest,
	casesRoot: string,
): Promise<DeclaredCase> {
	const text = `${JSON.stringify(request, null, "\t")}\n`;
	const declaration = parseCaseDeclaration(request.id, text);

	await mkdir(join(casesRoot, declaration.id));
	await writeFile(caseDeclarationPath(declaration.id, casesRoot), text, {
		flag: "wx",
	});

	return {
		declaration: request,
		path: join(CASES_DIRECTORY, declaration.id, "case.json"),
	};
}
