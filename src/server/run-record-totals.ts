import { parseRecord } from "#benchmark/record-parse-cache";
import { recordFileExists, recordFileText } from "#benchmark/record-read-scope";
import type { BenchmarkRunPaths } from "#benchmark/run-layout";
import {
	judgeCost,
	judgeTokenPart,
	spenders,
	spentCallsPart,
	tokenReading,
	usd,
} from "#server/run-call-metrics";
import type { TokenPart } from "#server/run-call-metrics";
import type {
	CostPart,
	CostReading,
	MissingPart,
	PlacedStage,
	Reading,
	RunRecordStage,
	RunTotals,
	RunWideRecords,
} from "#server/run-record-contract";
import { wallTime } from "#server/run-record-reading";
import {
	PRODUCT_OWNER_COST_REASON,
	PRODUCT_OWNER_TOKENS_REASON,
	RUN_WALL_TIME_REASON,
} from "#server/run-record-reasons";
import { artifactSpendSchema } from "#server/run-stage-file";
import type { ArtifactSpend } from "#server/run-stage-file";

const NO_SPEND_USD = 0;

const EMPTY_COLLECTION_LENGTH = 0;

async function readArtifactSpend(
	paths: BenchmarkRunPaths,
): Promise<ArtifactSpend | undefined> {
	const { artifactFile } = paths;
	if (!(await recordFileExists(artifactFile))) {
		return undefined;
	}

	return parseRecord(artifactSpendSchema, await recordFileText(artifactFile));
}

function costPart(
	part: string,
	reading: Reading<{ readonly usd: number }>,
): CostPart | MissingPart {
	return reading.state === "available"
		? { part, usd: reading.usd }
		: { part, reason: reading.reasons.join("; ") };
}

function stageCostParts(
	stage: RunRecordStage,
	recorded: PlacedStage,
): readonly (CostPart | MissingPart)[] {
	return spenders(recorded).map((spender) =>
		spender === "session"
			? costPart(`${stage.stage} session`, stage.sessionCost)
			: costPart(`${stage.stage} judge`, stage.judgeCost),
	);
}

/**
 * The spend summed over the parts recorded, naming each part lacked, and
 * unavailable when no part was recorded rather than a sum of zero.
 */
function costReading(spend: readonly (CostPart | MissingPart)[]): CostReading {
	const parts = spend.filter((part): part is CostPart => "usd" in part);
	const missing = spend.filter((part): part is MissingPart => "reason" in part);
	if (parts.length === EMPTY_COLLECTION_LENGTH) {
		return {
			reasons: missing.map(({ part, reason }) => `${part}: ${reason}`),
			state: "unavailable",
		};
	}

	return {
		missing,
		parts,
		state: "available",
		usd: parts.reduce((sum, part) => sum + part.usd, NO_SPEND_USD),
	};
}

function runTotals(
	stageParts: readonly (CostPart | MissingPart)[],
	tokenParts: readonly TokenPart[],
	{ artifact, stopRecord }: RunWideRecords,
): RunTotals {
	const productOwnerCost = usd(
		artifact === undefined
			? stopRecord?.productOwnerCostUsd
			: artifact.productOwnerCostUsd,
		PRODUCT_OWNER_COST_REASON,
	);
	const runParts =
		artifact === undefined
			? [costPart("Product Owner", productOwnerCost)]
			: [
					costPart("Product Owner", productOwnerCost),
					costPart(
						"final judge",
						judgeCost(
							artifact.judgeCostUsd,
							{
								attempts: artifact.judgeAttempts,
								providerCalls: artifact.judgeProviderCalls,
							},
							"the main artifact holds no final judge cost",
						),
					),
				];
	const summed = [...stageParts, ...runParts];

	return {
		cost: costReading(summed),
		productOwnerCost,
		tokens: tokenReading(tokenParts),
		wallTime: wallTime(
			artifact === undefined ? stopRecord?.runElapsedMs : artifact.elapsedMs,
			RUN_WALL_TIME_REASON,
		),
	};
}

/**
 * The run's parts beyond its stages: the Product Owner, whose calls the main
 * artifact or a stop record holds, and the final judge once the main
 * artifact holds it. A Product Owner never asked made no calls, so its empty
 * list is a part summed rather than one lacked.
 */
function runTokenParts({
	artifact,
	stopRecord,
}: RunWideRecords): readonly TokenPart[] {
	const productOwnerCalls =
		artifact === undefined
			? stopRecord?.productOwnerProviderCalls
			: artifact.productOwnerProviderCalls;
	const productOwner = spentCallsPart(
		"Product Owner",
		productOwnerCalls,
		PRODUCT_OWNER_TOKENS_REASON,
	);
	if (artifact === undefined) {
		return [productOwner];
	}

	return [
		productOwner,
		judgeTokenPart(
			"final judge",
			{
				attempts: artifact.judgeAttempts,
				providerCalls: artifact.judgeProviderCalls,
			},
			"the main artifact holds no judge attempts",
		),
	];
}

export {
	readArtifactSpend,
	stageCostParts,
	costReading,
	runTotals,
	runTokenParts,
};
