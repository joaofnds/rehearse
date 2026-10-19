import { describe, expect, it } from "bun:test";

import type { LocalCheckResult } from "./contracts";
import { buildRunArtifact } from "./run-artifact";
import RunArtifactInputsBuilder from "./run-artifact-inputs-builder";
import buildRunManifest from "./run-manifest";
import {
	manifestConfig,
	runManifestInputs,
} from "./run-manifest-test-fixtures";
import { loadDefaultPipeline } from "./run-pipeline-test-fixtures";

const SHA256_HEX_DIGITS = 64;
async function recordsResolvedJudgeModel(): Promise<void> {
	const config = manifestConfig();
	const pipeline = await loadDefaultPipeline();

	const manifest = buildRunManifest({ ...runManifestInputs(config, pipeline) });
	const artifact = buildRunArtifact({
		...new RunArtifactInputsBuilder()
			.withPipeline(pipeline, config.pipelinePath)
			.build(),
		config,
	});

	expect({
		artifact: {
			caseId: artifact.caseId,
			judgeModel: artifact.judgeModel,
			model: artifact.model,
		},
		manifest: {
			caseId: manifest.caseId,
			judgeModel: manifest.judgeModel,
			model: manifest.model,
		},
	}).toEqual({
		artifact: { caseId: "audit-log", judgeModel: "opus", model: "sonnet" },
		manifest: { caseId: "audit-log", judgeModel: "opus", model: "sonnet" },
	});
}

async function recordsCheckoutAndTarget(): Promise<void> {
	const config = manifestConfig();
	const pipeline = await loadDefaultPipeline();
	const source = {
		origin: undefined,
		root: "/tmp/checkout/target",
		sha: "source-sha",
		targetRoot: "/tmp/target",
	};

	const manifest = buildRunManifest({
		...runManifestInputs(config, pipeline),
		source,
	});
	const artifact = buildRunArtifact({
		...new RunArtifactInputsBuilder()
			.withPipeline(pipeline, config.pipelinePath)
			.build(),
		config,
		source,
	});

	expect({ artifact, manifest }).toMatchObject({
		artifact: {
			sourceRoot: "/tmp/checkout/target",
			targetRoot: "/tmp/target",
		},
		manifest: {
			sourceRoot: "/tmp/checkout/target",
			targetRoot: "/tmp/target",
		},
	});
}

async function recordsSpendCeiling(): Promise<void> {
	const expectedSpendCeilingUsd = 7.5;

	const config = manifestConfig();

	const manifest = buildRunManifest({
		...runManifestInputs(config, await loadDefaultPipeline()),
		spendCeilingUsd: 7.5,
	});

	expect(manifest.spendCeilingUsd).toBe(expectedSpendCeilingUsd);
}

async function recordsCorpusVersion(): Promise<void> {
	const config = manifestConfig();
	const corpusVersion = {
		digest: "d".repeat(SHA256_HEX_DIGITS),
		kind: "version",
	} as const;

	const manifest = buildRunManifest({
		...runManifestInputs(config, await loadDefaultPipeline()),
		corpusVersion,
		spendCeilingUsd: 7.5,
	});

	expect(manifest.corpusVersion).toEqual(corpusVersion);
}

async function recordsBaselineChecks(): Promise<void> {
	const config = manifestConfig();
	const pipeline = await loadDefaultPipeline();
	const baselineChecks: LocalCheckResult = {
		evidence: [
			{
				claim: "All baseline checks exited successfully",
				path: "bun run test:unit",
				source: "local-checks",
			},
		],
		status: "PASS",
	};

	const manifest = buildRunManifest({
		...runManifestInputs(config, pipeline),
		baselineChecks,
	});

	expect(manifest.baselineChecks).toEqual(baselineChecks);
}

async function recordsMinimumGrade(): Promise<void> {
	const config = manifestConfig("C");

	const manifest = buildRunManifest({
		...runManifestInputs(config, await loadDefaultPipeline()),
	});

	expect(manifest.minimumGrade).toBe("C");
}

describe(buildRunManifest.name, () => {
	it(
		"records the resolved Judge model in run evidence",
		recordsResolvedJudgeModel,
	);
	it(
		"records the run's checkout and the target it was cloned from",
		recordsCheckoutAndTarget,
	);
	it("records the spend ceiling the run ran under", recordsSpendCeiling);
	it("records the corpus version the run started under", recordsCorpusVersion);
	it(
		"carries the baseline check result a proceeding run captured",
		recordsBaselineChecks,
	);
	it(
		"records the minimum grade the run's stages must reach",
		recordsMinimumGrade,
	);
});
