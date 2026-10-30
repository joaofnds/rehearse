import type { ComparisonArm } from "#benchmark/comparison-record";

import type { ComparisonResponse } from "./comparison-response";
import { armProse } from "./design-arms";
import { capitalized } from "./pairing-reading-text";

type CaseInheritedConfiguration =
	ComparisonResponse["inheritedConfiguration"][string];

type Finding = Extract<
	CaseInheritedConfiguration,
	{ readonly state: "available" }
>["findings"][number];

type DifferingVariable = Extract<
	Finding,
	{ readonly kind: "differs" }
>["variables"][number];

type MixedFinding = Extract<Finding, { readonly kind: "mixed" }>;

const NONE = 0;

const FIRST_ARM = 0;

const ONE_ARM = 1;

const INHERITED =
	"Claude Code configuration inherited from the shell that started them";

function armList(arms: readonly ComparisonArm[]): string {
	const names = arms.map((arm) => armProse(arm));
	const last = names.at(-ONE_ARM);
	const rest = names.slice(FIRST_ARM, -ONE_ARM);

	return rest.length === NONE
		? String(last)
		: `${rest.join(", ")} and ${String(last)}`;
}

function variableText(variable: DifferingVariable): string {
	return variable.kind === "value"
		? `${variable.name} (different values)`
		: `${variable.name}, which only ${armProse(variable.arm)} inherited`;
}

function mixedText({ arm, names, unrecorded }: MixedFinding): string {
	const lead = `${capitalized(armProse(arm))} is mixed: `;
	if (names.length === NONE) {
		return `${lead}some of its records predate recording the ${INHERITED}, so whether its attempts ran alike is unknown.`;
	}
	const predates = unrecorded
		? ", and some of its records predate recording it"
		: "";

	return `${lead}its records inherited different Claude Code configuration from the shell that started them: ${names.join(", ")}${predates}. Its figures pool attempts that ran differently.`;
}

function findingText(finding: Finding): string {
	switch (finding.kind) {
		case "unrecorded": {
			return `${capitalized(armList(finding.arms))} recorded no ${INHERITED}, so whether every arm ran with the same configuration is unknown.`;
		}
		case "mixed": {
			return mixedText(finding);
		}
		case "differs": {
			const [left, right] = finding.arms;

			return `${capitalized(armProse(left))} and ${armProse(right)} inherited different Claude Code configuration from the shell that started them: ${finding.variables.map(variableText).join(", ")}. The contrast between them may measure that difference too.`;
		}
		default: {
			return finding satisfies never;
		}
	}
}

/** One line for each place a case's arms ran with different Claude Code configuration from their shell, or cannot say. */
function inheritedConfigurationLines(
	reading: CaseInheritedConfiguration,
): readonly string[] {
	if (reading.state === "unavailable") {
		return [
			`Whether the arms inherited the same Claude Code configuration could not be read: ${reading.reasons.join("; ")}.`,
		];
	}

	return reading.findings.map(findingText);
}

export { inheritedConfigurationLines as default };
export type { CaseInheritedConfiguration };
