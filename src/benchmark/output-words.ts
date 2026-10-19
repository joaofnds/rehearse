import { z } from "zod";

import { countWords } from "./session-check-word-band";

const FINAL_SESSION_EXCHANGE_OFFSET = -1;

/**
 * How long an attempt's output ran, which is how verbosity gets caught. A
 * missing output reads unavailable with its reason, never zero words, because
 * zero would claim an attempt answered in silence.
 */
type OutputWords =
	| { readonly state: "available"; readonly words: number }
	| { readonly state: "unavailable"; readonly reason: string };

function replyWords(reply?: string): OutputWords {
	if (reply === undefined) {
		return { reason: "the attempt recorded no reply", state: "unavailable" };
	}

	return { state: "available", words: countWords(reply) };
}

const recordedReplyAgentSchema = z.object({ message: z.string() }).loose();

const recordedReplyExchangeSchema = z
	.object({ agent: recordedReplyAgentSchema })
	.loose();

/**
 * Only the part of a recorded stage transcript a word count reads, loose so a
 * record carrying the rest of the transcript still parses.
 */
const recordedFinalReplySchema = z
	.object({
		exchanges: z.array(recordedReplyExchangeSchema),
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
function stageOutputWords(output: StageOutput): OutputWords {
	if (output.artifact !== undefined) {
		return { state: "available", words: countWords(output.artifact.content) };
	}

	const finalReply = output.transcript?.exchanges.at(
		FINAL_SESSION_EXCHANGE_OFFSET,
	)?.agent.message;
	if (finalReply !== undefined) {
		return { state: "available", words: countWords(finalReply) };
	}

	return { reason: "the stage recorded no output", state: "unavailable" };
}

export { replyWords, recordedFinalReplySchema, stageOutputWords };
export type { OutputWords };
