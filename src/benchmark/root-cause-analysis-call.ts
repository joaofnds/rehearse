import type { AnalysisRequest, AnalysisResult } from "./root-cause-analysis";
import {
	analysisRecordBase,
	provisionalAnalysis,
	resolveReading,
	withCost,
} from "./root-cause-analysis-answer";
import type { SessionReading } from "./root-cause-analysis-provider";
import type {
	AnalysisRecordWriter,
	ClaimedAnalysis,
} from "./root-cause-analysis-storage";
import type { RootCauseBundle } from "./root-cause-bundle";

interface AnalysisCallRequest {
	readonly request: AnalysisRequest;
	readonly budgetUsd: number;
	readonly bundle: RootCauseBundle;
	readonly bundleText: string;
	readonly records: AnalysisRecordWriter;
	readonly now: () => Date;
}

/**
 * One analysis's paid call, from the record that holds its place before the
 * call to the outcome that replaces it, so no way the call ends leaves it
 * unrecorded.
 */
class AnalysisCall {
	private constructor(
		private readonly call: AnalysisCallRequest,
		private readonly claimed: ClaimedAnalysis,
	) {}

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
		const base = analysisRecordBase({
			...this.call,
			finished: this.call.now(),
			started: new Date(this.claimed.record.startedAt),
		});
		const record = withCost(
			resolveReading(base, reading, this.call.bundle),
			reading.costUsd,
		);

		await this.call.records.replace(file, record);

		return { file, record };
	}
}

export { AnalysisCall as default };
