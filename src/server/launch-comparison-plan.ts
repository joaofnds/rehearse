import { planComparison } from "#benchmark/compare-attempts";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import { HTTP_STATUS_NOT_FOUND } from "#server/http-status";
import { LaunchRefusalError, asLaunchRefusal } from "#server/launch-refusal";
import type { Launch } from "#server/launches-contract";

interface ComparisonLaunchArms {
	readonly armA: string;
	readonly armB: string;
}

/**
 * A comparison runs a baseline group, so arms it would refuse for free are
 * refused here, before a process is started that would only refuse them.
 */
async function comparisonLaunch(
	arms: ComparisonLaunchArms,
	runsDirectory: string,
): Promise<Launch> {
	await Array.fromAsync([arms.armA, arms.armB], async (groupId) => {
		if (
			!(await Bun.file(
				confirmationGroupPaths(runsDirectory, groupId).groupFile,
			).exists())
		) {
			throw new LaunchRefusalError(
				`No recorded confirmation group ${groupId}`,
				HTTP_STATUS_NOT_FOUND,
			);
		}
	});
	const { armA } = await asLaunchRefusal(
		async () => await planComparison({ runsDirectory, ...arms }),
	);

	return {
		argv: [
			"compare",
			"attempts",
			"--arm-a",
			arms.armA,
			"--arm-b",
			arms.armB,
			"--yes",
			"--approved-in-browser",
		],
		target: {
			kind: "comparison",
			...arms,
			...armA.checkpoint,
			attempts: armA.group.reps,
		},
	};
}

export { comparisonLaunch as default };
