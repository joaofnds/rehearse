import {
	CorpusConfigurationError,
	CorpusFileError,
} from "#benchmark/corpus-file";
import { SymlinkedEntryError } from "#benchmark/file-presence";
import { SessionCorpusError } from "#benchmark/session-corpus";
import { RefusedPreconditionError } from "#cli/interactive-stdin";

function corpusRefusal(
	error: Readonly<Error>,
): RefusedPreconditionError | undefined {
	if (
		error instanceof CorpusConfigurationError ||
		error instanceof CorpusFileError ||
		error instanceof SessionCorpusError ||
		error instanceof SymlinkedEntryError
	) {
		return new RefusedPreconditionError(error.message);
	}

	return undefined;
}

export { corpusRefusal as default };
