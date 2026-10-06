import type { ComparisonArm } from "#benchmark/comparison-record";

/**
 * The design's arm roles in the order the screen draws them: its baseline arm
 * is the harness's control, and its arms A and B are the harness's baseline
 * and candidate.
 */
export const DESIGN_ARMS = [
	{ arm: "control", role: "Baseline", prose: "the baseline arm" },
	{ arm: "baseline", role: "Arm A", prose: "arm A" },
	{ arm: "candidate", role: "Arm B", prose: "arm B" },
] as const satisfies readonly {
	readonly arm: ComparisonArm;
	readonly role: string;
	readonly prose: string;
}[];

/** How a sentence names an arm. */
export function armProse(arm: ComparisonArm): string {
	const found = DESIGN_ARMS.find((design) => design.arm === arm);
	if (found === undefined) {
		throw new Error(`Unknown comparison arm: ${arm}`);
	}

	return found.prose;
}
