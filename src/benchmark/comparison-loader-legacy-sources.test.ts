import { describe, expect, it } from "bun:test";

import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";
import { parseConfirmationGroupRecord } from "./confirmation-record";

const FIRST_COMPARISON_CASE_INDEX = 0;

const JSON_INDENTATION_SPACES = 2;

describe(loadComparisonEvidence.name, () => {
	const { fixture } = comparisonLoaderTestFixture();

	it("accepts legacy groups that recorded no case at all", async () => {
		await Array.fromAsync(["case-1", "case-2"], async (caseId) => {
			await Array.fromAsync(
				["baseline", "candidate", "control"] as const,
				async (role) => {
					const groupFile = fixture.groupFile(caseId, role);
					const { caseId: _declared, ...legacy } = parseConfirmationGroupRecord(
						await Bun.file(groupFile).text(),
					);
					await Bun.write(
						groupFile,
						`${JSON.stringify(legacy, null, JSON_INDENTATION_SPACES)}\n`,
					);
				},
			);
		});

		const evidence = await loadComparisonEvidence(fixture.manifestFile);

		expect(
			evidence.cases.at(FIRST_COMPARISON_CASE_INDEX)?.arms.candidate
				.declaredCaseId,
		).toBeUndefined();
	});
});
