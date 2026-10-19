import type { PipelineConfirmationDependencies } from "./pipeline-confirmation";

const FIRST_RECORDED_CHECK_INDEX = 0;
const INITIAL_SETUP_CALL_INDEX = 0;

interface ServiceAddresses {
	readonly checks: string | undefined;
	readonly sessions: readonly (string | undefined)[];
	readonly setup: string | undefined;
}

class PipelineServicesProbe {
	private readonly setupAddress = new Map<string, string | undefined>();
	private readonly sessionAddresses = new Map<
		string,
		Set<string | undefined>
	>();
	private readonly checkAddress = new Map<string, string | undefined>();

	public readonly override = (
		dependencies: PipelineConfirmationDependencies,
	): PipelineConfirmationDependencies => ({
		...dependencies,
		runSetup: async (targetDir, setup) => {
			this.setupAddress.set(
				targetDir,
				setup?.[INITIAL_SETUP_CALL_INDEX]?.env?.["DATABASE_URL"],
			);
			await Promise.resolve();
		},
		stageSession: {
			...dependencies.stageSession,
			captureTreatmentChecks: async (targetDir, checks) => {
				this.checkAddress.set(
					targetDir,
					checks[FIRST_RECORDED_CHECK_INDEX]?.env?.["DATABASE_URL"],
				);

				return await dependencies.stageSession.captureTreatmentChecks(
					targetDir,
					checks,
				);
			},
			runWorkflowStage: async (request) => {
				const seen = this.sessionAddresses.get(request.targetDir) ?? new Set();
				seen.add(request.environment?.["DATABASE_URL"]);
				this.sessionAddresses.set(request.targetDir, seen);

				return await dependencies.stageSession.runWorkflowStage(request);
			},
		},
	});

	public addresses(): readonly ServiceAddresses[] {
		return [...this.sessionAddresses.keys()].map((rep) => ({
			checks: this.checkAddress.get(rep),
			sessions: [...(this.sessionAddresses.get(rep) ?? [])],
			setup: this.setupAddress.get(rep),
		}));
	}
}

export { PipelineServicesProbe as default };
