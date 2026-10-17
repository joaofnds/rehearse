import { AsyncLocalStorage } from "node:async_hooks";
import type { HashedFile, StageCorpus } from "./checkpoint";
import type { ResolvedCorpusFile } from "./corpus-file";
import type { HashedLayout } from "./corpus-layout";

interface CorpusReadScope {
	readonly files: Map<string, Promise<ResolvedCorpusFile>>;
	readonly stages: Map<string, Promise<StageCorpus>>;
	readonly layouts: Map<string, Promise<HashedLayout>>;
	readonly versions: Map<string, Promise<readonly HashedFile[]>>;
}

const scope = new AsyncLocalStorage<CorpusReadScope>();

export function currentCorpusReadScope(): CorpusReadScope | undefined {
	return scope.getStore();
}

/** Reuse reads within one report, including nested reports, never across requests. */
export function withCorpusReadScope<Value>(
	read: () => Promise<Value>,
): Promise<Value> {
	if (scope.getStore() !== undefined) {
		return read();
	}

	return scope.run(
		{
			files: new Map(),
			stages: new Map(),
			layouts: new Map(),
			versions: new Map(),
		},
		read,
	);
}
