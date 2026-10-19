import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

import { z } from "zod";

import CorpusConfigurationError from "./corpus-configuration";
import type { LiveCorpusRoot } from "./corpus-path";

/**
 * Where the corpus is installed for a session that names no source. Every
 * other corpus kind is already read from here; the instruction file is too.
 */
function liveCorpusRoot(): string {
	return join(homedir(), ".claude");
}

/**
 * The live install as a corpus source. A run, replay, or calibration takes no
 * corpus source, so the corpus it measures is whatever is installed.
 */
const LIVE_CORPUS_BACKING_ROOT_ENV = "BENCHMARK_LIVE_CORPUS_BACKING_ROOT";

const backingRootSchema = z
	.string()
	.nonempty()
	.refine((path) => !path.includes("\0"))
	.refine(isAbsolute);

interface LiveCorpusSourceOptions {
	readonly root?: string | undefined;
	readonly backingRoot?: string | undefined;
	readonly env?: Readonly<Record<string, string | undefined>> | undefined;
}

function liveCorpusSource(
	options: LiveCorpusSourceOptions = {},
): LiveCorpusRoot {
	const root = options.root ?? liveCorpusRoot();
	const configured =
		options.backingRoot ??
		(options.env ?? Bun.env)[LIVE_CORPUS_BACKING_ROOT_ENV] ??
		join(homedir(), ".agents");
	const parsed = backingRootSchema.safeParse(configured);

	if (!parsed.success) {
		throw new CorpusConfigurationError(
			`${LIVE_CORPUS_BACKING_ROOT_ENV} must name a non-empty absolute path without NUL bytes`,
		);
	}

	return { backingRoot: parsed.data, kind: "live", root };
}

export { liveCorpusRoot, LIVE_CORPUS_BACKING_ROOT_ENV, liveCorpusSource };
export type { LiveCorpusSourceOptions };
