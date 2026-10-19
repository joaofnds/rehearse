import type { ResolvedCorpusSource } from "#benchmark/corpus-source";
import { CorpusSourceError } from "#benchmark/corpus-source";
import type { ShowDependencies } from "#cli/show-command";

const NO_CORPUS: ShowDependencies = {
	resolveCorpus: async () =>
		await Promise.reject(new CorpusSourceError("this test resolves no corpus")),
};

function corpusAt(root: string): ShowDependencies {
	return {
		resolveCorpus: async () =>
			await Promise.resolve<ResolvedCorpusSource>({
				kind: "directory",
				root,
			}),
	};
}

export { corpusAt, NO_CORPUS };
