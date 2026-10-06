import type { ComparisonArm } from "#benchmark/comparison-record";
import { LaunchDialog } from "#client/launch/launch-dialog";
import { plural } from "#client/plural";
import { SectionLabel } from "#client/system/components/section-label";
import { armPairs, pairKey } from "#server/comparison-arm-pair";
import type { ComparisonAttribution } from "#server/comparison-attribution";
import type { ComparisonResponse } from "./comparison-response";
import { armProse, armRole, corpusVersionText } from "./design-arms";

type CaseSummary = ComparisonResponse["summary"][string];
type MeasureContrast = CaseSummary["contrasts"][string][string];
type ReplyLength = CaseSummary["replyLength"];
type MoreAttemptsCost = CaseSummary["moreAttempts"];
type ArmCorpusVersion =
	ComparisonResponse["corpusVersions"][string][ComparisonArm];
type BaselineArm = ComparisonResponse["baselineArm"];
type ComparisonMode = ComparisonResponse["report"]["mode"];

const ARM_A = armProse("baseline");
const ARM_B = armProse("candidate");
const BASELINE_ARM = armProse("control");

function capitalized(text: string): string {
	return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function verdictPhrase(verdict: MeasureContrast["verdict"]): string {
	switch (verdict.kind) {
		case "insideRerunNoise": {
			return "inside rerun noise";
		}
		case "unchangedAlreadyClear": {
			return "unchanged, already clear";
		}
		case "separated": {
			return `${armProse(verdict.arm)} separates`;
		}
		case "unavailable": {
			return "unavailable";
		}
		default: {
			return verdict satisfies never;
		}
	}
}

function combinationsText(
	combinations: MeasureContrast["combinations"],
): string {
	if (combinations.state === "unavailable") {
		return `Attempt combinations not counted: ${combinations.reasons.join("; ")}.`;
	}

	return `Of ${plural(combinations.of, "attempt combination")}, ${String(combinations.higher)} higher, ${String(combinations.equal)} equal, ${String(combinations.lower)} lower.`;
}

function contrastText(
	arms: { readonly minuend: ComparisonArm; readonly subtrahend: ComparisonArm },
	measure: string,
	contrast: MeasureContrast,
): string {
	return `${capitalized(armProse(arms.minuend))} against ${armProse(arms.subtrahend)} on ${measure}: ${verdictPhrase(contrast.verdict)}. ${combinationsText(contrast.combinations)}`;
}

function replyLengthText(replyLength: ReplyLength): string {
	const subject = `${capitalized(ARM_B)}'s reply length against ${ARM_A}'s`;
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

function Card({
	label,
	children,
}: {
	readonly label: string;
	readonly children: React.ReactNode;
}): React.JSX.Element {
	return (
		<section
			aria-label={label}
			className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3"
		>
			<h3>
				<SectionLabel>{label}</SectionLabel>
			</h3>
			{children}
		</section>
	);
}

export function WhatThePairingSays({
	mode,
	summary,
}: {
	readonly mode: ComparisonMode;
	readonly summary: CaseSummary;
}): React.JSX.Element {
	const lines = armPairs().flatMap((arms) => {
		const byMeasure =
			summary.contrasts[pairKey(arms.minuend, arms.subtrahend)] ?? {};

		return overallMeasures(mode, Object.keys(byMeasure)).flatMap((measure) => {
			const contrast = byMeasure[measure];

			return contrast === undefined
				? []
				: [contrastText(arms, measure, contrast)];
		});
	});

	return (
		<Card label="What the pairing says">
			{lines.map((line) => (
				<p key={line}>{line}</p>
			))}
			<p>{replyLengthText(summary.replyLength)}</p>
		</Card>
	);
}

function attemptsText(
	attemptsPerArm: Readonly<Record<ComparisonArm, number>>,
): string {
	const { control, baseline, candidate } = attemptsPerArm;
	const counted =
		control === baseline && baseline === candidate
			? `${plural(control, "attempt")} per arm.`
			: `${armRole("control")} ${String(control)}, ${ARM_A} ${String(baseline)} and ${ARM_B} ${String(candidate)} attempts.`;

	return `${counted} Rehearse does not compute the smallest shift these attempts could detect, so a reading inside rerun noise does not show the edit changed nothing.`;
}

function versionsText(
	versions: Readonly<Record<ComparisonArm, ArmCorpusVersion>>,
): string {
	return `Each grade came from its arm's corpus: ${armRole("control").toLowerCase()} ${corpusVersionText(versions.control)}, ${ARM_A} ${corpusVersionText(versions.baseline)}, ${ARM_B} ${corpusVersionText(versions.candidate)}.`;
}

function baselineArmText(baselineArm: BaselineArm): string {
	switch (baselineArm.kind) {
		case "derived": {
			return `${capitalized(BASELINE_ARM)} is ${ARM_A}'s corpus with ${baselineArm.skillUnderTest} removed and everything else kept.`;
		}
		case "armA": {
			return `${capitalized(BASELINE_ARM)} is ${ARM_A} run again, since ${ARM_A} holds nothing under ${baselineArm.skillUnderTest}.`;
		}
		case "supplied": {
			return `${capitalized(BASELINE_ARM)} is a minimal corpus the comparison's author supplied, so nothing records how it was made.`;
		}
		case "unreadable": {
			return `How ${BASELINE_ARM} was made cannot be read: ${baselineArm.reason}.`;
		}
		default: {
			return baselineArm satisfies never;
		}
	}
}

function attributionText(attribution: ComparisonAttribution): string {
	switch (attribution.claim) {
		case "attributable": {
			return `Only ${attribution.differingPath} differs between arms A and B, so a movement between them is attributable to it.`;
		}
		case "identical": {
			return "Arms A and B ran identical corpora, so no file explains a movement between them.";
		}
		case "refused": {
			return `${plural(attribution.differingPaths.length, "file")} differ between arms A and B, so no movement between them is attributed to one of them.`;
		}
		default: {
			return attribution satisfies never;
		}
	}
}

/**
 * Offers as many attempts again as arm A holds, in every arm, on a comparison
 * whose record says how each arm replays, with the cost on the button.
 */
function MoreAttempts({
	digest,
	baselineArm,
	cost,
}: {
	readonly digest: string;
	readonly baselineArm: BaselineArm;
	readonly cost: MoreAttemptsCost;
}): React.JSX.Element {
	switch (baselineArm.kind) {
		case "supplied": {
			return (
				<p>
					More attempts cannot be added: this comparison was not made by compare
					attempts, so nothing records the checkpoint and corpora its arms would
					replay.
				</p>
			);
		}
		case "unreadable": {
			return <p>{`More attempts cannot be added: ${baselineArm.reason}.`}</p>;
		}
		case "derived":
		case "armA": {
			return <ExtensionOffer digest={digest} cost={cost} />;
		}
		default: {
			return baselineArm satisfies never;
		}
	}
}

function ExtensionOffer({
	digest,
	cost,
}: {
	readonly digest: string;
	readonly cost: MoreAttemptsCost;
}): React.JSX.Element {
	if (cost.state === "unavailable") {
		return (
			<p>
				{`What more attempts would cost cannot be stated: ${cost.reasons.join("; ")}.`}
			</p>
		);
	}

	return (
		<div>
			<LaunchDialog
				target={{
					kind: "extension",
					comparison: digest,
					attempts: cost.attemptsPerArm,
					usd: cost.usd,
				}}
				triggerLabel={`Add ${plural(cost.attemptsPerArm, "attempt")} to each arm · ≈ $${cost.usd.toFixed(2)}`}
			/>
		</div>
	);
}

export function ReadWithCare({
	digest,
	attemptsPerArm,
	corpusVersions,
	baselineArm,
	attribution,
	moreAttempts,
}: {
	readonly digest: string;
	readonly attemptsPerArm: Readonly<Record<ComparisonArm, number>>;
	readonly corpusVersions: Readonly<Record<ComparisonArm, ArmCorpusVersion>>;
	readonly baselineArm: BaselineArm;
	readonly attribution: ComparisonAttribution;
	readonly moreAttempts: MoreAttemptsCost;
}): React.JSX.Element {
	return (
		<Card label="Read with care">
			<ul className="flex list-disc flex-col gap-1 pl-5">
				<li>{attemptsText(attemptsPerArm)}</li>
				<li>{versionsText(corpusVersions)}</li>
				<li>{baselineArmText(baselineArm)}</li>
				<li>{attributionText(attribution)}</li>
			</ul>
			<MoreAttempts
				digest={digest}
				baselineArm={baselineArm}
				cost={moreAttempts}
			/>
		</Card>
	);
}
