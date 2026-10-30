import writeComparisonReport from "./comparison-command";
import type { ComparisonEvidenceFixture } from "./comparison-evidence-test-support";
import type { ComparisonArm } from "./comparison-record";
import { COMPARISON_ARMS } from "./comparison-record";
import type { ConfirmationGroupRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";
import type { InheritedVariable } from "./session-record-context-schema";

const GATEWAY_A = [
	{
		name: "ANTHROPIC_BASE_URL",
		sha256: "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
	},
];

const GATEWAY_B = [
	{
		name: "ANTHROPIC_BASE_URL",
		sha256: "d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35",
	},
];

type Configuration = Immutable<InheritedVariable[]>;

interface EveryGroup {
	/** Appended to `<case>-<arm>` to name the group, empty for the arm's first. */
	readonly suffix: string;
	readonly configurationOf: (
		caseId: string,
		role: ComparisonArm,
	) => Configuration;
}

async function changeEveryGroup(
	fixture: ComparisonEvidenceFixture,
	suffix: string,
	change: (
		group: Immutable<ConfirmationGroupRecord>,
		caseId: string,
		role: ComparisonArm,
	) => Immutable<ConfirmationGroupRecord>,
): Promise<void> {
	await Array.fromAsync(fixture.caseIds, async (caseId) => {
		await Array.fromAsync(COMPARISON_ARMS, async (role) => {
			await fixture.changeGroup(`${caseId}-${role}${suffix}`, (group) =>
				change(group, caseId, role),
			);
		});
	});
}

/** Rewrites what each case's arm's group says its stages inherited. */
async function recordEveryGroup(
	fixture: ComparisonEvidenceFixture,
	{ suffix, configurationOf }: EveryGroup,
): Promise<void> {
	await changeEveryGroup(fixture, suffix, (group, caseId, role) => ({
		...group,
		inputs: {
			...group.inputs,
			inheritedConfiguration: configurationOf(caseId, role),
		},
	}));
}

/** Rewrites each case's arms' first groups as ones recorded before the field existed. */
async function forgetEveryGroupConfiguration(
	fixture: ComparisonEvidenceFixture,
): Promise<void> {
	await changeEveryGroup(fixture, "", (group) => {
		const { inheritedConfiguration: _recorded, ...inputs } = group.inputs;

		return { ...group, inputs };
	});
}

interface WrittenComparison {
	readonly notices: readonly string[];
	readonly reportFile: string;
}

async function compareCollectingNotices(
	manifestPath: string,
	runsDirectory: string,
): Promise<WrittenComparison> {
	const notices: string[] = [];
	const reportFile = await writeComparisonReport({
		manifestPath,
		notice: (line) => {
			notices.push(line);
		},
		runsDirectory,
	});

	return { notices, reportFile };
}

export {
	GATEWAY_A,
	GATEWAY_B,
	compareCollectingNotices,
	forgetEveryGroupConfiguration,
	recordEveryGroup,
};
