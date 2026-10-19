import { dirname, relative } from "node:path";

import { z } from "zod";

import type { ComparisonEvidenceFixture } from "./comparison-evidence-test-support";
import type { ComparisonArm } from "./comparison-record";
import { COMPARISON_ARMS } from "./comparison-record";

const JSON_INDENTATION_SPACES = 2;

interface NamedArmGroups {
	readonly caseId: string;
	readonly role: ComparisonArm;
	readonly groupIds: readonly string[];
}

async function extendEveryComparisonArm(
	fixture: Readonly<ComparisonEvidenceFixture>,
): Promise<void> {
	await Array.fromAsync(fixture.caseIds, async (caseId) => {
		await Array.fromAsync(COMPARISON_ARMS, async (role) => {
			await fixture.addGroup(caseId, role);
		});
	});
}

/** Names the arm's groups in the manifest, in the order given. */
async function nameGroups(
	fixture: Readonly<ComparisonEvidenceFixture>,
	{ caseId, role, groupIds }: NamedArmGroups,
): Promise<void> {
	const manifestCaseSchema = z.object({
		arms: z.record(z.string(), z.unknown()),
		caseId: z.string(),
	});
	const manifest = z
		.object({
			cases: z.array(manifestCaseSchema),
		})
		.loose()
		.parse(JSON.parse(await Bun.file(fixture.manifestFile).text()));
	const cases = manifest.cases.map((benchmarkCase) =>
		benchmarkCase.caseId === caseId
			? {
					...benchmarkCase,
					arms: {
						...benchmarkCase.arms,
						[role]: groupIds.map((groupId) =>
							relative(
								dirname(fixture.manifestFile),
								fixture.groupFileOf(groupId),
							),
						),
					},
				}
			: benchmarkCase,
	);
	await Bun.write(
		fixture.manifestFile,
		`${JSON.stringify({ ...manifest, cases }, null, JSON_INDENTATION_SPACES)}\n`,
	);
}

export { extendEveryComparisonArm as default, nameGroups };
