import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";

import { runCommand } from "#benchmark/command";
import { pathExists } from "#benchmark/file-presence";
import { benchmarkRunsDirectory } from "#benchmark/run-layout";
import { storeSpendCeiling } from "#benchmark/settings";
import type { CliTestWorkspace } from "#cli/cli-test-support";

import type { PipelineFixture } from "./cli-pipeline-test-fixture";
import {
	FREE_PROVIDER_CALL_COST_USD,
	TEST_SPEND_CEILING_USD,
	controlCopy,
	passingTarget,
	pipelineFixture,
	restoreDeclaredServices,
} from "./cli-pipeline-test-fixture";
import {
	containerShim,
	providerShim,
	recordDatabaseAddress,
} from "./cli-provider-test-fixture";

const BOARD_CONFIG = 'project_name: "Board"\n';
async function linkedBoardFixture(
	workspace: Readonly<CliTestWorkspace>,
): Promise<PipelineFixture & { readonly board: string }> {
	const directory = await workspace.createDirectory("rehearse-linked-board-");
	const fixture = await pipelineFixture(directory);
	const board = join(directory, "board");
	await mkdir(board);
	await Bun.write(join(board, "config.yml"), BOARD_CONFIG);
	await symlink(board, join(fixture.target, "backlog"));
	await Bun.write(
		join(fixture.target, ".git", "info", "exclude"),
		"/backlog\n",
	);

	return { ...fixture, board };
}

async function servicesFixture(
	workspace: Readonly<CliTestWorkspace>,
): Promise<PipelineFixture & { readonly seen: string }> {
	const directory = await workspace.createDirectory("rehearse-services-");
	const seen = join(directory, "seen");
	await mkdir(seen);
	const [control, binDirectory, target] = await Promise.all([
		controlCopy(directory),
		providerShim({
			callCostUsd: FREE_PROVIDER_CALL_COST_USD,
			directory,
			onCall: [recordDatabaseAddress(seen, "sessions.log")],
		}),
		passingTarget(directory, {
			check: recordDatabaseAddress(seen, "checks.log"),
			migrate: recordDatabaseAddress(seen, "setup.log"),
		}),
	]);
	await Promise.all([
		restoreDeclaredServices(control),
		containerShim(binDirectory),
		storeSpendCeiling(benchmarkRunsDirectory(control), TEST_SPEND_CEILING_USD),
	]);

	return { binDirectory, control, seen, target };
}
interface CandidateRetentionLocation {
	readonly target: string;
	readonly checkout: string;
}
interface CandidateRetentionState {
	readonly checkoutRemains: boolean;
	readonly retained: string;
}
async function retainedCandidateState({
	target,
	checkout,
}: CandidateRetentionLocation): Promise<CandidateRetentionState> {
	const retained = await runCommand(
		["git", "for-each-ref", "--format=%(refname)", "refs/rehearse"],
		target,
	);
	return {
		checkoutRemains: await pathExists(checkout),
		retained: retained.trim(),
	};
}

export {
	BOARD_CONFIG,
	linkedBoardFixture,
	retainedCandidateState,
	servicesFixture,
};
