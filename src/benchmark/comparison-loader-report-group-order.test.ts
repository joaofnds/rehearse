import { describe, expect, it } from "bun:test";

import { ZodError } from "zod";

import extendEveryComparisonArm from "./comparison-additional-groups-fixture";
import writeComparisonReport from "./comparison-command";
import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";
import { comparisonOutputDirectory } from "./comparison-output-fixtures";
import type {
	ComparisonReport,
	LegacyComparisonReport,
} from "./comparison-record";
import { parseComparisonReport } from "./comparison-record";

const INITIAL_GROUP_INDEX = 0;
const ADDITIONAL_GROUP_INDEX = 1;
const UNLISTED_GROUP_INDEX = 2;

const groupOrders = [
	{
		groups: [
			ADDITIONAL_GROUP_INDEX,
			ADDITIONAL_GROUP_INDEX,
			INITIAL_GROUP_INDEX,
			INITIAL_GROUP_INDEX,
		],
		reading: "out of group order",
	},
	{
		groups: [
			INITIAL_GROUP_INDEX,
			INITIAL_GROUP_INDEX,
			ADDITIONAL_GROUP_INDEX,
			UNLISTED_GROUP_INDEX,
		],
		reading: "naming a group the arm does not list",
	},
];

describe(loadComparisonEvidence.name, () => {
	const { fixture, temporaryDirectory } = comparisonLoaderTestFixture();
	it.each(groupOrders)(
		"refuses a report whose arm lists reps $reading",
		async ({ groups }) => {
			await extendEveryComparisonArm(fixture);
			const runsDirectory = await comparisonOutputDirectory({
				name: "misgrouped-output",
				root: temporaryDirectory,
			});
			const reportFile = await writeComparisonReport({
				manifestPath: fixture.manifestFile,
				runsDirectory,
			});
			const written = await Bun.file(reportFile).text();
			const [head, ...afterEachGroup] = written.split(/"group": \d+/u);
			const misgrouped = [
				head,
				...afterEachGroup.map(
					(piece, index) =>
						`"group": ${String(groups[index % groups.length])}${piece}`,
				),
			].join("");

			const parse = (): ComparisonReport | LegacyComparisonReport =>
				parseComparisonReport(misgrouped);

			expect(parse).toThrow(ZodError);
		},
	);
});
