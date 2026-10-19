import type { FailedJudgeRunArtifact, RunArtifact } from "./contracts";
import { writeRunArtifact } from "./run-abort-artifact-records";
import type { RunArtifactPersistence } from "./run-abort-contracts";
import type RunAbortEvents from "./run-abort-events";
import type RunAbortTransitions from "./run-abort-transitions";

interface ArtifactLifecycleDependencies {
	readonly file: string;
	readonly persistence: RunArtifactPersistence;
	readonly events: Readonly<RunAbortEvents>;
	readonly transitions: Readonly<RunAbortTransitions>;
}

class RunAbortArtifactLifecycle {
	private pendingArtifact: RunArtifact | undefined = undefined;

	public get pending(): RunArtifact | undefined {
		return this.pendingArtifact;
	}

	public constructor(private readonly props: ArtifactLifecycleDependencies) {}

	public readonly writePendingArtifact = async (
		artifact: RunArtifact,
	): Promise<void> => {
		if (this.props.transitions.abortRequested) {
			return;
		}

		this.pendingArtifact = artifact;
		await this.props.transitions.enqueueNormal(async () => {
			await writeRunArtifact(this.props.file, artifact, this.props.persistence);
		});
	};

	public readonly completeArtifact = async (
		artifact: RunArtifact,
	): Promise<void> => {
		if (this.props.transitions.abortRequested) {
			return;
		}

		this.pendingArtifact = artifact;
		await this.props.transitions.enqueueNormal(async () => {
			await writeRunArtifact(this.props.file, artifact, this.props.persistence);
			this.props.events.artifactCompleted(artifact, "run-completed");
			this.pendingArtifact = undefined;
		});
	};

	public readonly awaitArtifactReview = async (): Promise<void> => {
		await this.props.transitions.enqueueNormal(async () => {
			const artifact = this.pendingArtifact;

			if (artifact !== undefined) {
				this.props.events.artifactCompleted(artifact, "run-completed");
			}
			this.pendingArtifact = undefined;
			await Promise.resolve();
		});
	};

	public readonly writeFailedArtifact = async (
		artifact: FailedJudgeRunArtifact,
	): Promise<void> => {
		this.pendingArtifact = artifact;
		await this.props.transitions.enqueue(async () => {
			await writeRunArtifact(this.props.file, artifact, this.props.persistence);
			this.props.events.artifactCompleted(artifact, "run-failed");
			this.pendingArtifact = undefined;
		});
	};
}

export { RunAbortArtifactLifecycle as default };
