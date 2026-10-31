import type {
	FailedAnalysis,
	RootCauseAnalysisRecord,
} from "./root-cause-analysis-protocol";
import { analysisRecordFiles } from "./root-cause-analysis-storage";
import type {
	AnalysisRecordWriter,
	ClaimedAnalysis,
} from "./root-cause-analysis-storage";

/**
 * The analysis record files, with a failure the test can set for the claim or
 * for each record that replaces the claimed one, or a step to run once one
 * has, such as a stop.
 */
class RecordWriterProbe implements AnalysisRecordWriter {
	private claimFailure: string | undefined = undefined;
	private replaceFailure: string | undefined = undefined;
	private afterReplace: (() => Promise<void>) | undefined = undefined;

	public constructor(
		private readonly files: AnalysisRecordWriter = analysisRecordFiles,
	) {}

	public readonly claim = async (
		runsDirectory: string,
		record: FailedAnalysis,
	): Promise<ClaimedAnalysis> => {
		if (this.claimFailure !== undefined) {
			throw new Error(this.claimFailure);
		}

		return await this.files.claim(runsDirectory, record);
	};

	public readonly replace = async (
		file: string,
		record: RootCauseAnalysisRecord,
	): Promise<void> => {
		if (this.replaceFailure !== undefined) {
			throw new Error(this.replaceFailure);
		}

		await this.files.replace(file, record);
		const step = this.afterReplace;
		this.afterReplace = undefined;
		await step?.();
	};

	public runOnceAfterReplace(step: () => Promise<void>): void {
		this.afterReplace = step;
	}

	public failClaim(message: string): void {
		this.claimFailure = message;
	}

	public failReplace(message: string): void {
		this.replaceFailure = message;
	}
}

export { RecordWriterProbe as default };
