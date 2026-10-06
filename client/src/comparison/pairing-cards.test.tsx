import { describe, expect, it } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComparisonBaselineArm } from "#benchmark/comparison-baseline-record";
import type { ComparisonArm } from "#benchmark/comparison-record";
import type { MoreAttemptsCost } from "#benchmark/more-attempts-cost";
import type { ComparisonAttribution } from "#server/comparison-attribution";
import type { ArmCorpusVersion } from "#server/comparison-provenance";
import type { CaseSummary } from "#server/comparison-summary";
import { ReadWithCare, WhatThePairingSays } from "./pairing-cards";

const SUMMARY: CaseSummary = {
	contrasts: {
		candidateMinusBaseline: {
			build: {
				verdict: { kind: "insideRerunNoise" },
				combinations: {
					state: "available",
					higher: 0,
					equal: 2,
					lower: 2,
					of: 4,
				},
			},
		},
		candidateMinusControl: {
			build: {
				verdict: { kind: "separated", arm: "candidate" },
				combinations: {
					state: "available",
					higher: 4,
					equal: 0,
					lower: 0,
					of: 4,
				},
			},
		},
		baselineMinusControl: {
			build: {
				verdict: { kind: "unchangedAlreadyClear" },
				combinations: { state: "unavailable", reasons: ["no graded rep"] },
			},
		},
	},
	replyLength: {
		interval: {
			minuend: { low: 396, high: 468 },
			subtrahend: { low: 510, high: 537 },
		},
		change: "-17%",
		verdict: { kind: "insideRerunNoise" },
	},
	moreAttempts: { state: "available", attemptsPerArm: 2, usd: 9.28 },
};

function card(name: string): HTMLElement {
	return screen.getByRole("region", { name });
}

describe(WhatThePairingSays.name, () => {
	function renderSays(
		summary: CaseSummary = SUMMARY,
		mode: "stage" | "pipeline" = "stage",
	): void {
		render(<WhatThePairingSays mode={mode} summary={summary} />);
	}

	it("reads arm B against arm A on the overall measure, with its attempt combinations", () => {
		renderSays();

		expect(card("What the pairing says")).toHaveTextContent(
			"Arm B against arm A on build: inside rerun noise. Of 4 attempt combinations, 0 higher, 2 equal, 2 lower.",
		);
	});

	it("reads each of arms A and B against the baseline arm", () => {
		renderSays();

		expect(card("What the pairing says")).toHaveTextContent(
			"Arm B against the baseline arm on build: arm B separates. Of 4 attempt combinations, 4 higher, 0 equal, 0 lower.",
		);
		expect(card("What the pairing says")).toHaveTextContent(
			"Arm A against the baseline arm on build: unchanged, already clear. Attempt combinations not counted: no graded rep.",
		);
	});

	it("reads a pipeline comparison on its final verdict alone", () => {
		const reading = SUMMARY.contrasts["candidateMinusBaseline"]?.["build"];
		if (reading === undefined) {
			throw new Error("fixture lacks the build reading");
		}
		renderSays(
			{
				...SUMMARY,
				contrasts: {
					candidateMinusBaseline: { review: reading, final: reading },
				},
			},
			"pipeline",
		);

		expect(card("What the pairing says")).toHaveTextContent(
			"Arm B against arm A on final",
		);
		expect(card("What the pairing says")).not.toHaveTextContent("on review");
	});

	it("states arm B's reply length change against arm A's with its reading", () => {
		renderSays();

		expect(card("What the pairing says")).toHaveTextContent(
			"Arm B's reply length against arm A's: -17%, inside rerun noise.",
		);
	});

	it("names the arm whose replies ran longer when the lengths separate", () => {
		renderSays({
			...SUMMARY,
			replyLength: {
				...SUMMARY.replyLength,
				change: "+34%",
				verdict: { kind: "higher", arm: "candidate" },
			},
		});

		expect(card("What the pairing says")).toHaveTextContent(
			"Arm B's reply length against arm A's: +34%, arm B ran longer.",
		);
	});

	it("says why the reply length reading is unavailable", () => {
		renderSays({
			...SUMMARY,
			replyLength: {
				interval: { minuend: undefined, subtrahend: undefined },
				change: undefined,
				verdict: { kind: "unavailable", reasons: ["no word count"] },
			},
		});

		expect(card("What the pairing says")).toHaveTextContent(
			"Arm B's reply length against arm A's is unavailable: no word count.",
		);
	});
});

