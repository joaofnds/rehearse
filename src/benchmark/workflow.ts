import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import {
	claudeArgs,
	ClaudeSessionError,
	readClaudeCallMetrics,
	readClaudeEnvelope,
	readStructuredOutput,
	runJsonSession,
	runStreamedSession,
} from "./claude";
import type { Effort, WorkflowStage } from "./config";
import {
	CLAUDE_TIMEOUT_MS,
	MAX_STAGE_TURNS,
	STAGE_SILENCE_LIMIT_MS,
} from "./config";
import type {
	ClaudeEnvelope,
	ProviderCall,
	StageTranscript,
} from "./contracts";
import { productAnswerSchema, stageTurnSchema } from "./contracts";
import type { RunEventRecorder } from "./run-events";
import type { StageSessionFailure } from "./stage-session-error";
import { StageSessionError } from "./stage-session-error";
import type { SpendCeiling } from "./spend-ceiling";

export interface ProductOwnerSnapshot {
	readonly sessionId: string;
	readonly spentUsd: number;
	readonly providerCalls: readonly ProviderCall[];
}

export interface ProductOwner {
	readonly ask: (stage: WorkflowStage, question: string) => Promise<string>;
	readonly snapshot: () => ProductOwnerSnapshot;
}

export interface ProductOwnerConfiguration {
	readonly directory: string;
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly spendCeiling: SpendCeiling;
	readonly task: string;
	readonly productBrief: string;
}

export type ClaudeCommand = (
	command: readonly string[],
	directory: string,
	options: { readonly timeoutMs: number } | { readonly silenceLimitMs: number },
) => Promise<string>;

export interface WorkflowStageRequest {
	readonly targetDir: string;
	/**
	 * The provider session the stage runs under, chosen before it starts so
	 * the stage's start can name the transcript it is about to write.
	 */
	readonly sessionId: string;
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly spendCeiling: SpendCeiling;
	readonly productOwner: ProductOwner;
	readonly taskId: string;
	readonly stage: WorkflowStage;
	readonly skill: string;
	readonly settingSources?: "project" | undefined;
	readonly settingsOverlay?: string | undefined;
	readonly runEvents?: RunEventRecorder | undefined;
	/**
	 * Milliseconds elapsed since the run started, not a raw clock: shares its
	 * shape with run-abort.ts's RunAbortDependencies.elapsedMs so both modules
	 * report against the one origin the caller owns, rather than each stage
	 * session capturing its own start time and making elapsed time jump
	 * backward at every stage boundary.
	 */
	readonly elapsedMs?: (() => number) | undefined;
}

/** A stage session whose own worker call failed or answered out of contract. */
export class WorkflowExecutionError extends StageSessionError {
	public constructor(props: StageSessionFailure) {
		super(props, "Worker execution failed: ");
		this.name = "WorkflowExecutionError";
	}
}

/**
 * A resumed call's envelope reports the session's running total, while its
 * token counts are the call's own.
 */
function sessionSpendUsd(envelope: ClaudeEnvelope, spentUsd: number): number {
	return envelope.total_cost_usd ?? spentUsd;
}

function providerCall(
	envelope: ClaudeEnvelope,
	spentUsd: number,
): ProviderCall {
	const metrics = readClaudeCallMetrics(envelope);
	if (metrics === undefined) {
		return {};
	}

	return {
		metrics: {
			...metrics,
			costUsd: sessionSpendUsd(envelope, spentUsd) - spentUsd,
		},
	};
}

/** The calls one provider session made and the spend they add up to. */
interface SessionCalls {
	readonly spentUsd: () => number;
	readonly providerCalls: () => ProviderCall[];
	/** Records a call the provider reported, charging the ceiling what it added. */
	readonly record: (envelope: ClaudeEnvelope) => void;
}

function sessionCalls(spendCeiling: SpendCeiling): SessionCalls {
	let spentUsd = 0;
	const providerCalls: ProviderCall[] = [];

	return {
		spentUsd: () => spentUsd,
		providerCalls: () => [...providerCalls],
		record: (envelope) => {
			providerCalls.push(providerCall(envelope, spentUsd));
			spendCeiling.charge(
				sessionSpendUsd(envelope, spentUsd) - spentUsd,
				readClaudeCallMetrics(envelope),
			);
			spentUsd = sessionSpendUsd(envelope, spentUsd);
		},
	};
}

