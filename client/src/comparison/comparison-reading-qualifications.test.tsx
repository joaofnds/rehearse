import { describe, expect, it } from "bun:test";

import { screen, within } from "@testing-library/react";

import type { ComparisonBaselineArm } from "#benchmark/comparison-baseline-record";
import type { MoreAttemptsCost } from "#benchmark/more-attempts-cost";
import type { ComparisonAttribution } from "#server/comparison-attribution";

import {
	ATTRIBUTABLE,
	FIRST_PAIRING_BULLET_INDEX,
	SUMMARY,
	bullets,
	card,
	renderCare,
} from "./pairing-card-test-fixtures";
import { ReadWithCare } from "./pairing-cards";

interface BaselineOriginCase {
	readonly kind: string;
	readonly baselineArm: ComparisonBaselineArm;
	readonly expected: string;
}
const BASELINE_ORIGINS: readonly BaselineOriginCase[] = [
	{
		baselineArm: { kind: "derived", skillUnderTest: "skills/shape/" },
		expected:
			"The control arm is baseline (before)'s corpus with skills/shape/ removed and everything else kept.",
		kind: "derived",
	},
	{
		baselineArm: { kind: "armA", skillUnderTest: "skills/shape/" },
		expected:
			"The control arm is baseline (before) run again, since baseline (before) holds nothing under skills/shape/.",
		kind: "armA",
	},
	{
		baselineArm: { kind: "supplied" },
		expected:
			"The control arm is a minimal corpus the comparison's author supplied, so nothing records how it was made.",
		kind: "supplied",
	},
	{
		baselineArm: { kind: "unreadable", reason: "baseline.json does not parse" },
		expected:
			"How the control arm was made cannot be read: baseline.json does not parse.",
		kind: "unreadable",
	},
];
interface AttributionClaimCase {
	readonly claim: string;
	readonly attribution: ComparisonAttribution;
	readonly expected: string;
}
const ATTRIBUTION_CLAIMS: readonly AttributionClaimCase[] = [
	{
		attribution: ATTRIBUTABLE,
		claim: "attributable",
		expected:
			"Only skills/shape/SKILL.md differs between the recorded corpora. Read the repeated outcomes and uncertainty before attributing a movement.",
	},
	{
		attribution: { claim: "identical" },
		claim: "identical",
		expected:
			"Baseline and candidate ran identical corpora, so no file explains a movement between them.",
	},
	{
		attribution: {
			claim: "refused",
			differingPaths: ["CLAUDE.md", "skills/a.md"],
		},
		claim: "refused",
		expected:
			"2 files differ between baseline and candidate, so no movement between them is attributed to one of them.",
	},
];
interface ExtensionRefusalCase {
	readonly situation: string;
	readonly baselineArm: ComparisonBaselineArm;
	readonly moreAttempts: MoreAttemptsCost;
	readonly expected: string;
}
const EXTENSION_REFUSALS: readonly ExtensionRefusalCase[] = [
	{
		baselineArm: { kind: "supplied" },
		expected:
			"More attempts cannot be added: this comparison was not made by compare attempts, so nothing records the checkpoint and corpora its arms would replay.",
		moreAttempts: SUMMARY.moreAttempts,
		situation: "supplied baseline arm",
	},
	{
		baselineArm: { kind: "unreadable", reason: "baseline.json does not parse" },
		expected: "More attempts cannot be added: baseline.json does not parse.",
		moreAttempts: SUMMARY.moreAttempts,
		situation: "unreadable baseline arm",
	},
	{
		baselineArm: { kind: "derived", skillUnderTest: "skills/shape/" },
		expected:
			"What more attempts would cost cannot be stated: rep-1 lacks worker.costUsd.",
		moreAttempts: {
			reasons: ["rep-1 lacks worker.costUsd"],
			state: "unavailable",
		},
		situation: "cost unstated",
	},
];

describe(ReadWithCare.name, () => {
	it(
		"states the attempts per arm and claims no size of shift they could detect",
		statesTheAttemptsPerArmAndClaimsNoSizeOfShiftTheyCouldDetect,
	);

	it(
		"states each arm's attempts when the arms hold different numbers",
		statesEachArmSAttemptsWhenTheArmsHoldDifferentNumbers,
	);

	it(
		"names the corpus version each arm's grades came from, or why none is recorded",
		namesTheCorpusVersionEachArmSGradesCameFromOrWhyNoneIsRecorded,
	);

	it.each([...BASELINE_ORIGINS])(
		"says how the $kind baseline arm was made",
		readsBaselineOrigin,
	);

	it.each([...ATTRIBUTION_CLAIMS])(
		"states the A to B attribution claim $claim",
		readsAttributionClaim,
	);

	it(
		"offers more attempts in every arm with the cost on the button",
		offersMoreAttemptsInEveryArmWithTheCostOnTheButton,
	);

	it.each([...EXTENSION_REFUSALS])(
		"states why a comparison with a $situation cannot offer more attempts",
		refusesUnavailableExtension,
	);
});

function statesTheAttemptsPerArmAndClaimsNoSizeOfShiftTheyCouldDetect(): void {
	renderCare();

	expect(bullets()).toContain(
		"2 attempts per arm. Rehearse does not compute the smallest shift these attempts could detect, so a reading inside rerun noise does not show the edit changed nothing.",
	);
}

function statesEachArmSAttemptsWhenTheArmsHoldDifferentNumbers(): void {
	renderCare({ attemptsPerArm: { baseline: 3, candidate: 4, control: 2 } });

	expect(bullets()[FIRST_PAIRING_BULLET_INDEX]).toStartWith(
		"Control 2, baseline (before) 3 and candidate (after) 4 attempts.",
	);
}

function namesTheCorpusVersionEachArmSGradesCameFromOrWhyNoneIsRecorded(): void {
	renderCare();

	expect(bullets()).toContain(
		"Each grade came from its arm's corpus: control corpus@d6a465, baseline (before) corpus@9f30d1, candidate (after) the group recorded no corpus version.",
	);
}

function offersMoreAttemptsInEveryArmWithTheCostOnTheButton(): void {
	renderCare();

	expect(
		within(card("Read with care")).getByRole("button", {
			name: "Add 2 attempts to each arm · ≈ $9.28",
		}),
	).toBeInTheDocument();
}

function readsBaselineOrigin({
	baselineArm,
	expected,
}: BaselineOriginCase): void {
	renderCare({ baselineArm });

	expect(bullets()).toContain(expected);
}
function readsAttributionClaim({
	attribution,
	expected,
}: AttributionClaimCase): void {
	renderCare({ attribution });

	expect(bullets()).toContain(expected);
}
function refusesUnavailableExtension({
	baselineArm,
	moreAttempts,
	expected,
}: ExtensionRefusalCase): void {
	renderCare({ baselineArm, moreAttempts });

	expect(card("Read with care")).toHaveTextContent(expected);
	expect(screen.queryByRole("button")).not.toBeInTheDocument();
}
