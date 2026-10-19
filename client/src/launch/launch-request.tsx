import type { LaunchAttempts } from "#benchmark/launch-attempts";
import plural from "#client/plural";
import type { LaunchRequest } from "#server/launches";

import { SINGLE_ATTEMPT_COUNT } from "./launch-budget";
import type { SettledTarget } from "./launch-target-contract";

function launchRequest(
	target: SettledTarget,
	caseId: string | undefined,
	attempts: LaunchAttempts,
): LaunchRequest | undefined {
	switch (target.kind) {
		case "case": {
			return caseId === undefined
				? undefined
				: { attempts, caseId, kind: "case" };
		}
		case "replay": {
			return {
				attempts,
				kind: "replay",
				run: target.run,
				stage: target.stage,
			};
		}
		case "comparison": {
			return { armA: target.armA, armB: target.armB, kind: "comparison" };
		}
		case "extension": {
			return {
				attempts: target.attempts,
				comparison: target.comparison,
				kind: "extension",
				statedUsd: target.usd,
			};
		}
		default: {
			return target satisfies never;
		}
	}
}

function dialogTitle(target: SettledTarget): string {
	switch (target.kind) {
		case "case": {
			return "Start a run";
		}
		case "replay": {
			return `Replay ${target.stage} from checkpoint`;
		}
		case "comparison": {
			return `Compare two attempts at ${target.stage}`;
		}
		case "extension": {
			return `Add ${plural(target.attempts, "attempt")} to each arm`;
		}
		default: {
			return target satisfies never;
		}
	}
}

function dialogDescription(target: SettledTarget): string {
	switch (target.kind) {
		case "case": {
			return "Runs the case against the current corpus under its declared model, and records each attempt separately.";
		}
		case "replay": {
			return `Replaying restores the checkpoint ${target.stage} starts from, runs ${target.stage} against the current corpus under the run's model, and records each attempt separately. Earlier stages are not re-run.`;
		}
		case "comparison": {
			return `Runs a control group of ${plural(target.reps, "attempt")} at ${target.stage}, against baseline's corpus without the one skill the arms differ in, under baseline's model, effort, judge and budget, then compares the control, baseline (before) and candidate (after). Baseline and candidate are not re-run.`;
		}
		case "extension": {
			return `Runs ${plural(target.attempts, "more attempt")} in the control, baseline (before) and candidate (after), each from the checkpoint its arm replayed and against its arm's corpus, then saves a comparison of every attempt each arm holds. The comparison it extends is kept as it was.`;
		}
		default: {
			return target satisfies never;
		}
	}
}

/** The case and attempts the form opens on. */
interface OpeningChoice {
	readonly caseId: string | undefined;
	readonly attempts: LaunchAttempts;
}

function openingChoice(target: SettledTarget): OpeningChoice {
	switch (target.kind) {
		case "case": {
			return {
				attempts: target.attempts ?? SINGLE_ATTEMPT_COUNT,
				caseId: target.caseId,
			};
		}
		case "replay": {
			return {
				attempts: target.attempts ?? SINGLE_ATTEMPT_COUNT,
				caseId: undefined,
			};
		}
		case "comparison":
		case "extension": {
			return { attempts: 1, caseId: undefined };
		}
		default: {
			return target satisfies never;
		}
	}
}

export { dialogDescription, dialogTitle, launchRequest, openingChoice };
