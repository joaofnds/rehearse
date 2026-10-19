import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";

import type { ComparisonBaselineArm } from "#benchmark/comparison-baseline-record";
import type { ComparisonArm } from "#benchmark/comparison-record";
import type { MoreAttemptsCost } from "#benchmark/more-attempts-cost";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import type { ComparisonAttribution } from "#server/comparison-attribution";
import type { ArmCorpusVersion } from "#server/comparison-provenance";
import type { CaseSummary } from "#server/comparison-summary";

import { ReadWithCare, WhatThePairingSays } from "./pairing-cards";

const FIRST_PAIRING_BULLET_INDEX = 0;

const INSIDE_NOISE: CaseSummary["contrasts"][string][string] = {
	combinations: { equal: 2, higher: 0, lower: 2, of: 4, state: "available" },
	verdict: { kind: "insideRerunNoise" },
};

const SUMMARY: CaseSummary = {
	contrasts: {
		baselineMinusControl: {
			build: {
				combinations: { reasons: ["no graded rep"], state: "unavailable" },
				verdict: { kind: "unchangedAlreadyClear" },
			},
		},
		candidateMinusBaseline: { build: INSIDE_NOISE },
		candidateMinusControl: {
			build: {
				combinations: {
					equal: 0,
					higher: 4,
					lower: 0,
					of: 4,
					state: "available",
				},
				verdict: { arm: "candidate", kind: "separated" },
			},
		},
	},
	moreAttempts: { attemptsPerArm: 2, state: "available", usd: 9.28 },
	replyLength: {
		change: "-17%",
		interval: {
			minuend: { high: 468, low: 396 },
			subtrahend: { high: 537, low: 510 },
		},
		verdict: { kind: "insideRerunNoise" },
	},
};

function renderSays(
	summary: CaseSummary = SUMMARY,
	mode: "stage" | "pipeline" = "stage",
): void {
	render(<WhatThePairingSays mode={mode} summary={summary} />);
}

function card(name: string): HTMLElement {
	return screen.getByRole("region", { name });
}

type CaseVersions = Readonly<Record<ComparisonArm, ArmCorpusVersion>>;

const VERSIONS = {
	baseline: {
		digest: "9f30d1".padEnd(SHA256_HEX_CHARACTERS, "0"),
		state: "available",
	},
	candidate: {
		reasons: ["the group recorded no corpus version"],
		state: "unavailable",
	},
	control: {
		digest: "d6a465".padEnd(SHA256_HEX_CHARACTERS, "0"),
		state: "available",
	},
} satisfies CaseVersions;

const ATTRIBUTABLE: ComparisonAttribution = {
	claim: "attributable",
	differingPath: "skills/shape/SKILL.md",
	differingPaths: ["skills/shape/SKILL.md"],
};

function renderCare(
	overrides: Readonly<{
		attemptsPerArm?: Readonly<Record<ComparisonArm, number>>;
		baselineArm?: ComparisonBaselineArm;
		attribution?: ComparisonAttribution;
		moreAttempts?: MoreAttemptsCost;
	}> = {},
): void {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<ReadWithCare
				digest={"d".repeat(SHA256_HEX_CHARACTERS)}
				attemptsPerArm={
					overrides.attemptsPerArm ?? { baseline: 2, candidate: 2, control: 2 }
				}
				corpusVersions={VERSIONS}
				baselineArm={
					overrides.baselineArm ?? {
						kind: "derived",
						skillUnderTest: "skills/shape/",
					}
				}
				attribution={overrides.attribution ?? ATTRIBUTABLE}
				moreAttempts={overrides.moreAttempts ?? SUMMARY.moreAttempts}
			/>
		</QueryClientProvider>,
	);
}

function bullets(): readonly string[] {
	return within(card("Read with care"))
		.getAllByRole("listitem")
		.map((item) => item.textContent);
}

export {
	ATTRIBUTABLE,
	bullets,
	card,
	FIRST_PAIRING_BULLET_INDEX,
	INSIDE_NOISE,
	renderCare,
	renderSays,
	SUMMARY,
};
