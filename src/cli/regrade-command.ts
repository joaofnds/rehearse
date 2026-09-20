import type { LoadedCase, SessionCase } from "#benchmark/case";
import { CaseDeclarationError } from "#benchmark/case";
import { sessionAttemptPaths } from "#benchmark/run-layout";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import { regradeAttempt, writeAssessment } from "#benchmark/session-regrade";
import { UsageError } from "#cli/commands";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import type { CommandOutput } from "#cli/output";
import { writeRecord } from "#cli/output";
import type { SessionAttemptRecordId } from "#cli/record-id";
import { formatRecordId, parseRecordId } from "#cli/record-id";

export interface RegradeRequest {
	readonly id: string | undefined;
	readonly runsDirectory: string;
	readonly json: boolean;
}

export interface RegradeDependencies {
	readonly output: CommandOutput;
	readonly requireCase: (caseId: string) => Promise<LoadedCase>;
	readonly now: () => string;
}

function attemptIdFrom(id: string | undefined): SessionAttemptRecordId {
	if (id === undefined) {
		throw new UsageError(
			"Provide the attempt to regrade: rehearse regrade attempt:session:<case>/<uuid>",
		);
	}

	const parsed = parseRecordId(id);
	if (parsed.kind !== "attempt:session") {
		throw new RefusedPreconditionError(
			`Record id ${id} names no session attempt: regrade takes attempt:session:<case>/<uuid>`,
		);
	}

	return parsed;
}

/**
 * The case is loaded as it stands now, which is the whole point of a regrade:
 * the operator corrected a check and wants the saved evidence read against
 * the correction. Every other command that re-evaluates frozen evidence,
 * replay, calibrate and stale, reads the current declaration the same way.
 *
 * A case that no longer exists is refused rather than regraded against a
 * substitute. Reporting the gap is what the whole command is for, and saved
 * attempts naming a deleted case are a discarded experiment rather than
 * evidence anyone wants regraded.
 *
 * The refusal names the attempt because the operator typed an attempt id and
 * a message naming only the case leaves them guessing which one they asked
 * for. `requireCase` has already turned a declaration error into a refusal by
 * the time it arrives, so both shapes are caught: catching only the
 * declaration error would leave this branch dead in production while a test
 * double throwing the raw error kept it looking covered.
 */
async function caseBehind(
	id: SessionAttemptRecordId,
	dependencies: Readonly<RegradeDependencies>,
): Promise<SessionCase> {
	let loaded: LoadedCase;
	try {
		loaded = await dependencies.requireCase(id.caseId);
	} catch (error) {
		if (
			error instanceof RefusedPreconditionError ||
			error instanceof CaseDeclarationError
		) {
			throw new RefusedPreconditionError(
				`Attempt ${formatRecordId(id)} cannot be regraded: ${error.message}`,
			);
		}

		throw error;
	}

	if (loaded.kind !== "session") {
		throw new RefusedPreconditionError(
			`Attempt ${formatRecordId(id)} names case ${id.caseId}, which is a pipeline case; regrade takes a session case`,
		);
	}

	return loaded;
}

export async function runRegrade(
	request: Readonly<RegradeRequest>,
	dependencies: Readonly<RegradeDependencies>,
): Promise<void> {
	const attemptId = attemptIdFrom(request.id);
	const paths = sessionAttemptPaths(request.runsDirectory, attemptId);
	const saved = Bun.file(paths.recordFile);
	if (!(await saved.exists())) {
		throw new RefusedPreconditionError(
			`No attempt is recorded under ${formatRecordId(attemptId)}`,
		);
	}

	const record = parseSessionAttemptRecord(await saved.text());
	const assessment = await regradeAttempt({
		attemptId: { caseId: attemptId.caseId, uuid: attemptId.uuid },
		record,
		paths,
		sessionCase: await caseBehind(attemptId, dependencies),
	});

	const written = await writeAssessment(paths, dependencies.now(), assessment);
	await writeRecord(dependencies.output, written, request.json);
}
