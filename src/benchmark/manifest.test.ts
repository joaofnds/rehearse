import { describe, expect, it } from "bun:test";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RunManifest } from "./manifest";
import { loadRunManifest, writeRunManifest } from "./manifest";
import { benchmarkRunPaths } from "./run-layout";
import { TEST_TARGET, TestResources } from "./test-support";

const FIXTURE_JSON_INDENT_SPACES = 2;

function manifestFixture(): RunManifest {
	return {
		baselineChecks: {
			evidence: [
				{
					claim: "All baseline checks exited successfully",
					path: "bun --version",
					source: "local-checks",
				},
			],
			status: "PASS",
		},
		caseId: "audit-log",
		controlSha: "control-sha",
		effort: "high",
		judgeEffort: "high",
		judgeModel: "opus",
		model: "sonnet",
		pipeline: {
			stages: [
				{
					artifact: "spec",
					kind: "planning",
					name: "discuss",
					requiresAcceptanceCriteria: false,
					rubric: "rubrics/discuss.json",
					skill: "discuss",
				},
				{
					kind: "delivery",
					name: "build",
					rubric: "rubrics/build.json",
					skill: "build",
				},
			],
			statuses: ["To Do", "Done"],
			target: TEST_TARGET,
		},
		pipelinePath: "pipelines/default.json",
		productBrief: "Brief text",
		sessionBudgetUsd: 5,
		sourceRoot: "/tmp/target",
		sourceSha: "source-sha",
		task: "Task text",
		taskId: "TASK-1",
		taskSha: "task-sha",
		timestamp: "2026-08-30T00:00:00.000Z",
	};
}

const testResources = TestResources.forEachTest();

const loadRunManifestRoundtripsTheManifestARunWrote =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-manifest-"));
		testResources.track(directory);
		const paths = benchmarkRunPaths(directory, "run");
		const manifest = manifestFixture();

		await writeRunManifest(paths.manifestFile, manifest);
		const manifestStats = await stat(paths.manifestFile);

		expect(await loadRunManifest(paths.manifestFile)).toEqual(manifest);
		expect(manifestStats.isFile()).toBe(true);
	};

const loadRunManifestReadsAManifestRecordedBeforeBaselineChecksWereCaptured =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-manifest-"));
		testResources.track(directory);
		const paths = benchmarkRunPaths(directory, "run");
		const { baselineChecks: _baselineChecks, ...legacy } = manifestFixture();
		await Bun.write(paths.manifestFile, JSON.stringify(legacy));

		const loaded = await loadRunManifest(paths.manifestFile);

		expect(loaded.baselineChecks).toBeUndefined();
	};

const loadRunManifestReadsAManifestWithoutACaseIdAsTheAuditlogCase =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-manifest-"));
		testResources.track(directory);
		const paths = benchmarkRunPaths(directory, "run");
		const { caseId: _caseId, ...legacy } = manifestFixture();

		await Bun.write(paths.manifestFile, JSON.stringify(legacy));

		const loaded = await loadRunManifest(paths.manifestFile);

		expect(loaded.caseId).toBe("audit-log");
	};

const loadRunManifestLoadsAPretargetManifestWithTheFormerTargetConfiguration =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-manifest-"));
		testResources.track(directory);
		const paths = benchmarkRunPaths(directory, "run");
		const manifest = manifestFixture();
		const { target: _target, ...legacyPipeline } = manifest.pipeline;
		await Bun.write(
			paths.manifestFile,
			`${JSON.stringify({ ...manifest, pipeline: legacyPipeline }, null, FIXTURE_JSON_INDENT_SPACES)}\n`,
		);

		const loaded = await loadRunManifest(paths.manifestFile);

		expect(loaded.pipeline.target).toEqual({
			checks: [
				{
					command: ["bun", "run", "typecheck"],
					env: { CONFIG_PATH: "src/config/test.yaml" },
				},
				{
					command: ["bun", "run", "check"],
					env: { CONFIG_PATH: "src/config/test.yaml" },
				},
				{
					command: ["bun", "run", "test:unit"],
					env: { CONFIG_PATH: "src/config/test.yaml" },
				},
			],
			integrityFiles: ["package.json", "tsconfig.json", "biome.json"],
		});
	};

const loadRunManifestNamesTheMissingManifestWhenTheRunPredatesManifests =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-manifest-"));
		testResources.track(directory);
		const paths = benchmarkRunPaths(directory, "run");

		expect(loadRunManifest(paths.manifestFile)).rejects.toThrow(
			"runs recorded before manifests cannot be replayed",
		);
	};

const loadRunManifestRejectsAManifestThatLostAFieldItLaterNeeds =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-manifest-"));
		testResources.track(directory);
		const paths = benchmarkRunPaths(directory, "run");
		const { taskSha: _taskSha, ...truncated } = manifestFixture();
		await Bun.write(
			paths.manifestFile,
			`${JSON.stringify(truncated, null, FIXTURE_JSON_INDENT_SPACES)}\n`,
		);

		expect(loadRunManifest(paths.manifestFile)).rejects.toThrow();
	};

describe(loadRunManifest.name, () => {
	it(
		"round-trips the manifest a run wrote",
		loadRunManifestRoundtripsTheManifestARunWrote,
	);

	it(
		"reads a manifest recorded before baseline checks were captured",
		loadRunManifestReadsAManifestRecordedBeforeBaselineChecksWereCaptured,
	);

	it(
		"reads a manifest without a caseId as the audit-log case",
		loadRunManifestReadsAManifestWithoutACaseIdAsTheAuditlogCase,
	);

	it(
		"loads a pre-target manifest with the former target configuration",
		loadRunManifestLoadsAPretargetManifestWithTheFormerTargetConfiguration,
	);

	it(
		"names the missing manifest when the run predates manifests",
		loadRunManifestNamesTheMissingManifestWhenTheRunPredatesManifests,
	);

	it(
		"rejects a manifest that lost a field it later needs",
		loadRunManifestRejectsAManifestThatLostAFieldItLaterNeeds,
	);
});
