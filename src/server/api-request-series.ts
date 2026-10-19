import { redactedFilePath } from "#server/redact-path";
import type { SessionHistoryAttemptSeries } from "#server/session-history-reader";

/**
 * The instructions attachment records each loaded file by its absolute path on
 * the machine that ran the attempt, so serving it verbatim would put the
 * operator's home directory into a browser. `redactedFilePath` drops the
 * directories above the file and keeps the file's own name, because a load is
 * named by its path and its memory type and a list of identical placeholders
 * names no file.
 */
function redactedSeries(
	read: Readonly<SessionHistoryAttemptSeries>,
): SessionHistoryAttemptSeries {
	const { instructionLoads } = read;
	if (instructionLoads.state === "unavailable") {
		return read;
	}

	return {
		...read,
		instructionLoads: {
			loads: instructionLoads.loads.map((load) => ({
				filePath: redactedFilePath(load.filePath),
				loadReason: load.loadReason,
				memoryType: load.memoryType,
				parentFilePath: load.parentFilePath,
				triggerFilePath: load.triggerFilePath,
			})),
			state: "available",
		},
	};
}

export { redactedSeries as default };
