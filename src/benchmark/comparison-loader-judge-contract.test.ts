import { describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";

import {
	SHA256_HEX_CHARACTERS,
	comparisonBuildScorecard,
} from "./comparison-evidence-record-test-fixtures";
import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";
import usePipelineCheckpoints from "./comparison-pipeline-evidence-test-fixtures";
import type { ParsedConfirmationRepRecord } from "./confirmation-record";
import { parseConfirmationRepRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";

const FIRST_REP_ORDINAL = 1;
const TWO_CASES = 2;
const FIRST_INDEX = 0;
const CONTRACT_B = "b".repeat(SHA256_HEX_CHARACTERS);

describe("comparison loaded Judge identity", () => {
	const { fixture } = comparisonLoaderTestFixture();

	it("accepts matching identities from group, rep and scorecard", async () => {
		const evidence = await loadComparisonEvidence(fixture.manifestFile);

		expect(evidence.cases).toHaveLength(TWO_CASES);
		expect(
			evidence.cases[FIRST_INDEX]?.arms.baseline.reps[FIRST_INDEX]
				?.scorecards?.[FIRST_INDEX]?.record.judgeContractSha256,
		).toBe("a".repeat(SHA256_HEX_CHARACTERS));
	});

	it("refuses a historical group without attributing the current identity", async () => {
		await fixture.changeGroup("case-1-baseline", (group) => {
			const { judgeContractSha256: _unknown, ...inputs } = group.inputs;
			return { ...group, inputs };
		});

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"judgeContractSha256",
		);
	});

	it.each([undefined, CONTRACT_B])(
		"refuses a scorecard identity missing or different from its group (%s)",
		async (judgeContractSha256) => {
			await fixture.writeScorecard(
				{ caseId: "case-1", ordinal: FIRST_REP_ORDINAL, role: "candidate" },
				{
					...comparisonBuildScorecard("candidate", FIRST_REP_ORDINAL),
					judgeContractSha256,
				},
			);

			expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
				"case case-1 arm candidate field judgeContractSha256 is missing or inconsistent",
			);
		},
	);
});

describe("comparison rep Judge identity", () => {
	const { fixture } = comparisonLoaderTestFixture();
	it.each([undefined, CONTRACT_B])(
		"refuses a rep identity missing or different from its group (%s)",
		async (judgeContractSha256) => {
			const file = fixture.repFile("case-1", "candidate", FIRST_REP_ORDINAL);
			const record = parseConfirmationRepRecord(await Bun.file(file).text());
			await Bun.write(
				file,
				JSON.stringify({
					...record,
					stages: record.stages.map((stage) =>
						changedStage(stage, judgeContractSha256),
					),
				}),
			);

			expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
				"judgeContractSha256 is missing or inconsistent",
			);
		},
	);

	it("refuses unknown identities even when every group is historical", async () => {
		await Array.fromAsync(fixture.caseIds, async (caseId) => {
			await Array.fromAsync(
				["baseline", "candidate", "control"] as const,
				async (role) => {
					await fixture.changeGroup(`${caseId}-${role}`, (group) => {
						const { judgeContractSha256: _unknown, ...inputs } = group.inputs;
						return { ...group, inputs };
					});
				},
			);
		});

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"judgeContractSha256",
		);
	});
});

describe("comparison additional group Judge identity", () => {
	const { fixture } = comparisonLoaderTestFixture();
	it("refuses an additional group's missing Judge identity", async () => {
		const groupId = await fixture.addGroup("case-1", "candidate");
		await fixture.changeGroup(groupId, (group) => {
			const { judgeContractSha256: _unknown, ...inputs } = group.inputs;
			return { ...group, inputs };
		});

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"judgeContractSha256",
		);
	});
});

describe("comparison final Judge identity", () => {
	const { fixture } = comparisonLoaderTestFixture();
	it("refuses pipeline groups with differing final Judge instructions", async () => {
		await usePipelineCheckpoints(fixture);
		await fixture.changeGroup("case-1-candidate", (group) => ({
			...group,
			inputs: { ...group.inputs, finalJudgeContractSha256: CONTRACT_B },
		}));

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"finalJudgeContractSha256",
		);
	});

	it.each([undefined, CONTRACT_B])(
		"refuses pipeline final outcomes with unknown or inconsistent identity (%s)",
		async (judgeContractSha256) => {
			await usePipelineCheckpoints(fixture);
			const file = fixture.repFile("case-1", "candidate", FIRST_REP_ORDINAL);
			const record = parseConfirmationRepRecord(await Bun.file(file).text());
			await Bun.write(
				file,
				JSON.stringify({
					...record,
					finalOutcome: { ...record.finalOutcome, judgeContractSha256 },
				}),
			);

			expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
				"finalJudgeContractSha256",
			);
		},
	);
});

describe("comparison final Judge evidence identity", () => {
	const { fixture } = comparisonLoaderTestFixture();

	it.each([undefined, CONTRACT_B])(
		"refuses a final evidence identity missing or different from its group (%s)",
		async (judgeContractSha256) => {
			await usePipelineCheckpoints(fixture);
			const file = join(
				dirname(fixture.repFile("case-1", "candidate", FIRST_REP_ORDINAL)),
				"final.json",
			);
			await Bun.write(file, JSON.stringify({ judgeContractSha256 }));

			expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
				"finalJudgeContractSha256",
			);
		},
	);
});

describe("comparison failed Judge identity", () => {
	const { fixture } = comparisonLoaderTestFixture();

	it("refuses an explicitly conflicting failed stage contract", async () => {
		const file = fixture.repFile("case-1", "candidate", FIRST_REP_ORDINAL);
		const record = parseConfirmationRepRecord(await Bun.file(file).text());
		await Bun.write(
			file,
			JSON.stringify({
				...record,
				outcome: "UNSUCCESSFUL",
				stages: record.stages.map(({ stage }) => ({
					error: "Judge failed",
					judgeContractSha256: CONTRACT_B,
					stage,
					status: "EXECUTION_FAILED",
				})),
			}),
		);

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"judgeContractSha256 is inconsistent",
		);
	});

	it("refuses an explicitly conflicting failed final contract", async () => {
		await usePipelineCheckpoints(fixture);
		const file = fixture.repFile("case-1", "candidate", FIRST_REP_ORDINAL);
		const record = parseConfirmationRepRecord(await Bun.file(file).text());
		await Bun.write(
			file,
			JSON.stringify({
				...record,
				finalOutcome: {
					error: "Judge failed",
					judgeContractSha256: CONTRACT_B,
					status: "EXECUTION_FAILED",
				},
				outcome: "UNSUCCESSFUL",
			}),
		);

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"finalJudgeContractSha256",
		);
	});
});

function changedStage(
	stage: Immutable<ParsedConfirmationRepRecord["stages"][number]>,
	judgeContractSha256: string | undefined,
): Immutable<ParsedConfirmationRepRecord["stages"][number]> & {
	readonly judgeContractSha256: string | undefined;
} {
	return { ...stage, judgeContractSha256 };
}
