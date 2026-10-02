import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { CaseDeclaration } from "#benchmark/case";
import {
	CASES_DIRECTORY,
	CaseDeclarationError,
	caseDeclarationPath,
	parseCaseDeclaration,
} from "#benchmark/case";
import type { CorpusRoot } from "#benchmark/corpus-file";
import { CorpusFileError, resolveCorpusFile } from "#benchmark/corpus-file";
import { redactAbsolutePaths } from "./redact-path";

export const DECLARED_BY_HAND_REASON =
	"A pipeline case needs a target repository and its own task files, so it is declared by hand in its case.json";

const DECLARABLE_FIELDS = [
	"id",
	"kind",
	"title",
	"prompt",
	"tools",
	"corpusFiles",
	"checks",
	"model",
	"sessionBudgetUsd",
] as const;

/**
 * The fields the browser may set are the ones that run no command, so a
 * declaration that needs any other is edited by hand. Their values are the
 * case parser's to judge, the same parser a run loads the file with.
 */
export const declareCaseRequestSchema = z.strictObject(
	{
		id: z.string(),
		kind: z.literal("session", {
			error: (issue) =>
				issue.input === "pipeline" ? DECLARED_BY_HAND_REASON : undefined,
		}),
		title: z.unknown().optional(),
		prompt: z.unknown().optional(),
		tools: z.unknown().optional(),
		corpusFiles: z.unknown().optional(),
		checks: z.unknown().optional(),
		model: z.string().min(1),
		sessionBudgetUsd: z.unknown().optional(),
	},
	{
		error: (issue) =>
			issue.code === "unrecognized_keys"
				? `${issue.keys.join(", ")} is declared by hand in case.json: the browser sets only ${DECLARABLE_FIELDS.join(", ")}`
				: undefined,
	},
);

export type DeclareCaseRequest = z.infer<typeof declareCaseRequestSchema>;

export interface DeclaredCase {
	/** The declaration as written, without the defaults the parser fills in. */
	readonly declaration: DeclareCaseRequest;
	/** Relative to the control repository, where the file is uncommitted. */
	readonly path: string;
}

/**
 * A declaration that cannot be written as asked: one the parser or the corpus
 * refuses is 400, and an id already on disk is 409.
 */
export class DeclarationRefusalError extends Error {
	public override name = "DeclarationRefusalError";

	public constructor(
		message: string,
		public readonly status: 400 | 409,
	) {
		super(message);
	}
}

function parsedDeclaration(id: string, text: string): CaseDeclaration {
	try {
		return parseCaseDeclaration(id, text);
	} catch (error) {
		if (!(error instanceof CaseDeclarationError)) {
			throw error;
		}
		throw new DeclarationRefusalError(error.message, 400);
	}
}

/**
 * The corpus files are resolved against the corpus a run would read, which
 * refuses a path outside the layout and one that climbs out of the install.
 * Whether each file exists is left to the run, as for a hand-written case.
 */
function refuseCorpusFiles(
	corpusFiles: readonly string[],
	corpus: CorpusRoot,
): void {
	for (const layoutPath of corpusFiles) {
		try {
			resolveCorpusFile(corpus, layoutPath);
		} catch (error) {
			if (!(error instanceof CorpusFileError)) {
				throw error;
			}
			throw new DeclarationRefusalError(
				redactAbsolutePaths(error.message),
				400,
			);
		}
	}
}

/**
 * The directory is made without `recursive`, so one already there, declared
 * or left half-written, refuses the id, and of two requests racing for one id
 * only the first makes it.
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
		throw new DeclarationRefusalError(`Case ${id} is already declared`, 409);
	}
}

/**
 * Writes the request as typed rather than the parsed declaration, so a default
 * the parser fills in never reaches the file.
 */
export async function declareCase(
	request: DeclareCaseRequest,
	casesRoot: string,
	corpus: CorpusRoot,
): Promise<DeclaredCase> {
	const text = `${JSON.stringify(request, null, "\t")}\n`;
	const declaration = parsedDeclaration(request.id, text);
	if (declaration.kind === "session") {
		refuseCorpusFiles(declaration.corpusFiles, corpus);
	}

	const directory = join(casesRoot, declaration.id);
	await claimCaseDirectory(directory, declaration.id);
	try {
		await writeFile(caseDeclarationPath(declaration.id, casesRoot), text, {
			flag: "wx",
		});
	} catch (error) {
		await rm(directory, { force: true, recursive: true });
		throw error;
	}

	return {
		declaration: request,
		path: join(CASES_DIRECTORY, declaration.id, "case.json"),
	};
}
