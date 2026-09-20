import { join } from "node:path";
import type { SessionCase } from "./case";
import type { Immutable } from "./contracts";
import type { SessionAttemptId } from "./run-layout";
import type { Check, CheckEvidence } from "./session-check";
import { evaluateChecks } from "./session-check";
import type { CheckKind } from "./session-check-result";
import type { SessionAttemptRecord } from "./session-record";
import { parseTranscriptFile, toolUses } from "./transcript";

/**
 * A regraded check carries a third status the recorded `checks` array cannot:
 * evidence the saved attempt does not hold is neither a pass nor a failure,
 * and recording it as either would put a grade on the record that nothing was
 * read to produce.
 */
export interface RegradedCheck {
	readonly kind: CheckKind;
	readonly status: "PASS" | "FAIL" | "UNAVAILABLE";
	readonly detail: string;
}

export interface RegradeRequest {
	readonly attemptId: Immutable<SessionAttemptId>;
	readonly record: Immutable<SessionAttemptRecord>;
	readonly attemptDirectory: string;
	readonly sessionCase: Immutable<SessionCase>;
}

export interface Assessment {
	readonly checks: readonly RegradedCheck[];
}

const NO_TRANSCRIPT_DETAIL =
	"the attempt recorded no readable transcript boundary, so its tool uses cannot be counted";

/**
 * Two of the four kinds read the reply the record saved and two read the
 * transcript on disk, so which evidence a check needs decides whether the
 * saved attempt can answer it at all.
 */
function readsTranscript(check: Immutable<Check>): boolean {
	return check.kind === "tool-calls" || check.kind === "files-read";
}

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

async function savedEvidence(
	request: Immutable<RegradeRequest>,
	boundary: number | undefined,
): Promise<CheckEvidence> {
	const reply = request.record.reply ?? "";
	if (boundary === undefined) {
		return { reply, toolUses: [] };
	}

	const lines = await parseTranscriptFile(
		join(request.attemptDirectory, request.record.transcriptFile),
	);

	return { reply, toolUses: toolUses(lines.slice(boundary)) };
}

function unavailable(check: Immutable<Check>): RegradedCheck {
	return {
		kind: check.kind,
		status: "UNAVAILABLE",
		detail: NO_TRANSCRIPT_DETAIL,
	};
}

/**
 * A check whose evidence the attempt does not hold is set aside before
 * grading rather than graded and overwritten, so `evaluateChecks` is handed
 * only checks the evidence can answer and the algorithm that graded the
 * original attempt is the one that regrades it. The two lists are re-joined
 * on the position each check holds in the case's declaration, which is what
 * keeps a case declaring the same check twice from collapsing into one.
 */
export async function regradeAttempt(
	request: Immutable<RegradeRequest>,
): Promise<Assessment> {
	const boundary = recordedBoundary(request.record);
	const gradable = request.sessionCase.checks
		.map((check, position) => ({ check, position }))
		.filter(({ check }) => boundary !== undefined || !readsTranscript(check));

	const graded = evaluateChecks(
		gradable.map(({ check }) => check),
		await savedEvidence(request, boundary),
	);
	const byPosition = new Map(
		gradable.map(({ position }, index) => [position, graded.results[index]]),
	);

	return {
		checks: request.sessionCase.checks.map(
			(check, position) => byPosition.get(position) ?? unavailable(check),
		),
	};
}
