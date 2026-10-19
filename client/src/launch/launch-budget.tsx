import type { LaunchAttempts } from "#benchmark/launch-attempts";
import { groupSpendCeilingUsd } from "#benchmark/spend-ceiling";
import { spendReading } from "#client/run-history/run-progress";

import type { SettledTarget } from "./launch-target-contract";
import { enteredCeilingUsd, storedCeilingEntry } from "./spend-ceiling-entry";

const SINGLE_CONFIRMATION_GROUP_COUNT = 1;

const SINGLE_ITEM_COUNT = 1;

const SINGLE_ATTEMPT_COUNT = 1;

/** An edit that differs from the stored ceiling holds the launch until stored. */
function holdsUnstoredCeiling(
	draft: string | undefined,
	storedUsd: number | undefined,
): boolean {
	if (draft === undefined) {
		return false;
	}
	const usd = enteredCeilingUsd(draft);

	return usd === undefined
		? draft !== shownCeiling(undefined, storedUsd)
		: usd !== storedUsd;
}

/** What the field shows: the operator's edit, or the stored ceiling as stored. */
function shownCeiling(
	draft: string | undefined,
	storedUsd: number | undefined,
): string {
	return (
		draft ?? (storedUsd === undefined ? "" : storedCeilingEntry(storedUsd))
	);
}

function attemptsLabel(attempts: number): string {
	return attempts === SINGLE_ITEM_COUNT
		? "1 attempt"
		: `${String(attempts)} attempts`;
}

function launchBudgetReading(
	ceilingUsd: number | undefined,
	pending: boolean,
): string {
	if (pending) {
		return "Reading saved default…";
	}
	return ceilingUsd === undefined
		? "No saved default"
		: `$${storedCeilingEntry(ceilingUsd)} per attempt · saved default`;
}

/**
 * A group's attempts each run under the stored ceiling and all of them
 * together under the group ceiling. A call already in flight when the ceiling
 * is reached still lands, which is why the ceiling can be overrun.
 */
function ceilingReading(ceilingUsd: number, started: StartedGroups): string {
	return `${ceilingHolds(ceilingUsd, started)} · stops mid-step if reached, and can be overrun by the calls in flight`;
}

function ceilingHolds(
	ceilingUsd: number,
	{ groups, attempts }: StartedGroups,
): string {
	if (
		attempts === SINGLE_ITEM_COUNT &&
		groups === SINGLE_CONFIRMATION_GROUP_COUNT
	) {
		return `Ceiling ${spendReading(ceilingUsd)} per attempt`;
	}
	const perGroup = `Ceiling ${spendReading(ceilingUsd)} per attempt, ${spendReading(groupSpendCeilingUsd({ reps: attempts, spendCeilingUsd: ceilingUsd }))}`;

	return groups === SINGLE_CONFIRMATION_GROUP_COUNT
		? `${perGroup} for the group of ${String(attempts)}`
		: `${perGroup} for each of the ${String(groups)} groups of ${String(attempts)}`;
}

/**
 * The groups a launch starts and how many attempts each runs, which each
 * group's ceiling bounds. An extension starts one group per arm.
 */
interface StartedGroups {
	readonly groups: number;
	readonly attempts: number;
}

function startedGroupsOf(
	target: SettledTarget,
	attempts: LaunchAttempts,
): StartedGroups {
	switch (target.kind) {
		case "case":
		case "replay": {
			return { attempts, groups: 1 };
		}
		case "comparison": {
			return { attempts: target.reps, groups: 1 };
		}
		case "extension": {
			return { attempts: target.attempts, groups: 3 };
		}
		default: {
			return target satisfies never;
		}
	}
}

export {
	attemptsLabel,
	ceilingReading,
	holdsUnstoredCeiling,
	launchBudgetReading,
	shownCeiling,
	SINGLE_ATTEMPT_COUNT,
	startedGroupsOf,
};
export type { StartedGroups };
