import type { ComparisonArm } from "#benchmark/comparison-record";
import { LaunchDialog } from "#client/launch/launch-dialog";
import plural from "#client/plural";
import { spendReading } from "#client/run-history/run-progress";
import { armPairs, pairKey } from "#server/comparison-arm-pair";
import type { ComparisonAttribution } from "#server/comparison-attribution";

import type {
	ArmCorpusVersion,
	BaselineArm,
	CaseSummary,
	ComparisonMode,
} from "./pairing-reading-text";
import {
	attemptsText,
	attributionText,
	baselineArmText,
	contrastText,
	overallMeasures,
	replyLengthText,
	versionsText,
} from "./pairing-reading-text";

type MoreAttemptsCost = CaseSummary["moreAttempts"];

interface CardProps {
	readonly label: string;
	readonly children: React.ReactNode;
}

function Card({ label, children }: CardProps): React.JSX.Element {
	return (
		<section
			aria-label={label}
			className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3"
		>
			<h3>
				<span className="text-12 text-muted-foreground">{label}</span>
			</h3>
			{children}
		</section>
	);
}

interface WhatThePairingSaysProps {
	readonly mode: ComparisonMode;
	readonly summary: CaseSummary;
}

function WhatThePairingSays({
	mode,
	summary,
}: WhatThePairingSaysProps): React.JSX.Element {
	const lines = armPairs().flatMap((arms) => {
		const byMeasure = summary.contrasts[pairKey(arms)] ?? {};

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

/**
 * Offers as many attempts again as baseline (before) holds, in every arm, on a comparison
 * whose record says how each arm replays, with the cost on the button.
 */
interface MoreAttemptsProps {
	readonly digest: string;
	readonly baselineArm: BaselineArm;
	readonly cost: MoreAttemptsCost;
}

function MoreAttempts({
	digest,
	baselineArm,
	cost,
}: MoreAttemptsProps): React.JSX.Element {
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

interface ExtensionOfferProps {
	readonly digest: string;
	readonly cost: MoreAttemptsCost;
}

function ExtensionOffer({
	digest,
	cost,
}: ExtensionOfferProps): React.JSX.Element {
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
					attempts: cost.attemptsPerArm,
					comparison: digest,
					kind: "extension",
					usd: cost.usd,
				}}
				triggerLabel={`Add ${plural(cost.attemptsPerArm, "attempt")} to each arm · ≈ ${spendReading(cost.usd)}`}
			/>
		</div>
	);
}

interface ReadWithCareProps {
	readonly digest: string;
	readonly attemptsPerArm: Readonly<Record<ComparisonArm, number>>;
	readonly corpusVersions: Readonly<Record<ComparisonArm, ArmCorpusVersion>>;
	readonly baselineArm: BaselineArm;
	readonly attribution: ComparisonAttribution;
	readonly moreAttempts: MoreAttemptsCost;
}

function ReadWithCare({
	digest,
	attemptsPerArm,
	corpusVersions,
	baselineArm,
	attribution,
	moreAttempts,
}: ReadWithCareProps): React.JSX.Element {
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
export { MoreAttempts, ReadWithCare, WhatThePairingSays };
