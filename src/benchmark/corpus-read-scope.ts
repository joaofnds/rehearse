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

function currentCorpusReadScope(): CorpusReadScope | undefined {
	return scope.getStore();
}

/** Reuse reads within one report, including nested reports, never across requests. */
async function withCorpusReadScope<Value>(
	read: () => Promise<Value>,
): Promise<Value> {
	if (scope.getStore() !== undefined) {
		return await read();
	}

	return await scope.run(
		{
			files: new Map(),
			layouts: new Map(),
			stages: new Map(),
			versions: new Map(),
		},
		read,
	);
}

export { currentCorpusReadScope, withCorpusReadScope };
