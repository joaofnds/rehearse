import { relative } from "node:path";

import type {
	ComparisonArm,
	MultiCaseComparisonReport,
} from "./comparison-record";
import type { SessionConfirmationGroupRecord } from "./confirmation-record";
import {
	readSessionGroup,
	recordedSessionRep,
} from "./session-comparison-record-reader-fixture";
import {
	digest,
	sessionGroupFile,
} from "./session-comparison-record-test-fixture";
import type { SessionSourceDirectories } from "./session-comparison-test-contract";
import { FIRST_REP_ORDINAL } from "./session-comparison-test-contract";

interface RepSourceContext {
	readonly groupFile: string;
	readonly manifestDirectory: string;
	readonly caseId: string;
	readonly role: ComparisonArm;
}

async function expectedSessionSource(
	{ manifestDirectory, runsDirectory }: SessionSourceDirectories,
	caseId: string,
	role: ComparisonArm,
): Promise<ArmSourceProvenance> {
	const groupFile = sessionGroupFile({ caseId, role, runsDirectory });
	const groupText = await Bun.file(groupFile).text();
	const group = await readSessionGroup(groupFile);
	const reps = await Promise.all(
		group.repRecords.map(
			async (reference) =>
				await expectedRepSource(
					{ caseId, groupFile, manifestDirectory, role },
					reference,
				),
		),
	);

	return {
		groups: [
			{
				path: relative(manifestDirectory, groupFile),
				sha256: digest(groupText),
			},
		],
		reps,
	};
}

async function expectedRepSource(
	{ groupFile, manifestDirectory, caseId, role }: RepSourceContext,
	reference: SessionConfirmationGroupRecord["repRecords"][number],
): Promise<MultiCaseRepProvenance> {
	const { attemptPath, repPath, repText } = await recordedSessionRep({
		groupFile,
		reference,
	});
	const attemptText = await Bun.file(attemptPath).text();
	const successful =
		role === "candidate" ||
		(role === "baseline" &&
			(caseId === "case-two" || reference.ordinal === FIRST_REP_ORDINAL));

	return {
		attempt: {
			path: relative(manifestDirectory, attemptPath),
			sha256: digest(attemptText),
		},
		group: 0,
		ordinal: reference.ordinal,
		outcomes: [
			{
				grade: successful ? "A" : "F",
				name: "checks",
				status: "JUDGED",
				successful,
			},
		],
		path: relative(manifestDirectory, repPath),
		repId: reference.repId,
		sha256: digest(repText),
	};
}

type MultiCaseArmSource =
	MultiCaseComparisonReport["cases"][number]["arms"]["baseline"]["source"];

type MultiCaseRepProvenance = Omit<
	MultiCaseArmSource["reps"][number],
	"checks" | "stateResults" | "words"
>;

interface ArmSourceProvenance {
	readonly groups: MultiCaseArmSource["groups"];
	readonly reps: readonly MultiCaseRepProvenance[];
}

function sourceProvenance(source: MultiCaseArmSource): ArmSourceProvenance {
	return {
		...source,
		reps: source.reps.map(({ checks: _checks, ...rep }) => {
			if (!("words" in rep)) {
				return rep;
			}

			const { words: _words, ...provenance } = rep;

			return provenance;
		}),
	};
}

export { expectedSessionSource, sourceProvenance };

export type { MultiCaseArmSource, MultiCaseRepProvenance, ArmSourceProvenance };
