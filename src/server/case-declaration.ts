import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, posix } from "node:path";
import { z } from "zod";
import {
	CASES_DIRECTORY,
	CaseDeclarationError,
	caseDeclarationPath,
	caseDeclarationSchema,
	parseCaseDeclaration,
	sessionCaseDeclarationSchema,
} from "#benchmark/case";
import type { Immutable } from "#benchmark/contracts";
import type { CorpusRoot } from "#benchmark/corpus-file";
import { CorpusFileError, resolveCorpusFile } from "#benchmark/corpus-file";
import { DECLARED_BY_HAND_REASON } from "./declared-by-hand";
import { redactAbsolutePaths } from "./redact-path";

const CASE_FIELDS = new Set<string>(
	caseDeclarationSchema.options.flatMap((option) => option.keyof().options),
);

/**
 * The fields the browser may set are the ones that run no command, so a
 * declaration that needs any other is edited by hand. Each is judged by the
 * session case's own schema, without the defaults it fills in, so the
 * request written is the file a run reads. The claude CLI takes the prompt
 * where it still reads options, so a prompt that starts with a dash would set
 * a flag the browser may not set.
 */
export const declareCaseRequestSchema = sessionCaseDeclarationSchema
	.pick({
		id: true,
		kind: true,
		title: true,
		prompt: true,
		tools: true,
		corpusFiles: true,
		checks: true,
		model: true,
		sessionBudgetUsd: true,
	})
	.extend({
		kind: z.literal("session", {
			error: (issue) =>
				issue.input === "pipeline" ? DECLARED_BY_HAND_REASON : undefined,
		}),
		prompt: z
			.string()
			.min(1)
			.refine(
				(prompt) => !prompt.startsWith("-"),
				"A prompt cannot start with -, which the claude CLI would read as an option",
			),
		model: z.string().min(1),
	})
	.strict();

function refusedFieldReason(field: string): string {
	if (!CASE_FIELDS.has(field)) {
		return `${field} is not a case.json field`;
	}

	return `${field} is declared by hand in case.json: the browser sets only ${declareCaseRequestSchema.keyof().options.join(", ")}`;
}

/** Names a field the browser may not set with why it may not. */
export const refusedFieldMessages: z.core.$ZodErrorMap = (issue) =>
	issue.code === "unrecognized_keys"
		? issue.keys.map(refusedFieldReason).join("; ")
		: undefined;

export type DeclareCaseRequest = z.infer<typeof declareCaseRequestSchema>;

export interface DeclaredCase {
	/** The declaration as written, without the defaults the parser fills in. */
	readonly declaration: Immutable<DeclareCaseRequest>;
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

/** The file is read back as a run reads it, so it is refused as a run would. */
function refuseUnreadable(id: string, text: string): void {
	try {
		parseCaseDeclaration(id, text);
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
 * It checks the layout before resolving `..`, so a path with a `.` or `..`
 * segment is refused first. Whether each file exists is left to the run, as
 * for a hand-written case.
 */
function refuseCorpusFiles(
	corpusFiles: readonly string[],
	corpus: CorpusRoot,
): void {
	for (const layoutPath of corpusFiles) {
		if (posix.normalize(layoutPath) !== layoutPath) {
			throw new DeclarationRefusalError(
				`Corpus file ${layoutPath} must be a layout path with no . or .. segment`,
				400,
			);
		}

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
		throw new DeclarationRefusalError(
			`Case ${id} already has a directory under ${CASES_DIRECTORY}/`,
			409,
		);
	}
}

/**
 * Writes the request as typed rather than the parsed declaration, so a default
 * the parser fills in never reaches the file.
 */
export async function declareCase(
	request: Immutable<DeclareCaseRequest>,
	casesRoot: string,
	corpus: CorpusRoot,
): Promise<DeclaredCase> {
	const text = `${JSON.stringify(request, null, "\t")}\n`;
	refuseUnreadable(request.id, text);
	refuseCorpusFiles(request.corpusFiles, corpus);

	const file = caseDeclarationPath(request.id, casesRoot);
	await claimCaseDirectory(dirname(file), request.id);
	try {
		await writeFile(file, text, { flag: "wx" });
	} catch (error) {
		await rm(dirname(file), { force: true, recursive: true });
		throw error;
	}

	return {
		declaration: request,
		path: caseDeclarationPath(request.id, CASES_DIRECTORY),
	};
}
