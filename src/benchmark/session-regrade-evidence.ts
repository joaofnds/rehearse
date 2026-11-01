import { createHash } from "node:crypto";

import type { SessionCase } from "./case";
import type { Immutable } from "./contracts";
import { unhandled } from "./contracts";
import type { JudgeInvoker } from "./judge-attempt";
import type { SessionAttemptId, SessionAttemptPaths } from "./run-layout";
import type { EvidenceDigests, RegradedCheck } from "./session-assessment";
import type { Check, CheckEvidence } from "./session-check";
import type { SessionAttemptRecord } from "./session-record";
import type { SpendCeiling } from "./spend-ceiling";
import { parseTranscript, toolUses } from "./transcript";

interface RegradeRequest {
	readonly attemptId: Immutable<SessionAttemptId>;
	readonly judge?:
		| {
				readonly invoke?: JudgeInvoker | undefined;
				readonly spendCeiling: SpendCeiling;
				readonly model?: string | undefined;
		  }
		| undefined;
	readonly record: Immutable<SessionAttemptRecord>;
	/**
	 * Where the attempt keeps its evidence, from `sessionAttemptPaths` rather
	 * than from the record. Every saved record stores `transcriptFile` as an
	 * absolute path on the machine that wrote it, so a record read from
	 * another checkout names a transcript that is not there while the
	 * transcript itself travels with the attempt.
	 */
	readonly paths: Readonly<
		Pick<SessionAttemptPaths, "directory" | "transcriptFile">
	>;
	readonly sessionCase: Immutable<SessionCase>;
}

const NO_TRANSCRIPT_DETAIL =
	"the attempt recorded no readable transcript boundary, so its tool uses cannot be counted";

const NO_REPLY_DETAIL =
	"the attempt saved no reply, so nothing the session said can be read";

/**
 * Which evidence a check needs decides whether the saved attempt can answer
 * it at all. Every kind is named rather than defaulted, so a sixth kind stops
 * the compiler here instead of being read as needing no transcript and graded
 * over evidence the attempt may not hold.
 */
function evidenceNeededBy(check: Immutable<Check>): keyof ReadEvidence["held"] {
	switch (check.kind) {
		case "tool-calls":
		case "files-read": {
			return "transcript";
		}
		case "word-band":
		case "forbidden-text":
		case "forbidden-pattern": {
			return "reply";
		}
		default: {
			return unhandled(check, "check kind");
		}
	}
}

const MISSING_EVIDENCE_DETAIL = {
	reply: NO_REPLY_DETAIL,
	transcript: NO_TRANSCRIPT_DETAIL,
} satisfies Record<keyof ReadEvidence["held"], string>;

/**
 * The boundary comes from the record and never from the case, because an
 * operator who edits the case's cut would otherwise move the boundary of an
 * attempt already run. The gate is the diagnostics' `state`, not the presence
 * of `prefixLinesExcluded`: the `unavailable` variant carries that field too,
 * and one saved record pairs it with a zero-byte transcript, so a presence
 * rule would slice nothing at 0 and report a tool-calls check passing over
 * evidence that does not exist.
 */
function recordedBoundary(
	record: Immutable<SessionAttemptRecord>,
): number | undefined {
	const diagnostics = record.transcriptDiagnostics;
	if (diagnostics === undefined || diagnostics.state === "unavailable") {
		return undefined;
	}

	return diagnostics.prefixLinesExcluded;
}

interface ReadEvidence {
	readonly evidence: CheckEvidence;
	readonly digests: EvidenceDigests;
	/**
	 * Which bodies the attempt actually holds. A body it does not hold is not
	 * an empty one: grading a `word-band` check against a reply that was never
	 * saved reports zero words within the band, and a `tool-calls` check
	 * against an absent transcript reports zero tool calls, both passing over
	 * evidence nothing produced.
	 */
	readonly held: {
		readonly reply: boolean;
		readonly transcript: boolean;
	};
}

function sha256Of(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

/**
 * The digest is taken over the bytes that produced the graded lines, read
 * once, so an assessment cannot name a digest of bytes other than the ones it
 * graded. A body the attempt does not hold is digested as absent rather than
 * as empty, since a digest of nothing reads as a body that happened to be
 * empty.
 *
 * A transcript is read only when the record carries a boundary to slice it
 * at. Without one, there is nothing to say how much of the file belongs to
 * the behavior under test, so the file is left unread rather than counted
 * whole.
 */
async function savedEvidence(
	request: Immutable<RegradeRequest>,
	boundary: number | undefined,
): Promise<ReadEvidence> {
	const { reply } = request.record;
	const replyEvidence = {
		digests: { reply: reply === undefined ? undefined : sha256Of(reply) },
		held: { reply: reply !== undefined },
		reply: reply ?? "",
	};
	const body = Bun.file(request.paths.transcriptFile);
	if (boundary === undefined || !(await body.exists())) {
		return {
			digests: replyEvidence.digests,
			evidence: { reply: replyEvidence.reply, toolUses: [] },
			held: { ...replyEvidence.held, transcript: false },
		};
	}

	const text = await body.text();

	return {
		digests: { ...replyEvidence.digests, transcript: sha256Of(text) },
		evidence: {
			reply: replyEvidence.reply,
			toolUses: toolUses(parseTranscript(text).slice(boundary)),
		},
		held: { ...replyEvidence.held, transcript: true },
	};
}

function unavailable(check: Immutable<Check>): RegradedCheck {
	return {
		detail: MISSING_EVIDENCE_DETAIL[evidenceNeededBy(check)],
		kind: check.kind,
		status: "UNAVAILABLE",
	};
}
export { evidenceNeededBy, recordedBoundary, savedEvidence, unavailable };
export type { RegradeRequest };
