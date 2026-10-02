/**
 * Kept out of the module that writes the case file, since the browser bundle
 * imports this and cannot load `node:fs`.
 */
export const DECLARED_BY_HAND_REASON =
	"A pipeline case needs a target repository and its own task files, so it is declared by hand in its case.json";
