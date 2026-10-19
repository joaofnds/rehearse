import type { ComparisonArm } from "#benchmark/comparison-record";
import plural from "#client/plural";
import type { ComparisonAttribution } from "#server/comparison-attribution";

import type { ComparisonResponse } from "./comparison-response";
import { armProse, armRole, corpusVersionText } from "./design-arms";
import { qualityReadingText } from "./reading-text";

const INITIAL_CHARACTER_CODE_UNITS = 1;

const INITIAL_CHARACTER_INDEX = 0;

type CaseSummary = ComparisonResponse["summary"][string];

type MeasureContrast = CaseSummary["contrasts"][string][string];

type ReplyLength = CaseSummary["replyLength"];

type ArmCorpusVersion =
	ComparisonResponse["corpusVersions"][string][ComparisonArm];

type BaselineArm = ComparisonResponse["baselineArm"];

type ComparisonMode = ComparisonResponse["report"]["mode"];

const BASELINE = armProse("baseline");

const CANDIDATE = armProse("candidate");

const CONTROL = armProse("control");

function capitalized(text: string): string {
	return `${text.charAt(INITIAL_CHARACTER_INDEX).toUpperCase()}${text.slice(INITIAL_CHARACTER_CODE_UNITS)}`;
}

function combinationsText(
	combinations: MeasureContrast["combinations"],
): string {
	if (combinations.state === "unavailable") {
		return `Attempt combinations not counted: ${combinations.reasons.join("; ")}.`;
	}

	return `Of ${plural(combinations.of, "attempt combination")}, ${String(combinations.higher)} higher, ${String(combinations.equal)} equal, ${String(combinations.lower)} lower.`;
}

interface ContrastTextProps {
	readonly minuend: ComparisonArm;
	readonly subtrahend: ComparisonArm;
}

function contrastText(
	arms: ContrastTextProps,
	measure: string,
	contrast: MeasureContrast,
): string {
	return `${capitalized(armProse(arms.minuend))} against ${armProse(arms.subtrahend)} on ${measure}: ${qualityReadingText(contrast.verdict).phrase}. ${combinationsText(contrast.combinations)}`;
}

function replyLengthText(replyLength: ReplyLength): string {
	const subject = `${capitalized(CANDIDATE)}'s reply length against ${BASELINE}'s`;
	switch (replyLength.verdict.kind) {
		case "unavailable": {
			return `${subject} is unavailable: ${replyLength.verdict.reasons.join("; ")}.`;
		}
		case "insideRerunNoise": {
			return `${subject}: ${replyLength.change ?? "no percent change"}, inside rerun noise.`;
		}
		case "higher": {
			return `${subject}: ${replyLength.change ?? "no percent change"}, ${armProse(replyLength.verdict.arm)} ran longer.`;
		}
		default: {
			return replyLength.verdict satisfies never;
		}
	}
}

function overallMeasures(
	mode: ComparisonMode,
	measures: readonly string[],
): readonly string[] {
	return mode === "pipeline"
		? measures.filter((measure) => measure === "final")
		: measures;
}

function attemptsText(
	attemptsPerArm: Readonly<Record<ComparisonArm, number>>,
): string {
	const { control, baseline, candidate } = attemptsPerArm;
	const counted =
		control === baseline && baseline === candidate
			? `${plural(control, "attempt")} per arm.`
			: `${armRole("control")} ${String(control)}, ${BASELINE} ${String(baseline)} and ${CANDIDATE} ${String(candidate)} attempts.`;

	return `${counted} Rehearse does not compute the smallest shift these attempts could detect, so a reading inside rerun noise does not show the edit changed nothing.`;
}

function versionsText(
	versions: Readonly<Record<ComparisonArm, ArmCorpusVersion>>,
): string {
	return `Each grade came from its arm's corpus: ${armRole("control").toLowerCase()} ${corpusVersionText(versions.control)}, ${BASELINE} ${corpusVersionText(versions.baseline)}, ${CANDIDATE} ${corpusVersionText(versions.candidate)}.`;
}

function baselineArmText(baselineArm: BaselineArm): string {
	switch (baselineArm.kind) {
		case "derived": {
			return `${capitalized(CONTROL)} is ${BASELINE}'s corpus with ${baselineArm.skillUnderTest} removed and everything else kept.`;
		}
		case "armA": {
			return `${capitalized(CONTROL)} is ${BASELINE} run again, since ${BASELINE} holds nothing under ${baselineArm.skillUnderTest}.`;
		}
		case "supplied": {
			return `${capitalized(CONTROL)} is a minimal corpus the comparison's author supplied, so nothing records how it was made.`;
		}
		case "unreadable": {
			return `How ${CONTROL} was made cannot be read: ${baselineArm.reason}.`;
		}
		default: {
			return baselineArm satisfies never;
		}
	}
}

function attributionText(attribution: ComparisonAttribution): string {
	switch (attribution.claim) {
		case "attributable": {
			return `Only ${attribution.differingPath} differs between the recorded corpora. Read the repeated outcomes and uncertainty before attributing a movement.`;
		}
		case "identical": {
			return "Baseline and candidate ran identical corpora, so no file explains a movement between them.";
		}
		case "refused": {
			return `${plural(attribution.differingPaths.length, "file")} differ between baseline and candidate, so no movement between them is attributed to one of them.`;
		}
		default: {
			return attribution satisfies never;
		}
	}
}
export {
	attemptsText,
	attributionText,
	baselineArmText,
	contrastText,
	overallMeasures,
	replyLengthText,
	versionsText,
};
export type { ArmCorpusVersion, BaselineArm, CaseSummary, ComparisonMode };
