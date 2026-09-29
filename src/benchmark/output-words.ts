import { countWords } from "./session-check-word-band";

/**
 * How long an attempt's output ran, which is how verbosity gets caught. A
 * missing output reads unavailable with its reason, never zero words, because
 * zero would claim an attempt answered in silence.
 */
export type OutputWords =
	| { readonly state: "available"; readonly words: number }
	| { readonly state: "unavailable"; readonly reason: string };

export function replyWords(reply: string | undefined): OutputWords {
	if (reply === undefined) {
		return { state: "unavailable", reason: "the attempt recorded no reply" };
	}

	return { state: "available", words: countWords(reply) };
}

interface StageOutput {
	readonly artifact?: { readonly content: string } | undefined;
	readonly diff?: string | undefined;
}

/**
 * A stage's output is the artifact its judge read. A diff is code, whose
 * length says nothing about verbosity, so a diff-only stage reads unavailable.
 */
export function stageOutputWords(output: StageOutput): OutputWords {
	if (output.artifact !== undefined) {
		return { state: "available", words: countWords(output.artifact.content) };
	}
	if (output.diff !== undefined) {
		return {
			state: "unavailable",
			reason: "the stage's only output is a diff",
		};
	}

	return { state: "unavailable", reason: "the stage recorded no output" };
}
