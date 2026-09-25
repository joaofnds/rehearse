import { isCaseId } from "#benchmark/case";
import { unhandled } from "#benchmark/contracts";
import { UsageError } from "#cli/commands";

export interface CaseRecordId {
	readonly kind: "case";
	readonly caseId: string;
}

export interface RunRecordId {
	readonly kind: "run";
	readonly run: string;
}

export interface CheckpointRecordId {
	readonly kind: "checkpoint";
	readonly run: string;
	readonly stage: string;
}

export interface SessionAttemptRecordId {
	readonly kind: "attempt:session";
	readonly caseId: string;
	readonly uuid: string;
}

export interface StageAttemptRecordId {
	readonly kind: "attempt:stage";
	readonly lineage: string;
	readonly timestamp: string;
}

export interface GroupRecordId {
	readonly kind: "group";
	readonly groupId: string;
}

export interface RepStageRecordId {
	readonly kind: "rep:stage";
	readonly groupId: string;
	readonly repId: string;
	readonly stage: string;
}

export interface RepSessionRecordId {
	readonly kind: "rep:session";
	readonly groupId: string;
	readonly repId: string;
}

export interface ComparisonRecordId {
	readonly kind: "comparison";
	readonly manifestDigest: string;
}

export type RecordId =
	| CaseRecordId
	| RunRecordId
	| CheckpointRecordId
	| SessionAttemptRecordId
	| StageAttemptRecordId
	| GroupRecordId
	| RepStageRecordId
	| RepSessionRecordId
	| ComparisonRecordId;

/**
 * A short id as typed: the case it was claimed in, the number the claim took,
 * and for a checkpoint the stage's position, 0 being the setup checkpoint.
 * Which record it names is the registry's answer, not the parser's.
 */
export interface ShortIdReference {
	readonly kind: "short";
	readonly caseId: string;
	readonly shortKind: "run" | "group";
	readonly number: number;
	readonly stage?: number;
}

const RUN_PREFIX = "run:";

/**
 * Both attempt kinds name two segments, so the kind is spelled in the prefix
 * rather than sniffed from the first segment's shape: a session attempt is a
 * case and a uuid, a stage attempt a lineage and a timestamp, and only the
 * prefix tells a reader or this parser which one it has.
 */
const ID_FORMS: readonly string[] = [
	"case:<id>",
	"run:<name>",
	"checkpoint:<run>/<stage>",
	"attempt:session:<case>/<uuid>",
	"attempt:stage:<lineage>/<timestamp>",
	"group:<group-id>",
	"rep:stage:<group-id>/<rep-id>/<stage>",
	"rep:session:<group-id>/<rep-id>",
	"comparison:<manifest-digest>",
];

const SHORT_ID_FORMS: readonly string[] = [
	"<case>/r<n>",
	"<case>/g<n>",
	"<case>/r<n>/s<k>",
];

export function recordIdForms(): readonly string[] {
	return [...ID_FORMS, ...SHORT_ID_FORMS];
}

/**
 * A segment is interpolated into a path under the runs directory, so a value
 * satisfying the id's shape can still name a destination outside it: `run:..`
 * reads a sibling of `.benchmark-runs`, and `group:../../../../etc/passwd`
 * leaves the repository entirely. Shape is not destination, and refusing the
 * segment here means no caller can hold an id that escapes. The message names
 * the id as the caller typed it, because an id they never wrote tells them
 * nothing about which one to correct.
 */
interface IdBody {
	/** The id exactly as the caller typed it, which is what a refusal names. */
	readonly given: string;
	/** The form this prefix takes, which is what a malformed body is told. */
	readonly form: string;
	/** Everything after the prefix, which is what the segments come from. */
	readonly body: string;
}

function confined(id: IdBody, text: string): string {
	if (text === "." || text === ".." || text.includes("/")) {
		throw new UsageError(
			`Record id ${id.given} names a path outside the runs directory`,
		);
	}

	return text;
}

function segment(id: IdBody): string {
	if (id.body === "") {
		throw new UsageError(`Record id ${id.given} takes the form ${id.form}`);
	}

	return confined(id, id.body);
}

/**
 * A `case:` id names a directory under `cases/`, so it answers to what a case
 * id is rather than only to confinement: `case show` refuses the same mistake
 * with the same sentence, and an id `show` accepts must be one `case show`
 * would have accepted.
 */
function checkedCaseId(given: string, caseId: string): string {
	if (!isCaseId(caseId)) {
		throw new UsageError(
			`Record id ${given} names no case: a case id is lowercase letters, digits, or dashes`,
		);
	}

	return caseId;
}

function caseSegment(id: IdBody): string {
	return checkedCaseId(id.given, segment(id));
}

function twoSegments(id: IdBody): readonly [string, string] {
	const parts = id.body.split("/");
	const [first, second] = parts;
	if (
		parts.length !== 2 ||
		first === undefined ||
		first === "" ||
		second === undefined ||
		second === ""
	) {
		throw new UsageError(`Record id ${id.given} takes the form ${id.form}`);
	}

	return [confined(id, first), confined(id, second)];
}

function parseAttemptId(id: string, body: string): RecordId {
	const separator = body.indexOf(":");
	const attemptKind = separator === -1 ? body : body.slice(0, separator);
	const rest = separator === -1 ? "" : body.slice(separator + 1);

	if (attemptKind === "session") {
		const [caseId, uuid] = twoSegments({
			given: id,
			form: "attempt:session:<case>/<uuid>",
			body: rest,
		});

		return { kind: "attempt:session", caseId, uuid };
	}
	if (attemptKind === "stage") {
		const [lineage, timestamp] = twoSegments({
			given: id,
			form: "attempt:stage:<lineage>/<timestamp>",
			body: rest,
		});

		return { kind: "attempt:stage", lineage, timestamp };
	}

	throw new UsageError(
		`Record id attempt:${body} names no attempt kind: use attempt:session:<case>/<uuid> or attempt:stage:<lineage>/<timestamp>`,
	);
}

