import type { ExtensionPlan } from "#benchmark/compare-attempts";
import { compareAttempts, extendComparison } from "#benchmark/compare-attempts";
import type { ApprovalMethod } from "#benchmark/config";
import { UsageError } from "#cli/command-usage";
import { requireInteractiveStdin } from "#cli/interactive-stdin";
import { writeRecord } from "#cli/output";
import type { ReplayCommandDependencies } from "#cli/replay-command";

import replayArmGroup from "./comparison-arm-replay";

const USD_FRACTION_DIGITS = 2;

/** How a command that runs arms was told their cost is approved. */
interface ArmApprovalFlags {
	readonly yes: boolean;
	readonly approvedInBrowser: boolean;
}

interface CompareAttemptsCommandRequest extends ArmApprovalFlags {
	readonly runsDirectory: string;
	readonly armA: string | undefined;
	readonly armB: string | undefined;
	readonly json: boolean;
	readonly stdinIsTerminal: boolean;
}

function approvalMethod(request: ArmApprovalFlags): ApprovalMethod {
	if (request.approvedInBrowser) {
		if (!request.yes) {
			throw new UsageError("Use --approved-in-browser only with --yes");
		}

		return "browser";
	}

	return request.yes ? "yes" : "interactive";
}

/**
 * Compares two recorded attempts at one checkpoint as arms A and B, running
 * only the baseline arm, and prints the comparison's report.
 */
async function runCompareAttemptsCommand(
	request: CompareAttemptsCommandRequest,
	dependencies: ReplayCommandDependencies,
): Promise<void> {
	const { armA, armB } = request;
	if (armA === undefined || armB === undefined) {
		throw new UsageError(
			"Provide both attempts' confirmation groups: rehearse compare attempts --arm-a <group-id> --arm-b <group-id>",
		);
	}

	const approval = approvalMethod(request);

	const { reportFile } = await compareAttempts(
		{ armA, armB, runsDirectory: request.runsDirectory },
		{
			runBaselineGroup: replayArmGroup(
				{ approval, stdinIsTerminal: request.stdinIsTerminal },
				dependencies,
			),
		},
	);

	await writeRecord(dependencies.output, reportFile, request.json);
}

interface CompareExtendCommandRequest extends ArmApprovalFlags {
	readonly runsDirectory: string;
	readonly comparison: string | undefined;
	readonly attempts: string | undefined;
	readonly json: boolean;
	readonly stdinIsTerminal: boolean;
}

interface CompareExtendCommandDependencies extends ReplayCommandDependencies {
	readonly prompt: (message: string) => Promise<string>;
}

const ATTEMPTS_PATTERN = /^[1-9][0-9]*$/u;

const COMPARISON_PATTERN = /^(?:comparison:)?(?<digest>[0-9a-f]{64})$/u;

/** A comparison as its report's directory or `list comparisons` names it. */
function parseComparison(comparison: string | undefined): string {
	const digest = COMPARISON_PATTERN.exec(comparison ?? "")?.groups?.["digest"];
	if (digest === undefined) {
		throw new UsageError(
			"Provide the comparison to extend by its manifest digest: rehearse compare extend --comparison <comparison:digest> --attempts <n>",
		);
	}

	return digest;
}

function parseAttemptsPerArm(attempts: string | undefined): number {
	if (attempts === undefined || !ATTEMPTS_PATTERN.test(attempts)) {
		throw new UsageError(
			"Provide how many attempts to add to each arm as a positive whole number: --attempts <n>",
		);
	}

	return Number(attempts);
}

function formatExtensionCost(cost: ExtensionPlan["cost"]): string {
	return `Adding ${cost.attemptsPerArm} attempts to each arm costs about $${cost.usd.toFixed(USD_FRACTION_DIGITS)}, at each arm's mean recorded cost per attempt.`;
}

/**
 * States what adding attempts to every arm of a saved comparison costs and,
 * once that is approved, replays them and prints the new comparison's report.
 * The operator approves the stated cost once, so each arm's replay runs as
 * approved and still meets the spend ceiling.
 */
async function runCompareExtendCommand(
	request: CompareExtendCommandRequest,
	dependencies: CompareExtendCommandDependencies,
): Promise<void> {
	const comparison = parseComparison(request.comparison);
	const attemptsPerArm = parseAttemptsPerArm(request.attempts);
	const approval = approvalMethod(request);
	if (approval === "interactive") {
		requireInteractiveStdin(
			request.stdinIsTerminal,
			"approving the added attempts' cost needs a TTY; pass --yes instead",
		);
	}

	const { reportFile } = await extendComparison(
		{ attemptsPerArm, comparison, runsDirectory: request.runsDirectory },
		{
			approve: async (cost) => {
				dependencies.output.stderr(`${formatExtensionCost(cost)}\n`);
				if (approval !== "interactive") {
					return;
				}
				const response = await dependencies.prompt("Add the attempts? [y/N] ");
				const answer = response.trim().toLowerCase();
				if (answer !== "y" && answer !== "yes") {
					throw new Error("Extension declined");
				}
			},
			runArmGroup: replayArmGroup(
				{
					approval: approval === "interactive" ? "yes" : approval,
					stdinIsTerminal: request.stdinIsTerminal,
				},
				dependencies,
			),
		},
	);

	await writeRecord(dependencies.output, reportFile, request.json);
}

export { default as replayArmGroup } from "./comparison-arm-replay";
export type { ArmReplayRequest } from "./comparison-arm-replay";
export {
	approvalMethod,
	formatExtensionCost,
	runCompareAttemptsCommand,
	runCompareExtendCommand,
};
export type {
	ArmApprovalFlags,
	CompareAttemptsCommandRequest,
	CompareExtendCommandDependencies,
	CompareExtendCommandRequest,
};
