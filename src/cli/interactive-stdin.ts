import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { stageCorpusRefusal } from "#benchmark/session-corpus";

function requireInteractiveStdin(
	stdinIsTerminal: boolean,
	reason: string,
): void {
	if (stdinIsTerminal) {
		return;
	}

	throw new RefusedPreconditionError(`stdin is not a terminal: ${reason}`);
}

/**
 * A stage cannot be given a corpus source, so run and replay refuse one before
 * they resolve anything else rather than after a stage has been paid for.
 */
function refuseStageCorpus(corpus: string | undefined): void {
	if (corpus === undefined) {
		return;
	}

	throw new RefusedPreconditionError(stageCorpusRefusal(corpus).message);
}

/**
 * A run whose model nothing but the case declaration named. Before cases
 * declared their knobs, a bare `rehearse run` refused because --model was
 * missing, and that refusal was what stopped a paid session starting from a
 * bare command or from the suite. Declaring the model removed the refusal
 * without removing the hazard, so the authorization moves to the operator:
 * name the model, or be at a terminal. `--yes` is not an alternative here
 * because it belongs to --confirm, which rejects it on its own.
 */
function requireSpendAuthorization(
	args: readonly string[],
	env: Readonly<Record<string, string | undefined>>,
	stdinIsTerminal: boolean,
): void {
	const named =
		args.includes("--model") || (env["BENCHMARK_MODEL"] ?? "") !== "";
	if (named || stdinIsTerminal) {
		return;
	}

	throw new RefusedPreconditionError(
		"stdin is not a terminal: the case declares the model, so nothing you passed authorizes the spend; pass --model to say which model you meant to pay for",
	);
}

export { RefusedPreconditionError } from "#benchmark/exit-codes";
export {
	refuseStageCorpus,
	requireInteractiveStdin,
	requireSpendAuthorization,
};
