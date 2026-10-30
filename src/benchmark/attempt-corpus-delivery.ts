import type { Immutable } from "./contracts";
import type { CorpusDeliveryRecord } from "./corpus-delivery";
import liveCorpusReads from "./live-corpus-reads";
import type { CorpusOverlay } from "./session-attempt-preparation-contract";
import { recordedSubagents } from "./subagent-evidence";
import { parseTranscript, toolUses } from "./transcript";
import type { TranscriptLine } from "./transcript-line-contract";

/**
 * How the attempt's corpus reached its session, with the live reads its own
 * turn and every sub-agent transcript the record kept made, since a sub-agent
 * follows citations as often as the session that started it.
 */
async function attemptCorpusDelivery(
	overlay: Pick<CorpusOverlay, "citations" | "delivery" | "held">,
	turn: Immutable<readonly TranscriptLine[]>,
	recordDirectory: string,
): Promise<CorpusDeliveryRecord> {
	const subagents = await recordedSubagents(recordDirectory);
	const uses = [
		...toolUses(turn),
		...subagents.flatMap(({ transcript }) =>
			toolUses(parseTranscript(transcript)),
		),
	];

	return {
		...overlay.delivery,
		liveReads: liveCorpusReads(uses, overlay.citations, new Set(overlay.held)),
	};
}

export { attemptCorpusDelivery as default };
