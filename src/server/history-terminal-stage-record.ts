import {
	awaitingJudgeStageRecordSchema,
	stageRecordDetailSchema,
	stoppedStageRecordSchema,
} from "#benchmark/run-outcome";
import { SessionHistoryReaderError } from "#server/history-read-identity";
import type { StageHistoryIdentityInput } from "#server/history-read-identity";
import { readVerifiedFile } from "#server/history-verified-file";
import { verifiedFile } from "#server/history-verified-path";

/**
 * What both records name the stage by, before each adds the state it rests in.
 */
interface TerminalStageRecord {
	readonly detail: ReturnType<typeof stageRecordDetailSchema.safeParse>;
	readonly stopped: ReturnType<typeof stoppedStageRecordSchema.safeParse>;
	readonly recordedStage: string;
}

async function terminalStageRecord(
	root: string,
	identity: Readonly<StageHistoryIdentityInput>,
): Promise<TerminalStageRecord> {
	const recordFile = await verifiedFile(root, {
		directory: root,
		name: `${identity.run}.${identity.stage}.json`,
		required: false,
	});
	if (recordFile === undefined) {
		throw new SessionHistoryReaderError(
			"not-found",
			"No saved attempt at this identity",
		);
	}

	const record = parseTerminalStageRecord(
		await readVerifiedFile(root, recordFile),
	);
	if (record.recordedStage !== identity.stage) {
		throw new SessionHistoryReaderError(
			"refused",
			"Saved stage record does not own this stage identity",
		);
	}

	return {
		detail: stageRecordDetailSchema.safeParse(record.contents),
		recordedStage: record.recordedStage,
		stopped: record.stopped,
	};
}

interface ParsedTerminalStageRecord {
	readonly contents:
		| ReturnType<typeof stoppedStageRecordSchema.parse>
		| ReturnType<typeof awaitingJudgeStageRecordSchema.parse>;
	readonly recordedStage: string;
	readonly stopped: ReturnType<typeof stoppedStageRecordSchema.safeParse>;
}

function parseTerminalStageRecord(text: string): ParsedTerminalStageRecord {
	const contents: unknown = JSON.parse(text);
	const stopped = stoppedStageRecordSchema.safeParse(contents);
	const awaitingJudge = awaitingJudgeStageRecordSchema.safeParse(contents);
	const record = stopped.success ? stopped : awaitingJudge;
	if (!record.success) {
		throw new SessionHistoryReaderError(
			"not-found",
			"No saved attempt at this identity",
		);
	}

	return {
		contents: record.data,
		recordedStage: record.data.stage,
		stopped,
	};
}

export { terminalStageRecord as default };
