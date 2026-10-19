import { afterEach, describe, expect, it } from "bun:test";

import {
	RUN,
	clearEvidenceRoots,
	recordedRuns,
} from "#server/evidence-source-records-test-fixture";

import type { EvidenceRequest } from "./evidence-source";
import { EvidenceSourceError, readEvidenceSource } from "./evidence-source";

afterEach(clearEvidenceRoots);

describe(readEvidenceSource.name, () => {
	describe("when an evidence identity has no matching source", () => {
		it.each<[string, Partial<EvidenceRequest>]>([
			["an item the grade lacks", { item: "missing" }],
			["an evidence index past the item's evidence", { index: "3" }],
			["an index that is not a number", { index: "first" }],
			["a section a stage grade does not have", { section: "summary" }],
			[
				"a stage the run did not record",
				{ judge: { kind: "stage", stage: "ship" } },
			],
			["a stage named ..", { judge: { kind: "stage", stage: ".." } }],
			[
				"a stage holding a slash",
				{ judge: { kind: "stage", stage: "build/x" } },
			],
		])("finds nothing for %s", async (_label, change) => {
			const request: EvidenceRequest = {
				index: "0",
				item: "scope",
				judge: { kind: "stage", stage: "build" },
				run: RUN,
				runsDirectory: await recordedRuns(),
				section: "requirements",
				...change,
			};

			expect(readEvidenceSource(request)).rejects.toMatchObject({
				kind: "not-found",
				name: EvidenceSourceError.name,
			});
		});

		it(
			"refuses a run id with a traversing segment",
			verifyRefusesARunIdWithATraversingSegment,
		);
	});
});

async function verifyRefusesARunIdWithATraversingSegment(): Promise<void> {
	expect(
		readEvidenceSource({
			index: "0",
			item: "tests",
			judge: { kind: "final" },
			run: "../outside",
			runsDirectory: await recordedRuns(),
			section: "requirements",
		}),
	).rejects.toMatchObject({
		kind: "refused",
		name: EvidenceSourceError.name,
	});
}
