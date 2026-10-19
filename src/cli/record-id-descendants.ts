import { UsageError } from "#cli/command-usage";

import type {
	CheckpointRecordId,
	RecordBody,
	RecordId,
} from "./record-id-contract";
import { threeSegments, twoSegments } from "./record-id-segments";

const MISSING_DELIMITER_INDEX = -1;
const PREFIX_START_INDEX = 0;
const ID_KIND_SEPARATOR_CODE_UNITS = 1;

function parseAttemptId({ given: id, body }: RecordBody): RecordId {
	const separator = body.indexOf(":");
	const attemptKind =
		separator === MISSING_DELIMITER_INDEX
			? body
			: body.slice(PREFIX_START_INDEX, separator);
	const rest =
		separator === MISSING_DELIMITER_INDEX
			? ""
			: body.slice(separator + ID_KIND_SEPARATOR_CODE_UNITS);

	if (attemptKind === "session") {
		const [caseId, uuid] = twoSegments({
			body: rest,
			form: "attempt:session:<case>/<uuid>",
			given: id,
		});

		return { caseId, kind: "attempt:session", uuid };
	}
	if (attemptKind === "stage") {
		const [lineage, timestamp] = twoSegments({
			body: rest,
			form: "attempt:stage:<lineage>/<timestamp>",
			given: id,
		});

		return { kind: "attempt:stage", lineage, timestamp };
	}

	throw new UsageError(
		`Record id attempt:${body} names no attempt kind: use attempt:session:<case>/<uuid> or attempt:stage:<lineage>/<timestamp>`,
	);
}

function parseRepId({ given: id, body }: RecordBody): RecordId {
	const separator = body.indexOf(":");
	const repKind =
		separator === MISSING_DELIMITER_INDEX
			? body
			: body.slice(PREFIX_START_INDEX, separator);
	const rest =
		separator === MISSING_DELIMITER_INDEX
			? ""
			: body.slice(separator + ID_KIND_SEPARATOR_CODE_UNITS);

	if (repKind === "stage") {
		const [groupId, repId, stage] = threeSegments({
			body: rest,
			form: "rep:stage:<group-id>/<rep-id>/<stage>",
			given: id,
		});

		return { groupId, kind: "rep:stage", repId, stage };
	}
	if (repKind === "session") {
		const [groupId, repId] = twoSegments({
			body: rest,
			form: "rep:session:<group-id>/<rep-id>",
			given: id,
		});

		return { groupId, kind: "rep:session", repId };
	}

	throw new UsageError(
		`Record id rep:${body} names no rep kind: use rep:stage:<group-id>/<rep-id>/<stage> or rep:session:<group-id>/<rep-id>`,
	);
}

function parseCheckpointId({ given, body }: RecordBody): CheckpointRecordId {
	const [run, stage] = twoSegments({
		body,
		form: "checkpoint:<run>/<stage>",
		given,
	});
	return { kind: "checkpoint", run, stage };
}

export { parseAttemptId, parseCheckpointId, parseRepId };
