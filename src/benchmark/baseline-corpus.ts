/** Corpus layout path to the sha256 of its bytes. */
type CorpusFiles = ReadonlyMap<string, string>;

/**
 * The corpus a comparison's baseline arm runs, derived from arm A so an
 * operator who only clicks never writes a control corpus (doc-180 decision
 * 2). `derived` removes the skill under test from arm A; `armA` runs arm A
 * as it is, because the skill under test is new in arm B.
 */
export type BaselineCorpus =
	| {
			readonly kind: "derived" | "armA";
			readonly skillUnderTest: string;
			readonly files: CorpusFiles;
	  }
	| {
			readonly kind: "refused";
			readonly reason: string;
			readonly differingUnits: readonly string[];
	  };

const SKILL_UNIT = /^skills\/[^/]+\//u;

/**
 * The corpus unit a layout path belongs to: a skill is its whole directory,
 * as the corpus layout makes it one, and every other layout path is a unit of
 * its own.
 */
function unitOf(path: string): string {
	return SKILL_UNIT.exec(path)?.[0] ?? path;
}

/**
 * Whether a browser comparison of an edit to this path needs its control
 * supplied through a comparison manifest, since only a skill's directory is a
 * unit the browser can pair arms on.
 */
export function needsComparisonManifest(path: string): boolean {
	return !SKILL_UNIT.test(path);
}

function differingUnits(armA: CorpusFiles, armB: CorpusFiles): string[] {
	const paths = new Set([...armA.keys(), ...armB.keys()]);
	const units = new Set(
		[...paths]
			.filter((path) => armA.get(path) !== armB.get(path))
			.map((path) => unitOf(path)),
	);

	return [...units].toSorted();
}

export function deriveBaselineCorpus(
	armA: CorpusFiles,
	armB: CorpusFiles,
): BaselineCorpus {
	const units = differingUnits(armA, armB);
	const [unit] = units;
	if (unit === undefined) {
		return {
			kind: "refused",
			reason: "arms A and B hold identical corpora, so nothing is under test",
			differingUnits: [],
		};
	}
	if (units.length > 1) {
		return {
			kind: "refused",
			reason: "arms A and B differ in more than one corpus unit",
			differingUnits: units,
		};
	}
	if (!SKILL_UNIT.test(unit)) {
		return {
			kind: "refused",
			reason: `the arms differ in ${unit}, which is not a skill; supply the control through a comparison manifest`,
			differingUnits: units,
		};
	}

	const withoutSkill = new Map(
		[...armA].filter(([path]) => unitOf(path) !== unit),
	);

	return {
		kind: withoutSkill.size === armA.size ? "armA" : "derived",
		skillUnderTest: unit,
		files: withoutSkill,
	};
}
