import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComparisonBaselineArm } from "#benchmark/comparison-baseline-record";
import type { MoreAttemptsCost } from "#benchmark/more-attempts-cost";
import type { ArmFileDiff } from "#server/comparison-arm-diff";
import type { ComparisonAttribution } from "#server/comparison-attribution";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { AttributionCard } from "./attribution-card";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const DIGEST = "d".repeat(64);
const SKILL = "skills/shape/SKILL.md";

const ATTRIBUTABLE: ComparisonAttribution = {
	claim: "attributable",
	differingPath: SKILL,
	differingPaths: [SKILL],
};

const DERIVED: ComparisonBaselineArm = {
	kind: "derived",
	skillUnderTest: "skills/shape/",
};

const AFFORDABLE: MoreAttemptsCost = {
	state: "available",
	attemptsPerArm: 2,
	usd: 9.28,
};

function stubArmDiff(files: readonly ArmFileDiff[]): void {
	stubFetchByPath(
		new Map([[`/api/comparisons/${DIGEST}/arm-diff`, { "audit-log": files }]]),
	);
}

function renderCard(
	overrides: Readonly<{
		attribution?: ComparisonAttribution;
		baselineArm?: ComparisonBaselineArm;
		moreAttempts?: MoreAttemptsCost;
	}> = {},
): void {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<AttributionCard
				digest={DIGEST}
				caseId="audit-log"
				attribution={overrides.attribution ?? ATTRIBUTABLE}
				baselineArm={overrides.baselineArm ?? DERIVED}
				moreAttempts={overrides.moreAttempts ?? AFFORDABLE}
			/>
		</QueryClientProvider>,
	);
}

function card(): HTMLElement {
	return screen.getByRole("region", { name: "Attribution · audit-log" });
}

describe(AttributionCard.name, () => {
	it("names the one file that differs between arms A and B and attributes a movement to it", () => {
		renderCard();

		expect(card()).toHaveTextContent(
			`The only difference between arms A and B is ${SKILL}. Every other file is identical across the arms, so a movement between them is attributable to that file.`,
		);
	});

	it("refuses the claim and lists the files when more than one differs", () => {
		renderCard({
			attribution: {
				claim: "refused",
				differingPaths: ["CLAUDE.md", SKILL],
			},
		});

		expect(card()).toHaveTextContent(
			"2 files differ between arms A and B, so no movement between them is attributed to one file.",
		);
		expect(
			within(card())
				.getAllByRole("listitem")
				.map((item) => item.textContent),
		).toEqual(["CLAUDE.md", SKILL]);
	});

	it("says no file explains a movement when the arms ran identical corpora, and offers no diff", () => {
		renderCard({ attribution: { claim: "identical" } });

		expect(card()).toHaveTextContent(
			"Arms A and B ran identical corpora, so no file explains a movement between them.",
		);
		expect(
			screen.queryByRole("button", { name: "See the diff between arms" }),
		).not.toBeInTheDocument();
	});

	it("offers more attempts in every arm with the cost on the button", () => {
		renderCard();

		expect(
			within(card()).getByRole("button", {
				name: "Add 2 attempts to each arm · ≈ $9.28",
			}),
		).toBeInTheDocument();
	});

	it("says why a comparison whose author supplied the baseline arm cannot take more attempts", () => {
		renderCard({ baselineArm: { kind: "supplied" } });

		expect(card()).toHaveTextContent(
			"More attempts cannot be added: this comparison was not made by compare attempts",
		);
		expect(
			screen.queryByRole("button", { name: /to each arm/u }),
		).not.toBeInTheDocument();
	});

	describe("see the diff between arms", () => {
		it("shows each differing file's lines at arm A's version against arm B's", async () => {
			stubArmDiff([
				{
					path: SKILL,
					baseline: { state: "available", text: "keep\nold line\n" },
					candidate: { state: "available", text: "keep\nnew line\n" },
				},
			]);
			renderCard();

			fireEvent.click(
				screen.getByRole("button", { name: "See the diff between arms" }),
			);

			const changes = await screen.findByRole("list", {
				name: `Changes to ${SKILL}`,
			});
			expect(
				within(changes)
					.getAllByRole("listitem")
					.map((line) => line.textContent),
			).toEqual(["1  keep", "2− old line", "2+ new line"]);
		});

		it("says which arm ran no such file", async () => {
			stubArmDiff([
				{
					path: "skills/shape/notes.md",
					baseline: { state: "absent" },
					candidate: { state: "available", text: "added\n" },
				},
			]);
			renderCard();

			fireEvent.click(
				screen.getByRole("button", { name: "See the diff between arms" }),
			);

			expect(
				await screen.findByText("Arm A ran no skills/shape/notes.md."),
			).toBeInTheDocument();
		});

		it("says why an arm's text cannot be shown", async () => {
			stubArmDiff([
				{
					path: SKILL,
					baseline: { state: "available", text: "old\n" },
					candidate: {
						state: "unavailable",
						reasons: ["its frozen copy no longer matches"],
					},
				},
			]);
			renderCard();

			fireEvent.click(
				screen.getByRole("button", { name: "See the diff between arms" }),
			);

			expect(
				await screen.findByText(
					`Arm B's ${SKILL} cannot be shown: its frozen copy no longer matches.`,
				),
			).toBeInTheDocument();
			expect(
				screen.queryByRole("list", { name: `Changes to ${SKILL}` }),
			).not.toBeInTheDocument();
		});

		it("says the diff could not be loaded when the request fails", async () => {
			stubFetchByPath(new Map());
			renderCard();

			fireEvent.click(
				screen.getByRole("button", { name: "See the diff between arms" }),
			);

			expect(await screen.findByRole("alert")).toHaveTextContent(
				"The diff between arms could not be loaded.",
			);
		});
	});
});
