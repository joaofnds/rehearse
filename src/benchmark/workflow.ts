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

function reasonOf(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}

export class WorkflowExecutionError extends Error {
	public readonly providerCalls: readonly ProviderCall[];
	/** The session's spend up to the failure, unknown when its last call reported none. */
	public readonly costUsd: number | undefined;

	public constructor(props: {
		readonly cause: unknown;
		readonly providerCalls: readonly ProviderCall[];
		readonly costUsd: number | undefined;
	}) {
		super(`Worker execution failed: ${reasonOf(props.cause)}`, {
			cause: props.cause,
		});
		this.name = "WorkflowExecutionError";
		this.providerCalls = props.providerCalls;
		this.costUsd = props.costUsd;
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
	let spentUsd = 0;
	const providerCalls: ProviderCall[] = [];
	let started = false;

	return {
		ask: async (stage, question) => {
			const prompt = started
				? `The ${stage} session asks:\n\n${question}`
				: `Feature request:\n\n${configuration.task}\n\nProduct brief:\n\n${configuration.productBrief}\n\nThe ${stage} session asks:\n\n${question}`;
			const budgetUsd = configuration.spendCeiling.budgetFor(
				remainingBudget(configuration.sessionBudgetUsd, spentUsd),
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
				configuration.spendCeiling.charge(
					((error instanceof ClaudeSessionError ? error.costUsd : undefined) ??
						spentUsd) - spentUsd,
				);
				throw error;
			}

			sessionId = envelope.session_id;
			providerCalls.push(providerCall(envelope, spentUsd));
			configuration.spendCeiling.charge(
				sessionSpendUsd(envelope, spentUsd) - spentUsd,
				readClaudeCallMetrics(envelope),
			);
			spentUsd = sessionSpendUsd(envelope, spentUsd);
			started = true;

			return readStructuredOutput(envelope, productAnswerSchema).answer;
		},
		snapshot: () => ({
			sessionId,
			spentUsd,
			providerCalls: [...providerCalls],
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
	let spentUsd = 0;
	const providerCalls: ProviderCall[] = [];
	let prompt = stagePrompt(skill, taskId);
	const exchanges: StageTranscript["exchanges"][number][] = [];
	const recordCall = (envelope: ClaudeEnvelope): void => {
		providerCalls.push(providerCall(envelope, spentUsd));
		spendCeiling.charge(
			sessionSpendUsd(envelope, spentUsd) - spentUsd,
			readClaudeCallMetrics(envelope),
		);
		spentUsd = sessionSpendUsd(envelope, spentUsd);
	};

	for (let turn = 0; turn < MAX_STAGE_TURNS; turn += 1) {
		const budgetUsd = spendCeiling.budgetFor(
			remainingBudget(sessionBudgetUsd, spentUsd),
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
					providerCalls: [...providerCalls, {}],
					costUsd: undefined,
				});
			}

			recordCall(error.envelope);
			throw new WorkflowExecutionError({
				cause: error,
				providerCalls: [...providerCalls],
				costUsd: error.costUsd === undefined ? undefined : spentUsd,
			});
		}

		sessionId = envelope.session_id;
		recordCall(envelope);
		let agent;
		try {
			agent = readStructuredOutput(envelope, stageTurnSchema);
		} catch (error) {
			throw new WorkflowExecutionError({
				cause: error,
				providerCalls: [...providerCalls],
				costUsd: spentUsd,
			});
		}

		if (agent.status === "COMPLETE") {
			exchanges.push({ agent });
			runEvents?.record("turn-completed", stage, spentUsd, elapsedMs());

			return { stage, sessionId, costUsd: spentUsd, providerCalls, exchanges };
		}

		const productOwnerAnswer = await productOwner.ask(stage, agent.message);
		exchanges.push({ agent, productOwnerAnswer });
		runEvents?.record("turn-completed", stage, spentUsd, elapsedMs());
		prompt = continueStagePrompt(skill, productOwnerAnswer);
	}

	throw new Error(`${stage} exceeded ${MAX_STAGE_TURNS} turns`);
}
