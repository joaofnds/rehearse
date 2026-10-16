import { readOwnedConfirmationRep } from "./confirmation-evidence";
import {
	canonicalRunsRoot,
	parseIdentity,
	readVerifiedFile,
	verifiedDirectory,
	verifiedFile,
} from "./session-history-reader";

import { confirmationGroupPaths } from "#benchmark/run-layout";
import { relative, dirname, basename } from "node:path";
import {
	finalAssessmentRecordSchema,
	projectFinalAssessment,
} from "./evidence-projection";
import type { FinalAssessment } from "./evidence-projection";

export type { FinalAssessment } from "./evidence-projection";

export async function readGroupFinalAssessment(request: {
	readonly runsDirectory: string;
	readonly groupId: string;
	readonly repId: string;
}): Promise<FinalAssessment> {
	const groupId = parseIdentity(request.groupId);
	const repId = parseIdentity(request.repId);
	const root = await canonicalRunsRoot(request.runsDirectory);
	const paths = confirmationGroupPaths(root, groupId).rep(repId);
	const directory = await verifiedDirectory(
		root,
		relative(root, dirname(paths.recordFile)).split("/"),
	);
	const { rep: record } = await readOwnedConfirmationRep(root, groupId, repId);
	if (
		record.mode !== "pipeline" ||
		record.finalOutcome.status !== "JUDGED" ||
		record.finalOutcome.evidence.recordFile !==
			relative(paths.directory, paths.finalFile)
	) {
		return {
			state: "unavailable",
			reason:
				"No independent final Judge assessment was recorded for this repetition.",
		};
	}
	const file = await verifiedFile(
		root,
		directory,
		basename(paths.finalFile),
		false,
	);
	if (file === undefined) {
		return {
			state: "unavailable",
			reason:
				"This older repetition retains the final verdict only; detailed rationale was not saved.",
		};
	}
	const text = await readVerifiedFile(root, file);
	try {
		const document: unknown = JSON.parse(text);
		const parsed = finalAssessmentRecordSchema.safeParse(document);
		return parsed.success
			? projectFinalAssessment(parsed.data, record.finalOutcome.verdict)
			: {
					state: "unavailable",
					reason:
						"This record retains no readable final criteria or citations matching its recorded outcome.",
				};
	} catch (error) {
		if (!(error instanceof SyntaxError)) {
			throw error;
		}
		return {
			state: "unavailable",
			reason: "The saved final assessment is not readable JSON.",
		};
	}
}