type CaseVersions = Readonly<Record<ComparisonArm, ArmCorpusVersion>>;

const VERSIONS = {
	control: { state: "available", digest: "d6a465".padEnd(64, "0") },
	baseline: { state: "available", digest: "9f30d1".padEnd(64, "0") },
	candidate: {
		state: "unavailable",
		reasons: ["the group recorded no corpus version"],
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
				digest={"d".repeat(64)}
				attemptsPerArm={
					overrides.attemptsPerArm ?? { control: 2, baseline: 2, candidate: 2 }
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

describe(ReadWithCare.name, () => {
	it("states the attempts per arm and claims no size of shift they could detect", () => {
		renderCare();

		expect(bullets()).toContain(
			"2 attempts per arm. Rehearse does not compute the smallest shift these attempts could detect, so a reading inside rerun noise does not show the edit changed nothing.",
		);
	});

	it("states each arm's attempts when the arms hold different numbers", () => {
		renderCare({ attemptsPerArm: { control: 2, baseline: 3, candidate: 4 } });

		expect(bullets()[0]).toStartWith(
			"Baseline 2, arm A 3 and arm B 4 attempts.",
		);
	});

	it("names the corpus version each arm's grades came from, or why none is recorded", () => {
		renderCare();

		expect(bullets()).toContain(
			"Each grade came from its arm's corpus: baseline corpus@d6a465, arm A corpus@9f30d1, arm B the group recorded no corpus version.",
		);
	});

	it.each([
		[
			{ kind: "derived", skillUnderTest: "skills/shape/" },
			"The baseline arm is arm A's corpus with skills/shape/ removed and everything else kept.",
		],
		[
			{ kind: "armA", skillUnderTest: "skills/shape/" },
			"The baseline arm is arm A run again, since arm A holds nothing under skills/shape/.",
		],
		[
			{ kind: "supplied" },
			"The baseline arm is a minimal corpus the comparison's author supplied, so nothing records how it was made.",
		],
		[
			{ kind: "unreadable", reason: "baseline.json does not parse" },
			"How the baseline arm was made cannot be read: baseline.json does not parse.",
		],
	] satisfies readonly (readonly [ComparisonBaselineArm, string])[])(
		"says how the %o baseline arm was made",
		(baselineArm, expected) => {
			renderCare({ baselineArm });

			expect(bullets()).toContain(expected);
		},
	);

	it.each([
		[
			ATTRIBUTABLE,
			"Only skills/shape/SKILL.md differs between arms A and B, so a movement between them is attributable to it.",
		],
		[
			{ claim: "identical" },
			"Arms A and B ran identical corpora, so no file explains a movement between them.",
		],
		[
			{ claim: "refused", differingPaths: ["CLAUDE.md", "skills/a.md"] },
			"2 files differ between arms A and B, so no movement between them is attributed to one of them.",
		],
	] satisfies readonly (readonly [ComparisonAttribution, string])[])(
		"states the A to B attribution claim %o",
		(attribution, expected) => {
			renderCare({ attribution });

			expect(bullets()).toContain(expected);
		},
	);

	it("offers more attempts in every arm with the cost on the button", () => {
		renderCare();

		expect(
			within(card("Read with care")).getByRole("button", {
				name: "Add 2 attempts to each arm · ≈ $9.28",
			}),
		).toBeInTheDocument();
	});

	it.each([
		[
			{ kind: "supplied" },
			SUMMARY.moreAttempts,
			"More attempts cannot be added: this comparison was not made by compare attempts, so nothing records the checkpoint and corpora its arms would replay.",
		],
		[
			{ kind: "unreadable", reason: "baseline.json does not parse" },
			SUMMARY.moreAttempts,
			"More attempts cannot be added: baseline.json does not parse.",
		],
		[
			{ kind: "derived", skillUnderTest: "skills/shape/" },
			{ state: "unavailable", reasons: ["rep-1 lacks worker.costUsd"] },
			"What more attempts would cost cannot be stated: rep-1 lacks worker.costUsd.",
		],
	] satisfies readonly (readonly [
		ComparisonBaselineArm,
		MoreAttemptsCost,
		string,
	])[])(
		"states why a %o comparison cannot offer more attempts",
		(baselineArm, moreAttempts, expected) => {
			renderCare({ baselineArm, moreAttempts });

			expect(card("Read with care")).toHaveTextContent(expected);
			expect(screen.queryByRole("button")).not.toBeInTheDocument();
		},
	);
});
