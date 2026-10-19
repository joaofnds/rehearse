import type { RunBaseline } from "./run-baseline";
import type { BenchmarkRunExecution } from "./run-execution-context";
import captureServicedRunBaseline from "./run-target-baseline";
import { claimShortId, formatShortId } from "./short-id";
import { startTargetServices } from "./target-services";
import type { ServiceEnvironment } from "./target-services";

interface PreparedRunTarget {
	readonly baseline: RunBaseline;
	readonly environment: ServiceEnvironment;
}
async function prepareRunTarget(
	execution: BenchmarkRunExecution,
): Promise<PreparedRunTarget> {
	const { source, identity, lifetime, output, inputs, pipeline } = execution;
	output.writeProgress(`Target: ${identity.target.root}`);
	output.writeProgress(`Run checkout: ${source.root}`);
	output.writeProgress(`Original commit: ${source.sha}`);
	const environment = await startTargetServices(
		lifetime.resources.workspace.services,
		pipeline.target,
	);
	const baseline = await captureServicedRunBaseline(execution, environment);
	const shortId = await claimShortId(
		identity.files.runsDirectory,
		inputs.config.caseId,
		{ kind: "run", run: identity.files.name },
	);
	output.writeProgress(`Short id: ${formatShortId(shortId)}`);
	return { baseline, environment };
}
export { prepareRunTarget as default };
export type { PreparedRunTarget };
