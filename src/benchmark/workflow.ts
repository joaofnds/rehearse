import {
	ClaudeSessionError,
	claudeArgs,
	readClaudeEnvelope,
	readStructuredOutput,
	runStreamedSession,
} from "./claude";
import { MAX_STAGE_TURNS, STAGE_SILENCE_LIMIT_MS } from "./config";
import type { ClaudeEnvelope, StageTranscript, StageTurn } from "./contracts";
import { stageTurnSchema } from "./contracts";
import serialMap from "./serial-map";
import { remainingBudget, sessionCalls } from "./session-call-accounting";
import type { SessionCalls } from "./session-call-accounting";
import StageSessionError from "./stage-session-error";
import WorkflowExecutionError from "./workflow-contract";
import type { ClaudeCommand, WorkflowStageRequest } from "./workflow-contract";

const FALLBACK_CLOCK_MS = 0;
const INITIAL_OWNER_TURN_INDEX = 0;

interface StageConversationConfiguration {
	readonly request: WorkflowStageRequest;
	readonly runClaude: ClaudeCommand;
}

class StageConversation {
	private readonly request: WorkflowStageRequest;
	private readonly runClaude: ClaudeCommand;
	private readonly calls: SessionCalls;
	private readonly elapsedMs: () => number;
	private readonly exchanges: StageTranscript["exchanges"][number][] = [];
	private sessionId: string;
	private prompt: string;

	public constructor({ request, runClaude }: StageConversationConfiguration) {
		const captured: WorkflowStageRequest = {
			effort: request.effort,
			elapsedMs: request.elapsedMs,
			environment: request.environment,
			model: request.model,
			productOwner: request.productOwner,
			runEvents: request.runEvents,
			sessionBudgetUsd: request.sessionBudgetUsd,
			sessionId: request.sessionId,
			settingSources: request.settingSources,
			settingsOverlay: request.settingsOverlay,
			skill: request.skill,
			spendCeiling: request.spendCeiling,
			stage: request.stage,
			targetDir: request.targetDir,
			taskId: request.taskId,
		};

		this.request = captured;
		this.runClaude = runClaude;
		this.calls = sessionCalls(captured.spendCeiling);
		this.elapsedMs = captured.elapsedMs ?? (() => FALLBACK_CLOCK_MS);
		this.sessionId = captured.sessionId;
		this.prompt = stagePrompt(captured.skill, captured.taskId);
	}

	public async run(): Promise<StageTranscript> {
		try {
			const turns = serialMap(
				Array.from(
					{ length: MAX_STAGE_TURNS },
					(_value, index) => index,
				).values(),
				async (turn) => await this.invoke(turn),
			);
			for await (const envelope of turns) {
				const completed = await this.acceptTurn(envelope);
				if (completed !== undefined) {
					return completed;
				}
			}

			throw new Error(
				`${this.request.stage} exceeded ${MAX_STAGE_TURNS} turns`,
			);
		} catch (error) {
			if (error instanceof StageSessionError) {
				throw error;
			}

			throw new StageSessionError({
				cause: error,
				...this.calls.reading(),
			});
		}
	}

	private argumentsFor(turn: number, budgetUsd: number): readonly string[] {
		return [
			...claudeArgs({
				access: "unrestricted",
				output: "events",
				schema: stageTurnSchema,
				session: {
					id: this.sessionId,
					resume: turn > INITIAL_OWNER_TURN_INDEX,
				},
				settingSources: this.request.settingSources,
				settings: {
					budgetUsd,
					effort: this.request.effort,
					model: this.request.model,
				},
				settingsOverlay: this.request.settingsOverlay,
			}),
			this.prompt,
		];
	}

	private async invoke(turn: number): Promise<ClaudeEnvelope> {
		const budgetUsd = this.request.spendCeiling.budgetFor(
			remainingBudget(this.request.sessionBudgetUsd, this.calls.spentUsd()),
		);
		const { runClaude } = this;
		try {
			const output = await runClaude(
				this.argumentsFor(turn, budgetUsd),
				this.request.targetDir,
				{
					env: this.request.environment,
					silenceLimitMs: STAGE_SILENCE_LIMIT_MS,
				},
			);
			return readClaudeEnvelope(output);
		} catch (error) {
			if (error instanceof ClaudeSessionError) {
				this.calls.record(error.envelope);
			} else {
				this.calls.recordUnreported();
			}

			throw new WorkflowExecutionError({
				cause: error,
				...this.calls.reading(),
			});
		}
	}

	private readTurn(envelope: ClaudeEnvelope): StageTurn {
		try {
			return readStructuredOutput(envelope, stageTurnSchema);
		} catch (error) {
			throw new WorkflowExecutionError({
				cause: error,
				...this.calls.reading(),
			});
		}
	}

	private async acceptTurn(
		envelope: ClaudeEnvelope,
	): Promise<StageTranscript | undefined> {
		this.sessionId = envelope.session_id;
		this.calls.record(envelope);
		const agent = this.readTurn(envelope);
		if (agent.status === "COMPLETE") {
			return this.complete(agent);
		}

		const answer = await this.request.productOwner.ask(
			this.request.stage,
			agent.message,
		);
		this.continueAfterAnswer(agent, answer);

		return undefined;
	}

	private continueAfterAnswer(
		agent: StageTurn,
		productOwnerAnswer: string,
	): void {
		this.exchanges.push({ agent, productOwnerAnswer });
		this.recordTurn();
		this.prompt = continueStagePrompt(this.request.skill, productOwnerAnswer);
	}

	private recordTurn(): void {
		if (this.request.runEvents !== undefined) {
			const spentUsd = this.calls.spentUsd();
			const { elapsedMs } = this;
			this.request.runEvents.record("turn-completed", this.request.stage, {
				elapsedMs: elapsedMs(),
				spentUsd,
			});
		}
	}

	private complete(agent: StageTurn): StageTranscript {
		this.exchanges.push({ agent });
		this.recordTurn();

		return {
			costUsd: this.calls.spentUsd(),
			exchanges: this.exchanges,
			providerCalls: this.calls.providerCalls(),
			sessionId: this.sessionId,
			stage: this.request.stage,
		};
	}
}

function stagePrompt(skill: string, taskId: string): string {
	return `/${skill} ${taskId}\n\nRun the native /${skill} skill to completion. A Product Owner is available between turns. Do not call AskUserQuestion. When product input is required, return QUESTION with exactly one question, its recommendation, and enough context to decide. Return COMPLETE only after the skill's durable artifact is saved. Never mention this mediation protocol in project artifacts.`;
}

function continueStagePrompt(
	skill: string,
	productOwnerAnswer: string,
): string {
	return `Product Owner answer:\n\n${productOwnerAnswer}\n\nContinue the native /${skill} skill. Use QUESTION again if another decision is required, or COMPLETE after its durable artifact is saved.`;
}

async function runWorkflowStage(
	request: WorkflowStageRequest,
	runClaude: ClaudeCommand = runStreamedSession,
): Promise<StageTranscript> {
	return await new StageConversation({ request, runClaude }).run();
}

export { runWorkflowStage };
export { default as WorkflowExecutionError } from "./workflow-contract";
export { default as createProductOwner } from "./product-owner";
export type {
	ProductOwnerSnapshot,
	ProductOwner,
	ProductOwnerConfiguration,
} from "./product-owner";
export type { ClaudeCommand, WorkflowStageRequest } from "./workflow-contract";
