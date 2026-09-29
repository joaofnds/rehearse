import { z } from "zod";
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

/**
 * Only the part of a recorded stage transcript a word count reads, loose so a
 * record carrying the rest of the transcript still parses.
 */
export const recordedFinalReplySchema = z
	.object({
		exchanges: z.array(
			z.object({ agent: z.object({ message: z.string() }).loose() }).loose(),
		),
	})
	.loose();

interface StageOutput {
	readonly artifact?: { readonly content: string } | undefined;
	readonly transcript?:
		| {
				readonly exchanges: readonly {
					readonly agent: { readonly message: string };
				}[];
		  }
		| undefined;
}

/**
 * A stage's output is the artifact its judge read. A stage that wrote none,
 * as a delivery stage whose output is a diff, is counted by the worker's final
 * reply instead, because code length says nothing about verbosity.
 */
export function stageOutputWords(output: StageOutput): OutputWords {
	if (output.artifact !== undefined) {
		return { state: "available", words: countWords(output.artifact.content) };
	}

	const finalReply = output.transcript?.exchanges.at(-1)?.agent.message;
	if (finalReply !== undefined) {
		return { state: "available", words: countWords(finalReply) };
	}

	return { state: "unavailable", reason: "the stage recorded no output" };
}
