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
	readonly budgetFor: (sessionBudgetUsd: number) => number;
	readonly charge: (costUsd: number) => void;
}

export function createSpendCeiling(props: {
	readonly ceilingUsd: number;
	readonly within?: SpendCeiling | undefined;
}): SpendCeiling {
	const { ceilingUsd, within } = props;
	let spentUsd = 0;

	return {
		ceilingUsd,
		spentUsd: () => spentUsd,
		budgetFor: (sessionBudgetUsd) => {
			const leftUsd = ceilingUsd - spentUsd;
			if (leftUsd <= 0) {
				throw new SpendCeilingReachedError({ ceilingUsd, spentUsd });
			}

			const budgetUsd = Math.min(sessionBudgetUsd, leftUsd);

			return within === undefined ? budgetUsd : within.budgetFor(budgetUsd);
		},
		charge: (costUsd) => {
			spentUsd += costUsd;
			within?.charge(costUsd);
		},
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
