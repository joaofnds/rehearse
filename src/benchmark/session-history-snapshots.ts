import type { Immutable } from "./contracts";
import type { TextMeasurement } from "./session-history-contract";
import { measureContent } from "./session-history-measurement";
import { readToolResultSchema } from "./session-history-message";
import type { ParsedRow } from "./session-history-message";

const FIRST_SOURCE_LINE_NUMBER = 1;

interface SnapshotEvidence {
	readonly text: string | undefined;
	readonly measurement: TextMeasurement;
	readonly range: SourceSnapshotRange | undefined;
}

function snapshotFor(row: Immutable<ParsedRow>): SnapshotEvidence {
	const file = readToolResultSchema.safeParse(row.value?.toolUseResult).data
		?.file;
	if (file === undefined) {
		return {
			measurement: {
				reasons: ["source snapshot unavailable"],
				state: "unavailable",
			},
			range: undefined,
			text: undefined,
		};
	}
	const base = measureContent(file.content);
	if (
		file.startLine === undefined ||
		file.numLines === undefined ||
		file.totalLines === undefined
	) {
		return {
			measurement: base.measurement,
			range: undefined,
			text: file.content,
		};
	}
	const complete =
		file.startLine === FIRST_SOURCE_LINE_NUMBER &&
		file.numLines >= file.totalLines;

	return {
		measurement:
			complete || base.measurement.state !== "complete"
				? base.measurement
				: {
						observedCharacters: base.measurement.characters,
						reasons: ["source snapshot is a partial line range"],
						state: "partial",
					},
		range: {
			coverage: complete ? "complete" : "partial",
			deliveredLineCount: file.numLines,
			startLine: file.startLine,
			totalLineCount: file.totalLines,
		},
		text: file.content,
	};
}

interface SourceSnapshotRange {
	readonly startLine: number;
	readonly deliveredLineCount: number;
	readonly totalLineCount: number;
	readonly coverage: "complete" | "partial";
}

export { snapshotFor as default };

export type { SourceSnapshotRange };
