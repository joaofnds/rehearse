import { basename } from "node:path";

import type { PipelineConfirmationDependencies } from "./pipeline-confirmation";
import type { StageSessionDependencies } from "./stage-session-dependencies";

const FIRST_REP_ORDINAL = 1;
const SECOND_REP_ORDINAL = 2;

interface WorkspaceFaults {
	readonly collideFirstWorktree?: boolean;
	readonly rejectFirstCheckpoint?: boolean;
	readonly rejectStageCorpora?: boolean;
}

function repOrdinal(path: string): number {
	const match = /-rep-(?<ordinal>\d+)$/u.exec(path);
	return Number(match?.groups?.["ordinal"]);
}

class PipelineWorkspaceFake {
	public readonly started: number[] = [];
	private readonly faults: WorkspaceFaults;

	public constructor(faults: WorkspaceFaults = {}) {
		this.faults = faults;
	}

	public readonly override = (
		dependencies: PipelineConfirmationDependencies,
	): PipelineConfirmationDependencies => ({
		...dependencies,
		addWorktree: async (root, sha, path) => {
			if (
				this.faults.collideFirstWorktree === true &&
				path.endsWith("-rep-1")
			) {
				throw new Error("synthetic worktree collision");
			}

			await dependencies.addWorktree(root, sha, path);
		},
		installStageCorpusSnapshot: this.corpusInstaller(dependencies),
		materializeCheckpoint: async (checkpointDirectory, worktreePath) => {
			if (
				this.faults.rejectFirstCheckpoint === true &&
				worktreePath.endsWith("-rep-1")
			) {
				throw new Error("synthetic checkpoint rejection");
			}

			return await dependencies.materializeCheckpoint(
				checkpointDirectory,
				worktreePath,
			);
		},
		stageSession: this.stageSession(dependencies.stageSession),
	});

	private corpusInstaller(
		dependencies: PipelineConfirmationDependencies,
	): PipelineConfirmationDependencies["installStageCorpusSnapshot"] {
		return async (snapshotDirectory, worktreePath, citations) => {
			const ordinal = repOrdinal(worktreePath);
			const stage = basename(snapshotDirectory);
			if (
				this.faults.rejectStageCorpora === true &&
				ordinal === FIRST_REP_ORDINAL &&
				stage === "discuss"
			) {
				throw new Error("synthetic discuss corpus rejection");
			}

			if (
				this.faults.rejectStageCorpora === true &&
				ordinal === SECOND_REP_ORDINAL &&
				stage === "build"
			) {
				throw new Error("synthetic build corpus rejection");
			}

			return await dependencies.installStageCorpusSnapshot(
				snapshotDirectory,
				worktreePath,
				citations,
			);
		};
	}

	private stageSession(
		dependencies: StageSessionDependencies,
	): StageSessionDependencies {
		return {
			...dependencies,
			runWorkflowStage: async (request) => {
				if (request.stage === "discuss") {
					this.started.push(repOrdinal(request.targetDir));
				}

				return await dependencies.runWorkflowStage(request);
			},
		};
	}
}

export { PipelineWorkspaceFake as default };
