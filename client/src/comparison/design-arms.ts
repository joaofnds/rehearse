import type { ComparisonArm } from "#benchmark/comparison-record";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import type { ComparisonResponse } from "./comparison-response";

type ArmCorpusVersion =
	ComparisonResponse["corpusVersions"][string][ComparisonArm];

const NAMES = {
	control: { role: "Control", prose: "the control arm" },
	baseline: { role: "Baseline (before)", prose: "baseline (before)" },
	candidate: { role: "Candidate (after)", prose: "candidate (after)" },
} as const satisfies Readonly<
	Record<ComparisonArm, { readonly role: string; readonly prose: string }>
>;

/** The arms in the order the screen draws them. */
export const DESIGN_ARMS = (["control", "baseline", "candidate"] as const).map(
	(arm) => ({ arm, role: NAMES[arm].role }),
);

export function armProse(arm: ComparisonArm): string {
	return NAMES[arm].prose;
}

export function armRole(arm: ComparisonArm): string {
	return NAMES[arm].role;
}

export function corpusVersionText(version: ArmCorpusVersion): string {
	return version.state === "available"
		? corpusVersionLabel(version.digest)
		: version.reasons.join("; ");
}
