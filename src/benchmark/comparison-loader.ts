import { dirname, resolve } from "node:path";

import loadArmGroups from "./comparison-arm-evidence";
import { buildComparableComparison } from "./comparison-comparability";
import type {
	ComparisonEvidence,
	LoadedComparisonArmGroups,
	LoadedComparisonCaseEvidence,
} from "./comparison-evidence";
import { readEvidenceFile } from "./comparison-evidence-files";
import type { ComparisonArm, ComparisonManifest } from "./comparison-record";
import { COMPARISON_ARMS, parseComparisonManifest } from "./comparison-record";

async function loadCase(
	manifestDirectory: string,
	benchmarkCase: ComparisonManifest["cases"][number],
): Promise<LoadedComparisonCaseEvidence> {
	const armGroups = async (
		role: ComparisonArm,
	): Promise<LoadedComparisonArmGroups> =>
		await loadArmGroups(
			{ caseId: benchmarkCase.caseId, manifestDirectory, role },
			benchmarkCase.arms[role],
		);

	return {
		arms: {
			baseline: await armGroups("baseline"),
			candidate: await armGroups("candidate"),
			control: await armGroups("control"),
		},
		caseId: benchmarkCase.caseId,
	};
}

async function loadComparisonEvidence(
	manifestPath: string,
): Promise<ComparisonEvidence> {
	const absoluteManifestPath = resolve(manifestPath);
	const source = await readEvidenceFile({
		arm: "all",
		caseId: "manifest",
		field: "manifest.path",
		path: absoluteManifestPath,
	});
	const manifest = parseComparisonManifest(source.text);
	const manifestDirectory = dirname(absoluteManifestPath);
	const loadedCases: LoadedComparisonCaseEvidence[] = [];
	await Array.fromAsync(manifest.cases, async (benchmarkCase) => {
		loadedCases.push(await loadCase(manifestDirectory, benchmarkCase));
	});

	const { cases, contract } = buildComparableComparison(loadedCases);

	return {
		cases,
		contract,
		manifest: { path: absoluteManifestPath, sha256: source.sha256 },
		sourcePaths: [
			source.canonicalPath,
			...loadedCases.flatMap(({ arms }) =>
				COMPARISON_ARMS.flatMap((role) =>
					arms[role].flatMap(({ sourcePaths }) => sourcePaths),
				),
			),
		],
	};
}

export { REQUIRED_FROZEN_INPUT_KINDS } from "./comparison-frozen-evidence";
export { loadComparisonEvidence };
