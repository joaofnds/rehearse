import type { ReplayStageExecutionDependencies } from "./replay-command";
import type { ReplayConfirmationRequest } from "./replay-confirmation";

class ReplayConfirmationApproval {
	public readonly approval = Promise.withResolvers<string>();
	public readonly events: string[] = [];
	public readonly confirmations: ReplayConfirmationRequest[] = [];
	public readonly dependencies: ReplayStageExecutionDependencies<
		never,
		{ readonly group: string }
	> = {
		approval: {
			output: (message) => {
				this.events.push(`output:${message}`);
			},
			prompt: async (message) => {
				this.events.push(`prompt:${message}`);
				return await this.approval.promise;
			},
		},
		corpusRoots: [{ kind: "directory", root: "/corpus" }],
		groupId: () => "confirmation-1",
		runConfirmed: async (request) => {
			this.confirmations.push(request);
			this.events.push(`start:${request.reps}`);
			return await Promise.resolve({ group: request.groupId });
		},
		runDebug: () => {
			throw new Error("debug must not run");
		},
	};
}
export default ReplayConfirmationApproval;
