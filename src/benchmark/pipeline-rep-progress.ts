import type { StageClock } from "./pipeline-stage-clock";
import { createStageClock } from "./pipeline-stage-clock";
import type { ReadManifestEntry } from "./read-manifest";
import type { StageSessionResult } from "./stage-session-contract";
import type { ProductOwner } from "./workflow";

const INITIAL_STAGE_INDEX = 0;

class PipelineRepProgress {
	private created = false;
	private owner: ProductOwner | undefined = undefined;
	private stageIndex = INITIAL_STAGE_INDEX;
	private session: StageSessionResult | undefined = undefined;
	private clock: StageClock;
	private stageJudgmentActive = false;
	private reads: readonly ReadManifestEntry[] = [];
	private finalJudgmentActive = false;
	private operation: string | undefined = "worktree creation";
	public constructor(private readonly now: () => number) {
		this.clock = createStageClock(now);
	}
	public get worktreeCreated(): boolean {
		return this.created;
	}
	public get productOwner(): ProductOwner | undefined {
		return this.owner;
	}
	public get currentStageIndex(): number {
		return this.stageIndex;
	}
	public get currentSession(): StageSessionResult | undefined {
		return this.session;
	}
	public get stageClock(): StageClock {
		return this.clock;
	}
	public get judgingStage(): boolean {
		return this.stageJudgmentActive;
	}
	public get judgedReads(): readonly ReadManifestEntry[] {
		return this.reads;
	}
	public get judgingFinal(): boolean {
		return this.finalJudgmentActive;
	}
	public get setupOperation(): string | undefined {
		return this.operation;
	}
	public worktreeAdded(): void {
		this.created = true;
		this.operation = "service start";
	}
	public beginSetup(operation: string): void {
		this.operation = operation;
	}
	public completeSetup(): void {
		this.operation = undefined;
	}
	public attachProductOwner(owner: ProductOwner): void {
		this.owner = owner;
	}
	public beginStage(index: number): void {
		this.stageIndex = index;
		this.session = undefined;
		this.clock = createStageClock(this.now);
		this.operation = "corpus installation";
	}
	public receiveSession(session: StageSessionResult): void {
		this.session = session;
	}
	public beginStageJudgment(reads: readonly ReadManifestEntry[]): void {
		this.reads = reads;
		this.stageJudgmentActive = true;
	}
	public stageJudged(): void {
		this.stageJudgmentActive = false;
	}
	public beginFinalJudgment(): void {
		this.finalJudgmentActive = true;
	}
}
export { PipelineRepProgress as default };
