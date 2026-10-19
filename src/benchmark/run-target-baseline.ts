import {
	captureBaselineContext,
	captureFileHashes,
	runChecks,
	runSetup,
} from "./checks";
import { captureRunBaseline } from "./run-baseline";
import type { RunBaseline } from "./run-baseline";
import type { BenchmarkRunExecution } from "./run-execution-context";
import { assertWorkspaceCleanAt } from "./target";
import { checksWithServices, setupWithServices } from "./target-services";
import type { ServiceEnvironment } from "./target-services";

async function captureServicedRunBaseline(
	execution: BenchmarkRunExecution,
	environment: ServiceEnvironment,
): Promise<RunBaseline> {
	const { log } = execution.output;
	return await captureRunBaseline(
		{
			assertWorkspaceCleanAt,
			captureBaselineContext,
			captureFileHashes,
			runChecks: async (targetDir, label, checks) => {
				await runChecks(
					targetDir,
					{ checks: checksWithServices(checks, environment), label },
					log,
				);
			},
			runSetup: async (targetDir, setup) => {
				await runSetup(targetDir, setupWithServices(setup, environment), log);
			},
		},
		execution.source,
		execution.pipeline.target,
	);
}
export { captureServicedRunBaseline as default };
