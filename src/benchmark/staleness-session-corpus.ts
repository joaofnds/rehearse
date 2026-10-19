import type { CaseDeclaration, SessionCaseDeclaration } from "./case";
import { listCases } from "./case";
import type { StageCorpus } from "./checkpoint";
import { hashedCorpus, refusedCorpus } from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";
import {
	CorpusFileError,
	hashCorpusFiles,
	withoutAbsolutePaths,
} from "./corpus-file";
import { SymlinkedEntryError } from "./file-presence";

class SessionCaseCorpora {
	private readonly pending = new Map<string, Promise<StageCorpus>>();
	public constructor(private readonly source: CorpusRoot) {}
	public async get(caseId: string): Promise<StageCorpus> {
		let reading = this.pending.get(caseId);
		if (reading === undefined) {
			reading = sessionCaseCorpusNow(caseId, this.source);
			this.pending.set(caseId, reading);
		}
		return await reading;
	}
}

function sessionCases(
	declarations: readonly CaseDeclaration[],
): readonly SessionCaseDeclaration[] {
	return declarations.filter(
		(declaration): declaration is SessionCaseDeclaration =>
			declaration.kind === "session",
	);
}

/**
 * The declared files as the corpus under test holds them now, or why it
 * cannot hold them. A declared corpus file the corpus under test no longer
 * holds invalidates the measurement as surely as an edit does, the case cannot
 * even run against this corpus, so it is a cause rather than a failure that
 * hides every other case's answer.
 *
 * The cause names the layout path alone. A refusal built for a caller that
 * throws carries the resolved path, which helps an operator reading a refusal
 * on stderr and leaks the corpus root into the record ids and causes this
 * command prints on stdout, where a reader acts on the layout path anyway.
 */
async function currentCaseCorpus(
	declaration: SessionCaseDeclaration,
	source: CorpusRoot,
): Promise<StageCorpus> {
	try {
		const current = await hashCorpusFiles(source, declaration.corpusFiles);

		return hashedCorpus(current.map(({ path, sha256 }) => ({ path, sha256 })));
	} catch (error) {
		if (
			error instanceof CorpusFileError ||
			error instanceof SymlinkedEntryError
		) {
			return refusedCorpus(withoutAbsolutePaths(error.message, source));
		}

		throw error;
	}
}

async function sessionCaseCorpusNow(
	caseId: string,
	source: CorpusRoot,
): Promise<StageCorpus> {
	const listing = await listCases(undefined, { includeArchived: true });
	const declaration = sessionCases(listing.declarations).find(
		({ id }) => id === caseId,
	);
	if (declaration === undefined) {
		throw new Error("corpus files unknown: case no longer declared");
	}

	return await currentCaseCorpus(declaration, source);
}

export {
	SessionCaseCorpora,
	sessionCases,
	currentCaseCorpus,
	sessionCaseCorpusNow,
};
