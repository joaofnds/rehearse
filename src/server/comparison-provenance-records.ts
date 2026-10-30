import type { ComparisonArm } from "#benchmark/comparison-record";
import { parseConfirmationGroupRecord } from "#benchmark/confirmation-record";
import type {
	ArmGroups,
	ArmSource,
	CaseGroups,
	RecordedGroup,
	ReportCase,
} from "#server/comparison-provenance-contract";

import { redactAbsolutePaths } from "./redact-path";
import { readRecordedEvidenceFile } from "./session-history-reader";

function groupPaths(source: ArmSource): readonly string[] {
	return "group" in source
		? [source.group.path]
		: source.groups.map(({ path }) => path);
}

/** A record that cannot be read costs its arm a header fact, never the page. */
async function readArmGroups(
	runsDirectory: string,
	source: ArmSource,
): Promise<ArmGroups> {
	try {
		const groups = await Promise.all(
			groupPaths(source).map(async (path): Promise<RecordedGroup> => {
				const file = await readRecordedEvidenceFile(runsDirectory, path);
				const group = parseConfirmationGroupRecord(file.text);

				return {
					corpusVersion: group.inputs.corpusVersion,
					groupId: group.groupId,
				};
			}),
		);

		return { groups, state: "available" };
	} catch (error) {
		const message =
			error instanceof Error
				? redactAbsolutePaths(error.message)
				: String(error);

		return {
			reasons: [`a group record could not be read: ${message}`],
			state: "unavailable",
		};
	}
}

async function readCaseGroups(
	runsDirectory: string,
	benchmarkCase: ReportCase,
): Promise<CaseGroups> {
	const read = async (arm: ComparisonArm): Promise<ArmGroups> =>
		await readArmGroups(runsDirectory, benchmarkCase.arms[arm].source);

	return {
		arms: {
			baseline: await read("baseline"),
			candidate: await read("candidate"),
			control: await read("control"),
		},
		caseId: benchmarkCase.caseId,
	};
}

export { readCaseGroups as default, groupPaths };
