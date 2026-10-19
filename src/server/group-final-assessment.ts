import { basename, dirname, relative } from "node:path";

import { confirmationGroupPaths } from "#benchmark/run-layout";
import readOwnedConfirmationRep from "#server/confirmation-evidence";
import {
	finalAssessmentRecordSchema,
	projectFinalAssessment,
} from "#server/evidence-projection";
import type { FinalAssessment } from "#server/evidence-projection";
import {
	canonicalRunsRoot,
	parseIdentity,
	readVerifiedFile,
	verifiedDirectory,
	verifiedFile,
} from "#server/session-history-reader";

interface GroupFinalRequest {
	readonly runsDirectory: string;
	readonly groupId: string;
	readonly repId: string;
}

async function readGroupFinalAssessment(
	request: GroupFinalRequest,
): Promise<FinalAssessment> {
	const { root, paths, directory, record } = await finalRepRecord(request);
	if (
		record.mode !== "pipeline" ||
		record.finalOutcome.status !== "JUDGED" ||
		record.finalOutcome.evidence.recordFile !==
			relative(paths.directory, paths.finalFile)
	) {
		return {
			reason:
				"No independent final Judge assessment was recorded for this repetition.",
			state: "unavailable",
		};
	}

	const file = await verifiedFile(root, {
		directory,
		name: basename(paths.finalFile),
		required: false,
	});
	if (file === undefined) {
		return {
			reason:
				"This older repetition retains the final verdict only; detailed rationale was not saved.",
			state: "unavailable",
		};
	}

	const text = await readVerifiedFile(root, file);
	return recordedGroupFinalAssessment(text, record.finalOutcome.verdict);
}

interface FinalRepRecord {
	readonly root: string;
	readonly paths: ReturnType<ReturnType<typeof confirmationGroupPaths>["rep"]>;
	readonly directory: string;
	readonly record: Awaited<ReturnType<typeof readOwnedConfirmationRep>>["rep"];
}

async function finalRepRecord(
	request: GroupFinalRequest,
): Promise<FinalRepRecord> {
	const groupId = parseIdentity(request.groupId);
	const repId = parseIdentity(request.repId);
	const root = await canonicalRunsRoot(request.runsDirectory);
	const paths = confirmationGroupPaths(root, groupId).rep(repId);
	const directory = await verifiedDirectory(
		root,
		relative(root, dirname(paths.recordFile)).split("/"),
	);
	const { rep: record } = await readOwnedConfirmationRep(root, groupId, repId);

	return { directory, paths, record, root };
}

function recordedGroupFinalAssessment(
	text: string,
	verdict: "PASS" | "FAIL",
): FinalAssessment {
	try {
		const document: unknown = JSON.parse(text);
		const parsed = finalAssessmentRecordSchema.safeParse(document);
		return parsed.success
			? projectFinalAssessment(parsed.data, verdict)
			: {
					reason:
						"This record retains no readable final criteria or citations matching its recorded outcome.",
					state: "unavailable",
				};
	} catch (error) {
		if (!(error instanceof SyntaxError)) {
			throw error;
		}

		return {
			reason: "The saved final assessment is not readable JSON.",
			state: "unavailable",
		};
	}
}

export { readGroupFinalAssessment as default };
export type { FinalAssessment } from "#server/evidence-projection";
