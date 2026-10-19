import completeRunCandidate from "./run-candidate-completion";
import judgeRunCandidate from "./run-candidate-judgment";
import type {
	BenchmarkRunExecution,
	PreparedRunExecution,
} from "./run-execution-context";
import reportRunFailure from "./run-failure";
import type { BenchmarkRunPaths } from "./run-layout";
import prepareBenchmarkRun from "./run-preparation";
import RunReview from "./run-review";
import RunPausedError from "./run-stage-context";
import executePreparedRunStages from "./run-stage-execution";

class RunExecution {
	private review: RunReview | undefined = undefined;
	public constructor(private readonly execution: BenchmarkRunExecution) {}
	public async run(): Promise<BenchmarkRunPaths> {
		try {
			const request = {
				execution: this.execution,
				prepared: await prepareBenchmarkRun(this.execution),
			};

			this.review = new RunReview(request);
			await completePreparedBenchmarkRun(request, this.review);

			return this.execution.identity.files;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			await this.execution.output.reportError(message);

			await reportRunFailure(this.execution, this.review, {
				message,
				pausedStage: error instanceof RunPausedError ? error.stage : undefined,
			});

			throw error;
		} finally {
			await this.execution.lifetime.close();
		}
	}
}

async function completePreparedBenchmarkRun(
	request: PreparedRunExecution,
	review: Readonly<RunReview>,
): Promise<void> {
	const outcome = await executePreparedRunStages({ ...request, review });
	const candidate = await judgeRunCandidate(request, outcome);

	await completeRunCandidate({ ...request, candidate, review });
}
export { RunExecution as default };