function remainingBudget(limitUsd: number, spentUsd: number): number {
	const remaining = limitUsd - spentUsd;
	if (remaining <= 0) {
		throw new Error("Claude session exhausted its budget");
	}

	return remaining;
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

/**
 * One Product Owner session answers every question in a run, so later
 * answers retain earlier decisions. The session state lives only in this
 * closure; callers receive answers and a cost snapshot, never the mutation.
 */
export function createProductOwner(
	configuration: ProductOwnerConfiguration,
	runClaude: ClaudeCommand = runJsonSession,
): ProductOwner {
	let sessionId: string = randomUUID();
	const calls = sessionCalls(configuration.spendCeiling);
	let started = false;

	return {
		ask: async (stage, question) => {
			const prompt = started
				? `The ${stage} session asks:\n\n${question}`
				: `Feature request:\n\n${configuration.task}\n\nProduct brief:\n\n${configuration.productBrief}\n\nThe ${stage} session asks:\n\n${question}`;
			const budgetUsd = configuration.spendCeiling.budgetFor(
				remainingBudget(configuration.sessionBudgetUsd, calls.spentUsd()),
			);
			await mkdir(configuration.directory, { recursive: true });

			let envelope;
			try {
				const output = await runClaude(
					[
						...claudeArgs({
							settings: {
								model: configuration.model,
								effort: configuration.effort,
								budgetUsd,
							},
							schema: productAnswerSchema,
							access: "sealed",
							systemPrompt:
								"You are the Product Owner for one software feature. Answer the current question directly and make a concrete decision. Keep every answer consistent with prior answers in this session. Prefer the smallest coherent product scope, preserve the task's required behavior, and defer implementation mechanics to the engineering agent. Do not discuss evaluation, grading, or this protocol.",
							session: { id: sessionId, resume: started },
						}),
						prompt,
					],
					configuration.directory,
					{ timeoutMs: CLAUDE_TIMEOUT_MS },
				);
				envelope = readClaudeEnvelope(output);
			} catch (error) {
				if (error instanceof ClaudeSessionError) {
					calls.record(error.envelope);
				}
				throw error;
			}

			sessionId = envelope.session_id;
			calls.record(envelope);
			started = true;

			return readStructuredOutput(envelope, productAnswerSchema).answer;
		},
		snapshot: () => ({
			sessionId,
			spentUsd: calls.spentUsd(),
			providerCalls: calls.providerCalls(),
		}),
	};
}

export async function runWorkflowStage(
	request: WorkflowStageRequest,
	runClaude: ClaudeCommand = runStreamedSession,
): Promise<StageTranscript> {
	const {
		targetDir,
		model,
		effort,
		sessionBudgetUsd,
		spendCeiling,
		productOwner,
		taskId,
		stage,
		skill,
		settingSources,
		settingsOverlay,
		runEvents,
		elapsedMs = () => 0,
	} = request;
	let { sessionId } = request;
	const calls = sessionCalls(spendCeiling);
	let prompt = stagePrompt(skill, taskId);
	const exchanges: StageTranscript["exchanges"][number][] = [];

	try {
		for (let turn = 0; turn < MAX_STAGE_TURNS; turn += 1) {
			const budgetUsd = spendCeiling.budgetFor(
				remainingBudget(sessionBudgetUsd, calls.spentUsd()),
			);
			let envelope;
			try {
				const output = await runClaude(
					[
						...claudeArgs({
							settings: {
								model,
								effort,
								budgetUsd,
							},
							schema: stageTurnSchema,
							access: "unrestricted",
							session: { id: sessionId, resume: turn > 0 },
							settingSources,
							settingsOverlay,
							output: "events",
						}),
						prompt,
					],
					targetDir,
					{ silenceLimitMs: STAGE_SILENCE_LIMIT_MS },
				);
				envelope = readClaudeEnvelope(output);
			} catch (error) {
				if (!(error instanceof ClaudeSessionError)) {
					throw new WorkflowExecutionError({
						cause: error,
						providerCalls: [...calls.providerCalls(), {}],
						costUsd: undefined,
					});
				}

				calls.record(error.envelope);
				throw new WorkflowExecutionError({
					cause: error,
					providerCalls: calls.providerCalls(),
					costUsd: error.costUsd === undefined ? undefined : calls.spentUsd(),
				});
			}

			sessionId = envelope.session_id;
			calls.record(envelope);
			let agent;
			try {
				agent = readStructuredOutput(envelope, stageTurnSchema);
			} catch (error) {
				throw new WorkflowExecutionError({
					cause: error,
					providerCalls: calls.providerCalls(),
					costUsd: calls.spentUsd(),
				});
			}

			if (agent.status === "COMPLETE") {
				exchanges.push({ agent });
				runEvents?.record(
					"turn-completed",
					stage,
					calls.spentUsd(),
					elapsedMs(),
				);

				return {
					stage,
					sessionId,
					costUsd: calls.spentUsd(),
					providerCalls: calls.providerCalls(),
					exchanges,
				};
			}

			const productOwnerAnswer = await productOwner.ask(stage, agent.message);
			exchanges.push({ agent, productOwnerAnswer });
			runEvents?.record("turn-completed", stage, calls.spentUsd(), elapsedMs());
			prompt = continueStagePrompt(skill, productOwnerAnswer);
		}

		throw new Error(`${stage} exceeded ${MAX_STAGE_TURNS} turns`);
	} catch (error) {
		if (error instanceof StageSessionError) {
			throw error;
		}

		throw new StageSessionError({
			cause: error,
			providerCalls: calls.providerCalls(),
			costUsd: calls.spentUsd(),
		});
	}
}
