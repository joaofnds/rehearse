import type { ContextRateCatalog } from "#benchmark/context-evidence-contract";
import {
	sessionHistoryAttemptCost,
	sessionHistoryDetailFromLine,
	sessionHistoryReport,
	sessionHistoryReportFromLines,
	sessionHistoryRequestCosts,
	sessionHistoryRequestSeries,
	sessionHistoryRequestSeriesFromLines,
	stageCorpusReconciliation,
} from "#benchmark/session-history";
import type {
	SessionHistoryAttemptCost,
	SessionHistoryDetail,
	SessionHistoryReport,
	SessionHistoryRequestCost,
	SessionHistoryRequestSeries,
	StageCorpusEntry,
} from "#benchmark/session-history";
import { transcriptInstructionLoadsFromLines } from "#benchmark/transcript-instruction-loads";
import type { TranscriptInstructionLoads } from "#benchmark/transcript-instruction-loads";
import {
	agentDetailFor,
	agentsFor,
	attemptCostOverAgentsFor,
} from "#server/history-agent-reading";
import type { SessionHistoryAgents } from "#server/history-agent-reading";
import type {
	ResolvedAttemptInput,
	ResolvedHistoryInput,
} from "#server/history-input-contract";
import type {
	ConfirmationAttemptHistoryIdentity,
	ReplayHistoryIdentityInput,
	SessionAttemptHistoryIdentity,
	StageHistoryIdentityInput,
} from "#server/history-read-identity";
import replayInput from "#server/history-replay-input";
import {
	confirmationInput,
	standaloneInput,
} from "#server/history-session-input";
import stageInput from "#server/history-stage-input";
import {
	readVerifiedLine,
	readVerifiedLines,
} from "#server/history-verified-file";

async function reportFor(
	input: Readonly<ResolvedHistoryInput>,
): Promise<SessionHistoryReport> {
	return await (input.transcriptFile === undefined
		? Promise.resolve(
				sessionHistoryReport({ ...input.metadata, transcript: undefined }),
			)
		: sessionHistoryReportFromLines(
				input.metadata,
				readVerifiedLines(input.root, input.transcriptFile),
			));
}

async function detailFor(
	input: Readonly<ResolvedHistoryInput>,
	eventId: string,
): Promise<SessionHistoryDetail | undefined> {
	if (input.transcriptFile === undefined) {
		return undefined;
	}

	const report = await reportFor(input);
	const event = [
		...report.startingContext,
		...report.attemptEvents,
		...report.boundaryUnknown,
	].find(({ id }) => id === eventId);
	if (event === undefined) {
		return undefined;
	}

	const line = await readVerifiedLine(
		input.root,
		input.transcriptFile,
		event.locator.line,
	);

	return line === undefined
		? undefined
		: sessionHistoryDetailFromLine(report, input.metadata.resolvedCorpusFiles, {
				eventId,
				lineText: line,
			});
}

async function readSessionAttemptHistory(
	identity: Readonly<SessionAttemptHistoryIdentity>,
): Promise<SessionHistoryReport> {
	return await reportFor(await standaloneInput(identity));
}

async function readSessionAttemptHistoryDetail(
	identity: Readonly<SessionAttemptHistoryIdentity>,
	eventId: string,
): Promise<SessionHistoryDetail | undefined> {
	return await detailFor(await standaloneInput(identity), eventId);
}

async function readStageHistory(
	identity: Readonly<StageHistoryIdentityInput>,
): Promise<SessionHistoryReport> {
	return await reportFor(await stageInput(identity));
}

async function readStageHistoryDetail(
	identity: Readonly<StageHistoryIdentityInput>,
	eventId: string,
): Promise<SessionHistoryDetail | undefined> {
	return await detailFor(await stageInput(identity), eventId);
}

async function readReplayHistory(
	identity: Readonly<ReplayHistoryIdentityInput>,
): Promise<SessionHistoryReport> {
	return await reportFor(await replayInput(identity));
}

async function readStageCorpusReconciliation(
	identity: Readonly<StageHistoryIdentityInput>,
): Promise<readonly StageCorpusEntry[]> {
	return stageCorpusReconciliation(await readStageHistory(identity));
}

async function readConfirmationAttemptHistory(
	identity: Readonly<ConfirmationAttemptHistoryIdentity>,
): Promise<SessionHistoryReport> {
	return await reportFor(await confirmationInput(identity));
}

async function readConfirmationAttemptHistoryDetail(
	identity: Readonly<ConfirmationAttemptHistoryIdentity>,
	eventId: string,
): Promise<SessionHistoryDetail | undefined> {
	return await detailFor(await confirmationInput(identity), eventId);
}

interface SessionHistoryRequestCostEntry {
	readonly line: number;
	readonly cost: SessionHistoryRequestCost;
}

