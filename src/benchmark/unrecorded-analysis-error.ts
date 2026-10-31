import type { RootCauseAnalysisRecord } from "./root-cause-analysis-protocol";
import { visibleControlCharacters } from "./visible-control-characters";

/**
 * An analysis whose outcome could not replace its provisional record. The
 * message carries the record as JSON, so the terminal or a browser launch's
 * log keeps what the call found and spent. The JSON carries every control
 * and bidi control the model chose as visible escapes, and still parses to
 * the record.
 */
class UnrecordedAnalysisError extends Error {
	public override name = "UnrecordedAnalysisError";

	public constructor(
		file: string,
		public readonly record: RootCauseAnalysisRecord,
		options: Readonly<ErrorOptions>,
	) {
		super(
			`The analysis's outcome could not be written to ${file}, which keeps the provisional record: ${options.cause instanceof Error ? options.cause.message : String(options.cause)}. The outcome: ${visibleControlCharacters(JSON.stringify(record))}`,
			options,
		);
	}
}

export { UnrecordedAnalysisError as default };
