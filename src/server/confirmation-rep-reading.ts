import { parseConfirmationRepRecord } from "#benchmark/confirmation-record";
import type { ParsedConfirmationRepRecord } from "#benchmark/confirmation-record";
import type { Immutable } from "#benchmark/contracts";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import type { CaseRun } from "#server/case-figures";
import type { RepReading } from "#server/case-runs-contract";
import {
	sessionAssessment,
	sessionAttemptRun,
} from "#server/case-runs-sessions";
import { redactAbsolutePaths } from "#server/redact-path";

const NO_SPEND_USD = 0;

async function repSessionAssessment(
	attemptFile: string,
): Promise<Pick<CaseRun, "savedState" | "recordedOutcome" | "replyChecks">> {
	try {
		const file = Bun.file(attemptFile);
		if (!(await file.exists())) {
			return {
				savedState: {
					reason: "The repetition has no saved session attempt.",
					state: "unavailable",
				},
			};
		}

		return sessionAssessment(parseSessionAttemptRecord(await file.text()));
	} catch (error) {
		return {
			savedState: {
				reason: `The repetition's saved session attempt could not be read: ${redactAbsolutePaths(error instanceof Error ? error.message : String(error))}`,
				state: "unavailable",
			},
		};
	}
}

/**
 * A pipeline rep passes on the final Judge's PASS and a session rep on the
 * outcome of an attempt whose checks ran. A rep record holds no successful
 * outcome without metrics, so a rep whose metrics went missing takes the
 * outcome its own attempt record kept, as a lone attempt would read.
 */
async function repPassed(
	rep: Immutable<ParsedConfirmationRepRecord>,
	attemptFile: string,
): Promise<boolean | undefined> {
	if (rep.mode === "pipeline") {
		return rep.finalOutcome.status === "JUDGED"
			? rep.finalOutcome.verdict === "PASS"
			: undefined;
	}

	return await repChecksPassed(rep, attemptFile);
}

async function repChecksPassed(
	rep: Immutable<ParsedConfirmationRepRecord>,
	attemptFile: string,
): Promise<boolean | undefined> {
	const [checks] = rep.stages;
	if (checks?.status === "JUDGED") {
		return rep.outcome === "SUCCESSFUL";
	}

	if (checks?.status !== "METRICS_MISSING") {
		return undefined;
	}

	const attempt = Bun.file(attemptFile);
	if (!(await attempt.exists())) {
		return undefined;
	}

	return sessionAttemptRun(parseSessionAttemptRecord(await attempt.text()))
		.passed;
}

function repCost(
	rep: Immutable<ParsedConfirmationRepRecord>,
): number | undefined {
	return rep.metrics.status === "COMPLETE"
		? rep.metrics.calls.reduce(
				(total, { metrics }) => total + metrics.costUsd,
				NO_SPEND_USD,
			)
		: undefined;
}

interface RepFiles {
	readonly recordFile: string;
	readonly attemptFile: string;
}

async function readRep(
	paths: RepFiles,
	corpusDigest: string | undefined,
): Promise<RepReading> {
	const file = Bun.file(paths.recordFile);
	if (!(await file.exists())) {
		return { state: "not-recorded" };
	}

	try {
		const rep = parseConfirmationRepRecord(await file.text());

		return await repRun({ attemptFile: paths.attemptFile, corpusDigest, rep });
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);

		return { reason, state: "unreadable" };
	}
}

interface RepRunInput {
	readonly attemptFile: string;
	readonly corpusDigest: string | undefined;
	readonly rep: Immutable<ParsedConfirmationRepRecord>;
}

async function repRun({
	attemptFile,
	corpusDigest,
	rep,
}: RepRunInput): Promise<RepReading> {
	const run: CaseRun = {
		corpusDigest,
		costUsd: repCost(rep),
		passed: await repPassed(rep, attemptFile),
	};
	if (rep.mode === "session") {
		return {
			run: { ...run, ...(await repSessionAssessment(attemptFile)) },
			state: "read",
		};
	}

	return { run, state: "read" };
}

export { readRep as default };