interface SessionHistoryAttemptSeries {
	readonly series: SessionHistoryRequestSeries;
	readonly cost: SessionHistoryAttemptCost;
	/**
	 * Keyed by line rather than requestId: a request recording no id still
	 * occupies a row, and a Map does not survive the route's JSON encoding.
	 */
	readonly requestCosts: readonly SessionHistoryRequestCostEntry[];
	readonly instructionLoads: TranscriptInstructionLoads;
}

/**
 * The series decoder validates only the two row kinds it reads, which is what
 * keeps a series over the largest saved transcript fast, and an instructions
 * attachment is a third kind. Rather than widen that schema, the loads take
 * their own streamed pass: measured at 10ms over the largest saved transcript
 * (3.9MB), against the coordination a shared single pass would need.
 */
async function seriesFor(
	input: Readonly<ResolvedAttemptInput>,
	rates: ContextRateCatalog | undefined,
): Promise<SessionHistoryAttemptSeries> {
	const { transcriptFile } = input;
	const series =
		transcriptFile === undefined
			? sessionHistoryRequestSeries({
					prefixLinesExcluded: input.metadata.prefixLinesExcluded,
					transcript: undefined,
				})
			: await sessionHistoryRequestSeriesFromLines(
					{ prefixLinesExcluded: input.metadata.prefixLinesExcluded },
					readVerifiedLines(input.root, transcriptFile),
				);

	return {
		cost:
			rates === undefined
				? sessionHistoryAttemptCost({
						rates,
						reportedCostUsd: input.reportedCostUsd,
						series,
					})
				: await attemptCostOverAgentsFor(input, series, rates),
		instructionLoads:
			transcriptFile === undefined
				? { state: "unavailable" }
				: await transcriptInstructionLoadsFromLines(
						readVerifiedLines(input.root, transcriptFile),
					),
		requestCosts: [...sessionHistoryRequestCosts(series, rates)].map(
			([line, cost]) => ({ cost, line }),
		),
		series,
	};
}

async function readSessionAttemptRequestSeries(
	identity: Readonly<SessionAttemptHistoryIdentity>,
	rates?: ContextRateCatalog,
): Promise<SessionHistoryAttemptSeries> {
	return await seriesFor(await standaloneInput(identity), rates);
}

async function readConfirmationAttemptRequestSeries(
	identity: Readonly<ConfirmationAttemptHistoryIdentity>,
	rates?: ContextRateCatalog,
): Promise<SessionHistoryAttemptSeries> {
	return await seriesFor(await confirmationInput(identity), rates);
}

async function readSessionAttemptAgents(
	identity: Readonly<SessionAttemptHistoryIdentity>,
	rates: ContextRateCatalog,
): Promise<SessionHistoryAgents> {
	return await agentsFor(await standaloneInput(identity), rates);
}

async function readConfirmationAttemptAgents(
	identity: Readonly<ConfirmationAttemptHistoryIdentity>,
	rates: ContextRateCatalog,
): Promise<SessionHistoryAgents> {
	return await agentsFor(await confirmationInput(identity), rates);
}

async function readSessionAttemptAgentDetail(
	identity: Readonly<SessionAttemptHistoryIdentity>,
	agentId: string,
	eventId: string,
): Promise<SessionHistoryDetail | undefined> {
	return await agentDetailFor(
		await standaloneInput(identity),
		agentId,
		eventId,
	);
}

async function readConfirmationAttemptAgentDetail(
	identity: Readonly<ConfirmationAttemptHistoryIdentity>,
	agentId: string,
	eventId: string,
): Promise<SessionHistoryDetail | undefined> {
	return await agentDetailFor(
		await confirmationInput(identity),
		agentId,
		eventId,
	);
}

export {
	readSessionAttemptHistory,
	readSessionAttemptHistoryDetail,
	readStageHistory,
	readStageHistoryDetail,
	readReplayHistory,
	readStageCorpusReconciliation,
	readConfirmationAttemptHistory,
	readConfirmationAttemptHistoryDetail,
	readSessionAttemptRequestSeries,
	readConfirmationAttemptRequestSeries,
	readSessionAttemptAgents,
	readConfirmationAttemptAgents,
	readSessionAttemptAgentDetail,
	readConfirmationAttemptAgentDetail,
};
export type { SessionHistoryRequestCostEntry, SessionHistoryAttemptSeries };
export {
	SessionHistoryReaderError,
	parseIdentity,
} from "#server/history-read-identity";
export {
	canonicalRunsRoot,
	verifiedDirectory,
	verifiedDirectoryWhenPresent,
	verifiedFile,
} from "#server/history-verified-path";
export {
	readVerifiedFile,
	readVerifiedLines,
} from "#server/history-verified-file";
export { default as readRecordedEvidenceFile } from "#server/history-recorded-evidence";
export { default as runManifest } from "#server/history-run-manifest";
export type { RecordedEvidenceFile } from "#server/history-recorded-evidence";
export type { SessionHistoryAgents } from "#server/history-agent-reading";
