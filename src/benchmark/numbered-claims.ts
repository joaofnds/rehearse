const NUMBER_NAME = /^[1-9]\d*$/u;

/**
 * The numbers claimed in a directory of numbered files, ascending. A file whose
 * name is not a number, a `.DS_Store` Finder leaves or an editor's swap file,
 * claims none, and reading it as one would make every later claim a NaN.
 */
export function claimedNumbers(names: readonly string[]): number[] {
	return names
		.filter((name) => NUMBER_NAME.test(name))
		.map(Number)
		.toSorted((left, right) => left - right);
}
