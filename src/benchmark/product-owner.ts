import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";

import {
	ClaudeSessionError,
	claudeArgs,
	readClaudeEnvelope,
	readStructuredOutput,
	runJsonSession,
} from "./claude";
import type { Effort, WorkflowStage } from "./config";
import { CLAUDE_TIMEOUT_MS } from "./config";
import type { ClaudeEnvelope, ProviderCall } from "./contracts";
import { productAnswerSchema } from "./contracts";
import { remainingBudget, sessionCalls } from "./session-call-accounting";
import type { SessionCalls } from "./session-call-accounting";
import type { SpendCeiling } from "./spend-ceiling";
import type { ClaudeCommand } from "./workflow";

interface ProductOwnerSnapshot {
	readonly sessionId: string;
	readonly spentUsd: number;
	readonly providerCalls: readonly ProviderCall[];
}

interface ProductOwner {
	readonly ask: (stage: WorkflowStage, question: string) => Promise<string>;
	readonly snapshot: () => ProductOwnerSnapshot;
}

interface ProductOwnerConfiguration {
	readonly directory: string;
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly spendCeiling: SpendCeiling;
	readonly task: string;
	readonly productBrief: string;
}

interface ProductOwnerInvocation {
	readonly configuration: ProductOwnerConfiguration;
	readonly runClaude: ClaudeCommand;
	readonly sessionId: string;
	readonly started: boolean;
	readonly budgetUsd: number;
	readonly prompt: string;
	readonly calls: SessionCalls;
}

async function readProductOwnerEnvelope({
	configuration,
	runClaude,
	sessionId,
	started,
	budgetUsd,
	prompt,
	calls,
}: ProductOwnerInvocation): Promise<ClaudeEnvelope> {
	try {
		const output = await runClaude(
			[
				...claudeArgs({
					access: "sealed",
					schema: productAnswerSchema,
					session: { id: sessionId, resume: started },
					settings: {
						budgetUsd,
						effort: configuration.effort,
						model: configuration.model,
					},
					systemPrompt:
						"You are the Product Owner for one software feature. Answer the current question directly and make a concrete decision. Keep every answer consistent with prior answers in this session. Prefer the smallest coherent product scope, preserve the task's required behavior, and defer implementation mechanics to the engineering agent. Do not discuss evaluation, grading, or this protocol.",
				}),
				prompt,
			],
			configuration.directory,
			{ timeoutMs: CLAUDE_TIMEOUT_MS },
		);
		return readClaudeEnvelope(output);
	} catch (error) {
		if (error instanceof ClaudeSessionError) {
			calls.record(error.envelope);
		}
		throw error;
	}
}

function createProductOwner(
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

			const envelope = await readProductOwnerEnvelope({
				budgetUsd,
				calls,
				configuration,
				prompt,
				runClaude,
				sessionId,
				started,
			});

			sessionId = envelope.session_id;
			calls.record(envelope);
			started = true;

			return readStructuredOutput(envelope, productAnswerSchema).answer;
		},
		snapshot: () => ({
			providerCalls: calls.providerCalls(),
			sessionId,
			spentUsd: calls.spentUsd(),
		}),
	};
}

export { createProductOwner as default };
export type { ProductOwner, ProductOwnerConfiguration, ProductOwnerSnapshot };
