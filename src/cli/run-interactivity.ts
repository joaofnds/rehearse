import type { BenchmarkConfig, ConfirmationConfig } from "#benchmark/config";
import { requireInteractiveStdin } from "#cli/interactive-stdin";

const REVIEW_PAUSE_REASON =
	"--pause stops with the candidate in the target and waits for a reviewer, so it needs one; drop it and the run records its evidence, retains the candidate, and restores";

const COST_APPROVAL_REASON =
	"a confirmation group asks for its projected cost to be approved, so it needs one or --yes";

/**
 * Two questions a run may ask, each refused before any paid work when nothing
 * can answer it: the review pause, requested by `--pause`, and the projected
 * cost of a confirmation group that `--yes` has not already approved.
 */
function refuseWithoutTerminal(
	config: Readonly<BenchmarkConfig>,
	stdinIsTerminal: boolean,
): void {
	if (config.pause) {
		requireInteractiveStdin(stdinIsTerminal, REVIEW_PAUSE_REASON);
	}
	requireConfirmationTerminal(config.confirmation, stdinIsTerminal);
}

function requireConfirmationTerminal(
	confirmation: Readonly<ConfirmationConfig> | undefined,
	stdinIsTerminal: boolean,
): void {
	if (confirmation?.approval === "interactive") {
		requireInteractiveStdin(stdinIsTerminal, COST_APPROVAL_REASON);
	}
}

export { refuseWithoutTerminal, requireConfirmationTerminal };
