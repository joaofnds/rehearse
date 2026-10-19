import type { ComparisonArm } from "#benchmark/comparison-record";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";

import type { ComparisonResponse } from "./comparison-response";

type ArmCorpusVersion =
	ComparisonResponse["corpusVersions"][string][ComparisonArm];

const NAMES = {
	baseline: { prose: "baseline (before)", role: "Baseline (before)" },
	candidate: { prose: "candidate (after)", role: "Candidate (after)" },
	control: { prose: "the control arm", role: "Control" },
} as const satisfies Readonly<
	Record<ComparisonArm, { readonly role: string; readonly prose: string }>
>;

/** The arms in the order the screen draws them. */
const DESIGN_ARMS = (["control", "baseline", "candidate"] as const).map(
	(arm) => ({ arm, role: NAMES[arm].role }),
);

function armProse(arm: ComparisonArm): string {
	return NAMES[arm].prose;
}

function armRole(arm: ComparisonArm): string {
	return NAMES[arm].role;
}

function corpusVersionText(version: ArmCorpusVersion): string {
	return version.state === "available"
		? corpusVersionLabel(version.digest)
		: version.reasons.join("; ");
}

export { armProse, armRole, corpusVersionText, DESIGN_ARMS };