function threeSegments(id: IdBody): readonly [string, string, string] {
	const parts = id.body.split("/");
	const [first, second, third] = parts;
	if (
		parts.length !== 3 ||
		first === undefined ||
		first === "" ||
		second === undefined ||
		second === "" ||
		third === undefined ||
		third === ""
	) {
		throw new UsageError(`Record id ${id.given} takes the form ${id.form}`);
	}

	return [confined(id, first), confined(id, second), confined(id, third)];
}

function parseRepId(id: string, body: string): RecordId {
	const separator = body.indexOf(":");
	const repKind = separator === -1 ? body : body.slice(0, separator);
	const rest = separator === -1 ? "" : body.slice(separator + 1);

	if (repKind === "stage") {
		const [groupId, repId, stage] = threeSegments({
			given: id,
			form: "rep:stage:<group-id>/<rep-id>/<stage>",
			body: rest,
		});

		return { kind: "rep:stage", groupId, repId, stage };
	}
	if (repKind === "session") {
		const [groupId, repId] = twoSegments({
			given: id,
			form: "rep:session:<group-id>/<rep-id>",
			body: rest,
		});

		return { kind: "rep:session", groupId, repId };
	}

	throw new UsageError(
		`Record id rep:${body} names no rep kind: use rep:stage:<group-id>/<rep-id>/<stage> or rep:session:<group-id>/<rep-id>`,
	);
}

/**
 * The one place a string becomes a record id. `show` holds the parsed value
 * and never asks which record a bare string named, and `formatRecordId` is its
 * inverse so every id a listing prints parses back to the value it came from.
 */
export function parseRecordId(text: string): RecordId {
	const separator = text.indexOf(":");
	if (separator === -1) {
		throw new UsageError(
			`Record id ${text} names no record kind: use ${ID_FORMS.join(", ")}`,
		);
	}

	const prefix = text.slice(0, separator);
	const body = text.slice(separator + 1);
	switch (prefix) {
		case "case": {
			return {
				kind: "case",
				caseId: caseSegment({ given: text, form: "case:<id>", body }),
			};
		}
		case "run": {
			return {
				kind: "run",
				run: segment({ given: text, form: "run:<name>", body }),
			};
		}
		case "checkpoint": {
			const [run, stage] = twoSegments({
				given: text,
				form: "checkpoint:<run>/<stage>",
				body,
			});

			return { kind: "checkpoint", run, stage };
		}
		case "attempt": {
			return parseAttemptId(text, body);
		}
		case "group": {
			return {
				kind: "group",
				groupId: segment({ given: text, form: "group:<group-id>", body }),
			};
		}
		case "rep": {
			return parseRepId(text, body);
		}
		case "comparison": {
			return {
				kind: "comparison",
				manifestDigest: segment({
					given: text,
					form: "comparison:<manifest-digest>",
					body,
				}),
			};
		}
		default: {
			throw new UsageError(
				`Record id ${text} names no record kind: use ${ID_FORMS.join(", ")}`,
			);
		}
	}
}

const SHORT_NUMBER = /^(?<letter>[rg])(?<number>[1-9]\d*)$/u;
const SHORT_STAGE = /^s(?<stage>0|[1-9]\d*)$/u;

/**
 * The case segment is checked before anything else is read from the id, since
 * it names a directory under the registry and `../x/r1` would otherwise name
 * one outside it.
 */
function parseShortId(text: string): ShortIdReference {
	const [caseText = "", numbered = "", staged, ...extra] = text.split("/");
	const caseId = checkedCaseId(text, caseText);
	const malformed = new UsageError(
		`Record id ${text} takes the form ${SHORT_ID_FORMS.join(", ")}`,
	);
	const claimed = SHORT_NUMBER.exec(numbered)?.groups;
	if (claimed?.["letter"] === undefined || claimed["number"] === undefined) {
		throw malformed;
	}
	const shortKind = claimed["letter"] === "g" ? "group" : "run";
	const number = Number(claimed["number"]);
	if (staged === undefined) {
		return { kind: "short", caseId, shortKind, number };
	}

	const stage = SHORT_STAGE.exec(staged)?.groups?.["stage"];
	if (shortKind !== "run" || stage === undefined || extra.length > 0) {
		throw malformed;
	}

	return { kind: "short", caseId, shortKind, number, stage: Number(stage) };
}

/**
 * What `show` accepts: a Record ID, or a short id, told apart by the colon
 * every Record ID's prefix ends in and the slash a short id always holds.
 */
export function parseRecordReference(
	text: string,
): RecordId | ShortIdReference {
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
export function parseRunRecordId(id: string): RunRecordId {
	const parsed = parseRecordId(
		id.startsWith(RUN_PREFIX) ? id : `${RUN_PREFIX}${id}`,
	);
	if (parsed.kind !== "run") {
		throw new UsageError(`Record id ${id} names no run`);
	}

	return parsed;
}

export function formatRecordId(id: RecordId): string {
	switch (id.kind) {
		case "case": {
			return `case:${id.caseId}`;
		}
		case "run": {
			return `run:${id.run}`;
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
		case "group": {
			return `group:${id.groupId}`;
		}
		case "rep:stage": {
			return `rep:stage:${id.groupId}/${id.repId}/${id.stage}`;
		}
		case "rep:session": {
			return `rep:session:${id.groupId}/${id.repId}`;
		}
		case "comparison": {
			return `comparison:${id.manifestDigest}`;
		}
		default: {
			return unhandled(id, "record id kind");
		}
	}
}
