import type {
	ComparisonArmEvidence,
	ComparisonCaseEvidence,
} from "./comparison-evidence";
import inheritedConfigurationFindings from "./comparison-inherited-configuration";
import type {
	DifferingVariable,
	InheritedConfigurationFinding,
	RecordedConfiguration,
} from "./comparison-inherited-configuration";
import type { ComparisonArm } from "./comparison-record-source-schema";
import type { Immutable } from "./contracts";

const NONE = 0;

const FIRST_ARM = 0;

const ONE_ARM = 1;

const LAUNCH_SHELL = "the shell that started them";

/** A session arm's sessions record it on their attempts, a stage arm's groups on the group. */
function armRecords(
	arm: Immutable<ComparisonArmEvidence>,
): readonly RecordedConfiguration[] {
	if (arm.group.record.mode === "session") {
		return arm.reps.map(
			({ attempt }) => attempt?.record.setup?.inheritedConfiguration,
		);
	}

	return arm.groups.map(({ record }) =>
		record.mode === "session"
			? undefined
			: record.inputs.inheritedConfiguration,
	);
}

function armList(arms: readonly ComparisonArm[]): string {
	const last = arms.at(-ONE_ARM);
	const rest = arms.slice(FIRST_ARM, -ONE_ARM);
	if (rest.length === NONE) {
		return `arm ${String(last)}`;
	}

	return `arms ${rest.join(", ")} and ${last}`;
}

function variableText(variable: DifferingVariable): string {
	return variable.kind === "value"
		? `${variable.name} (different values)`
		: `${variable.name} (${variable.arm} only)`;
}

function findingText(finding: InheritedConfigurationFinding): string {
	switch (finding.kind) {
		case "unrecorded": {
			return `${armList(finding.arms)} recorded no Claude Code configuration inherited from ${LAUNCH_SHELL}, so whether every arm ran with the same configuration is unknown`;
		}
		case "mixed": {
			const parts = [
				...(finding.names.length === NONE
					? []
					: [
							`its records inherited different Claude Code configuration from ${LAUNCH_SHELL}: ${finding.names.join(", ")}`,
						]),
				...(finding.unrecorded
					? [
							`some of its records predate recording the Claude Code configuration inherited from ${LAUNCH_SHELL}`,
						]
					: []),
			];

			return `arm ${finding.arm} is mixed: ${parts.join(", and ")}`;
		}
		case "differs": {
			const [left, right] = finding.arms;

			return `arms ${left} and ${right} inherited different Claude Code configuration from ${LAUNCH_SHELL}: ${finding.variables.map(variableText).join(", ")}`;
		}
		default: {
			return finding satisfies never;
		}
	}
}

/**
 * One line for each place a comparison's arms ran with different Claude Code
 * configuration from the shell that started them, or cannot say, since the
 * contrast between such arms may measure the shell rather than the corpus.
 */
function inheritedConfigurationNotices(
	cases: Immutable<readonly ComparisonCaseEvidence[]>,
): readonly string[] {
	return cases.flatMap(({ caseId, arms }) =>
		inheritedConfigurationFindings({
			baseline: armRecords(arms.baseline),
			candidate: armRecords(arms.candidate),
			control: armRecords(arms.control),
		}).map((finding) => `case ${caseId} ${findingText(finding)}`),
	);
}

export { inheritedConfigurationNotices as default };
