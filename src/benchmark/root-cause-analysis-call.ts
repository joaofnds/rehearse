import { once } from "node:events";

import { refuseCommands } from "./command";
import type {
	AnalysisRequest,
	AnalysisResult,
	SignalStopInstaller,
} from "./root-cause-analysis";
import {
	analysisRecordBase,
	provisionalAnalysis,
	resolveReading,
	stoppedAnalysis,
	withCost,
} from "./root-cause-analysis-answer";
import type { FailedAnalysis } from "./root-cause-analysis-protocol";
import type { SessionReading } from "./root-cause-analysis-provider";
import type {
	AnalysisRecordWriter,
	ClaimedAnalysis,
} from "./root-cause-analysis-storage";
import type { RootCauseBundle } from "./root-cause-bundle";

// The stop waits this long for the call it killed to settle and remove its
// temporary directory, so a hung settle cannot hold the exit.
const STOP_SETTLE_BOUND_MS = 5000;

interface AnalysisCallRequest {
	readonly request: AnalysisRequest;
	readonly budgetUsd: number;
	readonly bundle: RootCauseBundle;
	readonly bundleText: string;
	readonly records: AnalysisRecordWriter;
	readonly now: () => Date;
	readonly stopOnSignal: SignalStopInstaller;
}

/**
 * One analysis's paid call, from the record that holds its place before the
 * call to the outcome or the stop that replaces it, so no way the call ends
 * leaves it unrecorded. Settling is one synchronous step, so the outcome and
 * a stop never both replace the record: a stop that began first keeps its
 * record, and one that comes later leaves the outcome alone.
 */
class AnalysisCall {
	private stopRecord: FailedAnalysis | undefined = undefined;
	private isSettled = false;
	private readonly settled = Promise.withResolvers<undefined>();
	private readonly release: () => void;

	private constructor(
		private readonly call: AnalysisCallRequest,
		private readonly claimed: ClaimedAnalysis,
	) {
		this.release = call.stopOnSignal(
			async () => {
				await Promise.race([
					this.settled.promise,
					once(AbortSignal.timeout(STOP_SETTLE_BOUND_MS), "abort"),
				]);
			},
			async (signal) => {
				await this.recordStop(signal);
			},
		);
	}

	public static async claim(call: AnalysisCallRequest): Promise<AnalysisCall> {
		const started = call.now();
		const claimed = await call.records.claim(
			call.request.runsDirectory,
			provisionalAnalysis(
				analysisRecordBase({ ...call, finished: started, started }),
			),
		);

		return new AnalysisCall(call, claimed);
	}

	public async settle(reading: SessionReading): Promise<AnalysisResult> {
		const { file } = this.claimed;
		this.isSettled = true;
		this.settled.resolve();
		try {
			if (this.stopRecord !== undefined) {
				return { file, record: this.stopRecord, stopped: true };
			}

			const record = this.outcome(reading);
			await this.call.records.replace(file, record);

			return { file, record, stopped: false };
		} finally {
			this.release();
		}
	}

	private outcome(reading: SessionReading): AnalysisResult["record"] {
		const base = analysisRecordBase({
			...this.call,
			finished: this.call.now(),
			started: new Date(this.claimed.record.startedAt),
		});

		return withCost(
			resolveReading(base, reading, this.call.bundle),
			reading.costUsd,
		);
	}

	/**
	 * Commands are refused even when the record cannot be written, since a
	 * claude spawn still pending would otherwise start after the kill and
	 * outlive the exit.
	 */
	private async recordStop(signal: NodeJS.Signals): Promise<void> {
		try {
			if (this.isSettled) {
				return;
			}

			this.stopRecord = stoppedAnalysis({
				provisional: this.claimed.record,
				signal,
				stopped: this.call.now(),
			});
			await this.call.records.replace(this.claimed.file, this.stopRecord);
		} finally {
			refuseCommands();
		}
	}
}

export { AnalysisCall as default };
