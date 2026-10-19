import recordedArm from "./comparison-arm-records";
import type {
	ExtendComparisonRequest,
	ExtensionPlan,
} from "./comparison-attempt-contract";
import { assertBaselineGradesOnArmARubric } from "./comparison-baseline-eligibility";
import type { ComparisonBaselineRecord } from "./comparison-baseline-record";
import { readComparisonBaselineRecord } from "./comparison-baseline-record";
import type { ComparisonArm } from "./comparison-record";
import { parseComparisonReport } from "./comparison-record";
import { unhandled } from "./contracts";
import { RefusedPreconditionError } from "./exit-codes";
import type { ArmResources } from "./more-attempts-cost";
import { moreAttemptsCost } from "./more-attempts-cost";
import { comparisonReportPaths } from "./run-layout";

const PRIMARY_SOURCE_GROUP_INDEX = 0;

const MIN_COMPARISON_ATTEMPTS_PER_ARM = 2;

interface RecordedExtension {
	readonly record: ComparisonBaselineRecord;
	readonly resources: Readonly<Record<ComparisonArm, ArmResources>>;
}

async function extendedRecord(
	reportDirectory: string,
	comparison: string,
): Promise<ComparisonBaselineRecord> {
	const recorded = await readComparisonBaselineRecord(reportDirectory);
	switch (recorded.kind) {
		case "recorded": {
			return recorded.record;
		}
		case "supplied": {
			throw new RefusedPreconditionError(
				`comparison ${comparison} was not made by compare attempts, so nothing records the checkpoint and corpora its arms would replay`,
			);
		}
		case "unreadable": {
			throw new RefusedPreconditionError(
				`comparison ${comparison} cannot be extended: ${recorded.reason}`,
			);
		}
		default: {
			return unhandled(recorded, "baseline record");
		}
	}
}

async function recordedExtension(
	request: ExtendComparisonRequest,
): Promise<RecordedExtension> {
	const paths = comparisonReportPaths(
		request.runsDirectory,
		request.comparison,
	);
	const reportFile = Bun.file(paths.reportFile);
	if (!(await reportFile.exists())) {
		throw new RefusedPreconditionError(
			`No saved comparison ${request.comparison}`,
		);
	}
	const record = await extendedRecord(paths.directory, request.comparison);
	const [benchmarkCase] = parseComparisonReport(await reportFile.text()).cases;
	if (benchmarkCase === undefined) {
		throw new Error(`comparison ${request.comparison} holds no case`);
	}
	return {
		record,
		resources: {
			baseline: benchmarkCase.arms.baseline.resources,
			candidate: benchmarkCase.arms.candidate.resources,
			control: benchmarkCase.arms.control.resources,
		},
	};
}

async function planExtension(
	request: ExtendComparisonRequest,
): Promise<ExtensionPlan> {
	if (request.attemptsPerArm < MIN_COMPARISON_ATTEMPTS_PER_ARM) {
		throw new RefusedPreconditionError(
			"a confirmation group needs at least 2 attempts, so add at least 2 attempts per arm",
		);
	}

	const { record, resources } = await recordedExtension(request);
	const cost = moreAttemptsCost(resources, request.attemptsPerArm);
	if (cost.state === "unavailable") {
		throw new RefusedPreconditionError(
			`what ${request.attemptsPerArm} more attempts per arm would cost cannot be stated: ${cost.reasons.join("; ")}`,
		);
	}
	const armA = await recordedArm(
		request.runsDirectory,
		record.arms.baseline[PRIMARY_SOURCE_GROUP_INDEX],
	);
	const armB = await recordedArm(
		request.runsDirectory,
		record.arms.candidate[PRIMARY_SOURCE_GROUP_INDEX],
	);
	await assertBaselineGradesOnArmARubric(
		request.runsDirectory,
		armA,
		record.skillUnderTest,
	);

	return { armA, armB, cost, record };
}

export { planExtension as default };
