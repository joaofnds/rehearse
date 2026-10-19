import type { HashedFile } from "./checkpoint";
import type { Effort } from "./config";
import type { ContextFile } from "./contracts";
import type { OutputWords } from "./output-words";

/**
 * The inputs an attempt itself ran with. Two attempts are comparable only
 * when these agree; a difference means the two ran against different corpora
 * and their grades measure different things.
 */
interface AttemptLineageInputs {
	readonly corpusFiles: readonly HashedFile[];
	readonly model: string;
	readonly effort?: Effort | undefined;
}

class LineageMismatchError extends Error {
	public override name = "LineageMismatchError";
}

/**
 * One execution of a stage at a checkpoint: the original run's stage result
 * or any replay. Only what a side-by-side presentation needs is read; the
 * full evidence stays in the record on disk.
 */
interface Attempt {
	readonly label: string;
	readonly grade: string;
	readonly verdict: "CONTINUE" | "STOP";
	readonly dimensions: readonly {
		readonly id: string;
		readonly grade: string;
	}[];
	readonly judgeCostUsd: number;
	readonly totalCostUsd?: number | undefined;
	readonly artifact?: ContextFile | undefined;
	readonly changedPaths?: readonly string[] | undefined;
	readonly diff?: string | undefined;
	readonly words: OutputWords;
	readonly lineageInputs?: AttemptLineageInputs | undefined;
}
export { LineageMismatchError as default };
export type { AttemptLineageInputs, Attempt };
