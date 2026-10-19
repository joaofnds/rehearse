import type {
	BenchmarkConfirmationExecution,
	BenchmarkExecutionDependencies,
} from "./benchmark-command";

class BenchmarkConfirmationProbe {
	public readonly events: string[] = [];
	public readonly confirmations: BenchmarkConfirmationExecution[] = [];
	public readonly approval = Promise.withResolvers<string>();
	public dependencies(): BenchmarkExecutionDependencies<
		{ readonly judge: string },
		{ readonly group: string }
	> {
		return {
			approval: {
				output: (message) => {
					this.events.push(`output:${message}`);
				},
				prompt: async (message) => {
					this.events.push(`prompt:${message}`);

					return await this.approval.promise;
				},
			},
			runConfirmed: async (request) => {
				this.confirmations.push(request);
				this.events.push(`start:${request.reps}`);

				return await Promise.resolve({ group: "pipeline-1" });
			},
			runDebug: async () =>
				await Promise.reject(new Error("debug must not run")),
		};
	}
}
export { BenchmarkConfirmationProbe as default };
