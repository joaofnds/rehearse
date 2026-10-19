import type { RunSource } from "./run-artifact";
import {
	assertSourceReady,
	assertWorkflowBoardPrivate,
	claimTarget,
} from "./target";
import type { SourceBaseline } from "./target";
import { cloneTarget, discardClone, releaseClone } from "./target-clone";
import type { TargetServices } from "./target-services";

/**
 * The run works in its own clone of the target's main, so the operator's
 * checkout, with its untracked files and linked board, is never read or
 * written. A clone that cannot be claimed for the run is removed.
 */
async function cloneSource(
	target: SourceBaseline,
	runName: string,
): Promise<RunSource> {
	const clone = await cloneTarget(target.root);
	try {
		const source = await assertSourceReady(clone);
		await assertWorkflowBoardPrivate(clone);
		await claimTarget(source, runName);

		return { ...source, targetRoot: target.root };
	} catch (error) {
		await discardClone(clone);
		throw error;
	}
}

interface RunCheckout {
	readonly checkout: string;
	readonly targetRoot: string;
	readonly runName: string;
}

/**
 * Copies the run's commits into the target and removes its checkout, and stops
 * its services whether or not that worked. A checkout whose commits the target
 * could not take stays, since it holds their only copy.
 */
async function releaseRun(
	run: RunCheckout,
	services: TargetServices,
	log: (message: string) => void,
): Promise<void> {
	const [checkout, containers] = await Promise.allSettled([
		releaseCheckout(run, log),
		services.stop(),
	]);
	if (checkout.status === "rejected" && containers.status === "rejected") {
		throw new AggregateError(
			[checkout.reason, containers.reason],
			`${String(checkout.reason)}\n${String(containers.reason)}`,
		);
	}

	if (checkout.status === "rejected") {
		throw checkout.reason;
	}

	if (containers.status === "rejected") {
		throw containers.reason;
	}
}

async function releaseCheckout(
	run: RunCheckout,
	log: (message: string) => void,
): Promise<void> {
	await releaseClone(run.checkout, run.targetRoot, run.runName);
	log("Run checkout removed.");
}

export { releaseRun, cloneSource };
