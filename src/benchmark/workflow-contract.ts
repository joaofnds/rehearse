import type { Effort, WorkflowStage } from "./config";
import type { ProductOwner } from "./product-owner";
import type { RunEventRecorder } from "./run-events";
import type { SpendCeiling } from "./spend-ceiling";
import StageSessionError from "./stage-session-error";
import type { StageSessionFailure } from "./stage-session-error";
import type { ServiceEnvironment } from "./target-services";

type ClaudeCommand = (
	command: readonly string[],
	directory: string,
	options: (
		| { readonly timeoutMs: number }
		| { readonly silenceLimitMs: number }
	) & { readonly env?: ServiceEnvironment | undefined },
) => Promise<string>;

interface WorkflowStageRequest {
	readonly targetDir: string;
	readonly sessionId: string;
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly spendCeiling: SpendCeiling;
	readonly productOwner: ProductOwner;
	readonly taskId: string;
	readonly stage: WorkflowStage;
	readonly skill: string;
	readonly setup?: "actual" | undefined;
	readonly settingsOverlay?: string | undefined;
	readonly environment?: ServiceEnvironment | undefined;
	readonly runEvents?: RunEventRecorder | undefined;
	/** Milliseconds since the run began, measured from the caller's origin. */
	readonly elapsedMs?: (() => number) | undefined;
}

class WorkflowExecutionError extends StageSessionError {
	public constructor(props: StageSessionFailure) {
		super(props, "Worker execution failed: ");
		this.name = "WorkflowExecutionError";
	}
}

export { WorkflowExecutionError as default };
export type { ClaudeCommand, WorkflowStageRequest };
