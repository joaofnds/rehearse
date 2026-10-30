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
import { effortSchema } from "#benchmark/config";
import type { Immutable } from "#benchmark/contracts";
import type { CorpusRoot } from "#benchmark/corpus-file";
import { CorpusFileError, resolveCorpusFile } from "#benchmark/corpus-file";
import projectFormatted from "#benchmark/project-format";
import {
	HTTP_STATUS_BAD_REQUEST,
	HTTP_STATUS_CONFLICT,
} from "#server/http-status";

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
const declareCaseRequestSchema = sessionCaseDeclarationSchema
	.pick({
		checks: true,
		corpusFiles: true,
		effort: true,
		id: true,
		kind: true,
		model: true,
		prompt: true,
		sessionBudgetUsd: true,
		title: true,
		tools: true,
	})
	.extend({
		effort: effortSchema,
		kind: z.literal("session", {
			error: (issue) =>
				issue.input === "pipeline"
					? "A pipeline case is declared through /api/cases/pipeline"
					: undefined,
		}),
		model: z.string().nonempty(),
		prompt: z
			.string()
			.nonempty()
			.refine(
				(prompt) => !prompt.startsWith("-"),
				"A prompt cannot start with -, which the claude CLI would read as an option",
			),
	})
	.strict();

type DeclareCaseRequest = z.infer<typeof declareCaseRequestSchema>;

const DECLARATION_FIELDS: readonly (keyof DeclareCaseRequest)[] = [
	"id",
	"kind",
	"title",
	"prompt",
	"tools",
	"corpusFiles",
	"checks",
	"model",
	"effort",
	"sessionBudgetUsd",
];

function refusedFieldReason(field: string): string {
	if (!CASE_FIELDS.has(field)) {
		return `${field} is not a case.json field`;
	}

	return `${field} is declared by hand in case.json: the browser sets only ${DECLARATION_FIELDS.join(", ")}`;
}

/** Names a field the browser may not set with why it may not. */
const refusedFieldMessages: z.core.$ZodErrorMap = (issue) =>
	issue.code === "unrecognized_keys"
		? issue.keys.map(refusedFieldReason).join("; ")
		: undefined;

interface DeclaredCase {
	/** The declaration as written, without the defaults the parser fills in. */
	readonly declaration: Immutable<DeclareCaseRequest>;
	/** Relative to the control repository, where the file is uncommitted. */
	readonly path: string;
}

/**
 * A declaration that cannot be written as asked: one the parser or the corpus
 * refuses is 400, and an id already on disk is 409.
 */
class DeclarationRefusalError extends Error {
	public override name = "DeclarationRefusalError";

	public constructor(
		message: string,
		public readonly status:
			| typeof HTTP_STATUS_BAD_REQUEST
			| typeof HTTP_STATUS_CONFLICT,
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
		throw new DeclarationRefusalError(error.message, HTTP_STATUS_BAD_REQUEST);
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
				HTTP_STATUS_BAD_REQUEST,
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
				HTTP_STATUS_BAD_REQUEST,
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
			HTTP_STATUS_CONFLICT,
		);
	}
}

async function formattedCaseDeclaration(
	file: string,
	request: Immutable<DeclareCaseRequest>,
): Promise<string> {
	const declaration = Object.fromEntries<
		(typeof request)[keyof DeclareCaseRequest]
	>(DECLARATION_FIELDS.map((field) => [field, request[field]]));
	return await projectFormatted(file, JSON.stringify(declaration, null, "\t"));
}

/**
 * Writes the request as typed rather than the parsed declaration, so a default
 * the parser fills in never reaches the file, and as the project's formatter
 * would, so it commits as written.
 */
async function declareCase(
	request: Immutable<DeclareCaseRequest>,
	casesRoot: string,
	corpus: CorpusRoot,
): Promise<DeclaredCase> {
	const file = caseDeclarationPath(request.id, casesRoot);
	const text = await formattedCaseDeclaration(file, request);

	refuseUnreadable(request.id, text);
	refuseCorpusFiles(request.corpusFiles, corpus);

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

export {
	declareCaseRequestSchema,
	refusedFieldMessages,
	DeclarationRefusalError,
	declareCase,
};
export type { DeclareCaseRequest, DeclaredCase };
