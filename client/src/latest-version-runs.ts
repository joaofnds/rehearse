import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { plural } from "#client/plural";

/** What a card reads for a case or task no run has recorded. */
export const NO_RUNS = "No runs yet";

/**
 * How many runs a figure counts, taken at the latest corpus version any of
 * them ran under, and the version itself.
 */
export function runsCounted(
	counted: number,
	corpusVersion: string | null,
): string {
	if (corpusVersion === null) {
		return `${plural(counted, "run")}, corpus version not recorded`;
	}

	return `${plural(counted, "run")} at ${corpusVersionLabel(corpusVersion)}`;
}

/** The runs a figure leaves out because another version or none was recorded. */
export function runsLeftOut(leftOut: number): string {
	return `${plural(leftOut, "run")} left out, at another corpus version or none recorded`;
}
