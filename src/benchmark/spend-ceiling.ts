import type { ClaudeCallMetrics } from "./contracts";

export class SpendCeilingReachedError extends Error {
	public readonly ceilingUsd: number;
	public readonly spentUsd: number;

	public constructor(props: {
		readonly ceilingUsd: number;
		readonly spentUsd: number;
	}) {
		super(
			`The spend ceiling of USD ${String(props.ceilingUsd)} is reached, with USD ${props.spentUsd.toFixed(4)} spent`,
		);
		this.name = "SpendCeilingReachedError";
		this.ceilingUsd = props.ceilingUsd;
		this.spentUsd = props.spentUsd;
	}
}

/**
 * The USD a run's whole spend may reach. Each session is started with a
 * budget clamped to what is left, so a run overruns by at most the call in
 * flight. A rep of a confirmation group sits within the group's ceiling and is
 * held to both.
 */
export interface SpendCeiling {
	readonly ceilingUsd: number;
	readonly spentUsd: () => number;
	/** The tokens of the calls charged so far, those reporting their usage. */
	readonly tokens: () => RunTokens;
	readonly budgetFor: (sessionBudgetUsd: number) => number;
	/** A failed call brings no tokens, as its error keeps only its cost. */
	readonly charge: (costUsd: number, metrics?: ClaudeCallMetrics) => void;
	/**
	 * The ceiling the spend has reached, a rep's own or its group's, since a
	 * rep's call may be halted at the budget its group had left.
	 */
	readonly reached: () => CeilingReached | undefined;
}

/**
 * The tokens a run's calls have used. Input counts every token the model
 * read, cache reads and writes included, as a call's total input does.
 */
export interface RunTokens {
	readonly input: number;
	readonly output: number;
}

export interface CeilingReached {
	readonly ceilingUsd: number;
	readonly spentUsd: number;
}

export function createSpendCeiling(props: {
	readonly ceilingUsd: number;
	readonly within?: SpendCeiling | undefined;
}): SpendCeiling {
	const { ceilingUsd, within } = props;
	let spentUsd = 0;
	let tokens: RunTokens = { input: 0, output: 0 };

	return {
		ceilingUsd,
		spentUsd: () => spentUsd,
		tokens: () => tokens,
		budgetFor: (sessionBudgetUsd) => {
			const leftUsd = ceilingUsd - spentUsd;
			if (leftUsd <= 0) {
				throw new SpendCeilingReachedError({ ceilingUsd, spentUsd });
			}

			const budgetUsd = Math.min(sessionBudgetUsd, leftUsd);

			return within === undefined ? budgetUsd : within.budgetFor(budgetUsd);
		},
		charge: (costUsd, metrics) => {
			spentUsd += costUsd;
			if (metrics !== undefined) {
				tokens = {
					input:
						tokens.input +
						metrics.inputTokens +
						metrics.cacheReadTokens +
						metrics.cacheWriteTokens,
					output: tokens.output + metrics.outputTokens,
				};
			}
			within?.charge(costUsd, metrics);
		},
		reached: () =>
			spentUsd >= ceilingUsd ? { ceilingUsd, spentUsd } : within?.reached(),
	};
}

/** A confirmation group's ceiling: the reps times the ceiling each rep holds. */
export function groupSpendCeilingUsd(props: {
	readonly spendCeilingUsd: number;
	readonly reps: number;
}): number {
	return props.spendCeilingUsd * props.reps;
}

/**
 * A confirmation group's reps run at once, each held to the stored ceiling and
 * all of them together to the group ceiling.
 */
export function repSpendCeilings(props: {
	readonly spendCeilingUsd: number;
	readonly reps: number;
}): () => SpendCeiling {
	const group = createSpendCeiling({
		ceilingUsd: groupSpendCeilingUsd(props),
	});

	return () =>
		createSpendCeiling({ ceilingUsd: props.spendCeilingUsd, within: group });
}

/**
 * The clamp bounds what a session may start, not what a call already in
 * flight costs when the ceiling is reached, so every surface that states the
 * ceiling states this beside it.
 */
export const CEILING_OVERRUN_STATEMENT =
	"The ceiling can be overrun by the calls in flight when it is reached: one per running session, so one for a run and one per running attempt for a group.";
