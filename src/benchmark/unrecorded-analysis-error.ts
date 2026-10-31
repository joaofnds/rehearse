import type { RootCauseAnalysisRecord } from "./root-cause-analysis-protocol";

/**
 * An analysis whose outcome could not replace its provisional record. The
 * message carries the record as JSON, so the terminal or a browser launch's
 * log keeps what the call found and spent. JSON escapes the C0 control
 * characters but not DEL, C1 or bidi controls the model may choose.
 */
class UnrecordedAnalysisError extends Error {
	public override name = "UnrecordedAnalysisError";

	public constructor(
		file: string,
		public readonly record: RootCauseAnalysisRecord,
		options: Readonly<ErrorOptions>,
	) {
		super(
			`The analysis's outcome could not be written to ${file}, which keeps the provisional record: ${options.cause instanceof Error ? options.cause.message : String(options.cause)}. The outcome: ${JSON.stringify(record)}`,
			options,
		);
	}
}

export { UnrecordedAnalysisError as default };
