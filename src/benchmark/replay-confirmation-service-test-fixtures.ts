import type { TargetDefinition } from "./pipeline";
import ReplayCorpusBuilder from "./replay-confirmation-corpus-test-builder";
import type { ReplayConfirmationInputs } from "./replay-confirmation-request-test-builder";
import type { ReplayDependencyOverride } from "./replay-confirmation-test-support";
import type { BenchmarkRunPaths } from "./run-layout";
import { POSTGRES } from "./target-services-test-support";
import { TEST_TARGET } from "./test-support";
import type { TestResources } from "./test-support";

const FIRST_RECORDED_CHECK_INDEX = 0;
const SERVED_TARGET: TargetDefinition = {
	...TEST_TARGET,
	services: [POSTGRES],
	setup: [{ command: ["bun", "install"] }],
};
async function servedInputs(
	paths: BenchmarkRunPaths,
	resources: Pick<TestResources, "track">,
): Promise<ReplayConfirmationInputs> {
	const corpusRoot = await new ReplayCorpusBuilder().build(resources);
	return { corpusRoots: [{ kind: "directory", root: corpusRoot }], paths };
}
class ReplayServiceAddresses {
	public readonly session = new Map<string, string | undefined>();
	public readonly checks = new Map<string, string | undefined>();
	public readonly override: ReplayDependencyOverride = (defaults) => ({
		...defaults,
		stageSession: {
			...defaults.stageSession,
			captureTreatmentChecks: async (targetDir, checks) => {
				this.checks.set(
					targetDir,
					checks[FIRST_RECORDED_CHECK_INDEX]?.env?.["DATABASE_URL"],
				);
				return await defaults.stageSession.captureTreatmentChecks(
					targetDir,
					checks,
				);
			},
			runWorkflowStage: async (request) => {
				this.session.set(
					request.targetDir,
					request.environment?.["DATABASE_URL"],
				);
				return await defaults.stageSession.runWorkflowStage(request);
			},
		},
	});
}
export { ReplayServiceAddresses, SERVED_TARGET, servedInputs };
