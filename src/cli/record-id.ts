import { unhandled } from "#benchmark/contracts";
import { UsageError } from "#cli/command-usage";

import type {
	QualifiedRecordId,
	RecordId,
	RunRecordId,
	ShortIdReference,
} from "./record-id-contract";
import {
	parseAttemptId,
	parseCheckpointId,
	parseRepId,
} from "./record-id-descendants";
import { unknownRecordKind } from "./record-id-forms";
import {
	parseCaseId,
	parseComparisonId,
	parseGroupId,
	parseRunId,
} from "./record-id-roots";
import parseShortId from "./record-short-id";

const MISSING_KIND_SEPARATOR_INDEX = -1;
const KIND_SEPARATOR_CODE_UNITS = 1;
const RECORD_KIND_START_INDEX = 0;

const RUN_PREFIX = "run:";

function qualifiedRecordId(text: string): QualifiedRecordId {
	const separator = text.indexOf(":");
	if (separator === MISSING_KIND_SEPARATOR_INDEX) {
		throw unknownRecordKind(text);
	}

	return {
		body: text.slice(separator + KIND_SEPARATOR_CODE_UNITS),
		given: text,
		prefix: text.slice(RECORD_KIND_START_INDEX, separator),
	};
}

function parseRecordId(text: string): RecordId {
	const record = qualifiedRecordId(text);
	switch (record.prefix) {
		case "checkpoint": {
			return parseCheckpointId(record);
		}
		case "attempt": {
			return parseAttemptId(record);
		}
		case "rep": {
			return parseRepId(record);
		}
		case "case": {
			return parseCaseId(record);
		}
		case "run": {
			return parseRunId(record);
		}
		case "group": {
			return parseGroupId(record);
		}
		case "comparison": {
			return parseComparisonId(record);
		}
		default: {
			throw unknownRecordKind(record.given);
		}
	}
}

/**
 * What `show` accepts: a Record ID, or a short id, told apart by the colon
 * every Record ID's prefix ends in and the slash a short id always holds.
 */
function parseRecordReference(text: string): RecordId | ShortIdReference {
	return !text.includes(":") && text.includes("/")
		? parseShortId(text)
		: parseRecordId(text);
}

/**
 * `review`, `calibrate`, and `show --checkout` take a run and nothing else, so
 * the `run:` prefix carries no information the command lacks and a bare name
 * is accepted too. Both forms go through the parser above, which is what
 * refuses a segment naming a path outside the runs directory.
 */
function parseRunRecordId(id: string): RunRecordId {
	const parsed = parseRecordId(
		id.startsWith(RUN_PREFIX) ? id : `${RUN_PREFIX}${id}`,
	);
	if (parsed.kind !== "run") {
		throw new UsageError(`Record id ${id} names no run`);
	}

	return parsed;
}

function formatRecordId(id: RecordId): string {
	switch (id.kind) {
		case "case": {
			return `case:${id.caseId}`;
		}
		case "run": {
			return `run:${id.run}`;
		}
		case "group": {
			return `group:${id.groupId}`;
		}
		case "comparison": {
			return `comparison:${id.manifestDigest}`;
		}
		case "checkpoint": {
			return `checkpoint:${id.run}/${id.stage}`;
		}
		case "attempt:session": {
			return `attempt:session:${id.caseId}/${id.uuid}`;
		}
		case "attempt:stage": {
			return `attempt:stage:${id.lineage}/${id.timestamp}`;
		}
		case "rep:stage":
		case "rep:session": {
			return `${id.kind}:${id.groupId}/${id.repId}${id.kind === "rep:stage" ? `/${id.stage}` : ""}`;
		}
		default: {
			return unhandled(id, "record id kind");
		}
	}
}

export { recordIdForms } from "./record-id-forms";

export type {
	CaseRecordId,
	CheckpointRecordId,
	ComparisonRecordId,
	GroupRecordId,
	RecordId,
	RepSessionRecordId,
	RepStageRecordId,
	RunRecordId,
	SessionAttemptRecordId,
	ShortIdReference,
	StageAttemptRecordId,
} from "./record-id-contract";

export {
	formatRecordId,
	parseRecordId,
	parseRecordReference,
	parseRunRecordId,
};
