import { createHash } from "node:crypto";
import { STOPPED_BEFORE_LAST_STAGE_REASON } from "./comparison-report";
import {
	chmod,
	lstat,
	mkdir,
	mkdtemp,
	readdir,
	rm,
	symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { z } from "zod";
import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "./confirmation-record";
import { writeComparisonReport } from "./comparison-command";
import {
	ComparisonEvidenceFixture,
	digest,
} from "./comparison-evidence-test-support";
import { COMPARISON_ARMS, parseComparisonReport } from "./comparison-record";
import { runCommand } from "./command";
import { CONTROL_DIR, recordsDirectory } from "./config";
import { loadComparisonEvidence } from "./comparison-loader";
import { comparisonReportPaths } from "./run-layout";

async function directoryDigests(
	directory: string,
): Promise<Readonly<Record<string, string>>> {
	const digests: Record<string, string> = {};
	const entries = await readdir(directory, { recursive: true });
	for (const entry of entries.toSorted()) {
		const path = join(directory, entry);
		const file = Bun.file(path);
		if (!(await file.exists()) || file.type === "directory") {
			continue;
		}

		digests[entry] = createHash("sha256")
			.update(await file.bytes())
			.digest("hex");
	}

	return digests;
}

describe(loadComparisonEvidence.name, () => {
	let temporaryDirectory: string;
	let fixture: ComparisonEvidenceFixture;
	let writtenReportFile: string | undefined;

	beforeEach(async () => {
		temporaryDirectory = await mkdtemp(
			join(tmpdir(), "rehearse-comparison-loader-"),
		);
		fixture = new ComparisonEvidenceFixture(temporaryDirectory);
		await fixture.write();
	});

	afterEach(async () => {
		if (writtenReportFile !== undefined) {
			await rm(dirname(writtenReportFile), { force: true, recursive: true });
		}
		await rm(temporaryDirectory, { force: true, recursive: true });
	});

	it("loads and hashes source groups, reps, and executed corpus", async () => {
		const evidence = await loadComparisonEvidence(fixture.manifestFile);
		const candidate = evidence.cases.at(0)?.arms.candidate;

		expect(evidence.contract).toEqual({
			mode: "stage",
			declaredStages: ["build"],
			reps: 2,
		});
		expect(evidence.manifest.sha256).toMatch(/^[0-9a-f]{64}$/u);
		expect(candidate?.role).toBe("candidate");
		expect(candidate?.group.path).toBe("groups/case-1-candidate/group.json");
		expect(candidate?.group.sha256).toMatch(/^[0-9a-f]{64}$/u);
		expect(candidate?.reps.map(({ path }) => path)).toEqual([
			"groups/case-1-candidate/reps/case-1-candidate-rep-1/rep.json",
			"groups/case-1-candidate/reps/case-1-candidate-rep-2/rep.json",
		]);
		expect(candidate?.reps.at(0)?.sha256).toMatch(/^[0-9a-f]{64}$/u);
		expect(candidate?.reps.at(1)?.sha256).toMatch(/^[0-9a-f]{64}$/u);
		expect(candidate?.executedCorpus).toEqual([
			{
				kind: "corpus",
				path: "inputs/corpus/build/SKILL.md",
				sha256: digest("candidate corpus\n"),
			},
		]);
	});

	it("reads together the reps of every group an arm names, in the order named", async () => {
		for (const caseId of fixture.caseIds) {
			for (const role of COMPARISON_ARMS) {
				await fixture.addGroup(caseId, role);
			}
		}

		const evidence = await loadComparisonEvidence(fixture.manifestFile);
		const candidate = evidence.cases.at(0)?.arms.candidate;

		expect(evidence.contract.reps).toBe(4);
		expect(candidate?.groups.map(({ path }) => path)).toEqual([
			"groups/case-1-candidate/group.json",
			"groups/case-1-candidate-more/group.json",
		]);
		expect(candidate?.reps.map(({ path }) => path)).toEqual([
			"groups/case-1-candidate/reps/case-1-candidate-rep-1/rep.json",
			"groups/case-1-candidate/reps/case-1-candidate-rep-2/rep.json",
			"groups/case-1-candidate-more/reps/case-1-candidate-more-rep-1/rep.json",
			"groups/case-1-candidate-more/reps/case-1-candidate-more-rep-2/rep.json",
		]);
	});

	it("reports an arm of two groups as one arm, each attempt numbered within it and naming its group", async () => {
		for (const caseId of fixture.caseIds) {
			for (const role of COMPARISON_ARMS) {
				await fixture.addGroup(caseId, role);
			}
		}
		const runsDirectory = join(temporaryDirectory, "grouped-output");
		await mkdir(runsDirectory);

		const reportFile = await writeComparisonReport({
			manifestPath: fixture.manifestFile,
			runsDirectory,
		});

		const report = parseComparisonReport(await Bun.file(reportFile).text());
		if (report.schemaVersion !== 6) {
			throw new Error("Expected a version-6 report");
		}
		const source = report.cases[0]?.arms.candidate.source;
		expect(report.reps).toBe(4);
		expect(source?.groups.map(({ path }) => path)).toEqual([
			"groups/case-1-candidate/group.json",
			"groups/case-1-candidate-more/group.json",
		]);
		expect(
			source?.reps.map(({ repId, ordinal, group }) => [repId, ordinal, group]),
		).toEqual([
			["case-1-candidate-rep-1", 1, 0],
			["case-1-candidate-rep-2", 2, 0],
			["case-1-candidate-more-rep-1", 3, 1],
			["case-1-candidate-more-rep-2", 4, 1],
		]);
	});

	it("hashes each judged stage's scorecard as rep evidence", async () => {
		const evidence = await loadComparisonEvidence(fixture.manifestFile);
		const [scorecard] = evidence.cases.at(0)?.arms.baseline.reps.at(0)
			?.scorecards ?? [undefined];

		expect(scorecard?.path).toBe(
			"groups/case-1-baseline/reps/case-1-baseline-rep-1/stages/build.json",
		);
		expect(scorecard?.sha256).toBe(
			digest(
				await Bun.file(fixture.scorecardFile("case-1", "baseline", 1)).text(),
			),
		);
		expect(scorecard?.record.grade.hardBlockers).toEqual([
			{ id: "scope-declared", status: "FAIL" },
		]);
	});

	it("records each stage rep's blocker firings, dimension grades and words", async () => {
		const runsDirectory = join(temporaryDirectory, "grading-output");
		await mkdir(runsDirectory);

		const reportFile = await writeComparisonReport({
			manifestPath: fixture.manifestFile,
			runsDirectory,
		});

		const report = parseComparisonReport(await Bun.file(reportFile).text());
		const [rep] = report.cases[0]?.arms.baseline.source.reps ?? [];
		expect(
			rep !== undefined && "stageGrading" in rep && rep.stageGrading,
		).toEqual([
			{
				stage: "build",
				scorecard: {
					path: "groups/case-1-baseline/reps/case-1-baseline-rep-1/stages/build.json",
					sha256: digest(
						await Bun.file(
							fixture.scorecardFile("case-1", "baseline", 1),
						).text(),
					),
				},
				hardBlockers: [{ id: "scope-declared", fired: true }],
				dimensions: [{ id: "clarity", grade: "C" }],
			},
		]);
		expect(rep !== undefined && "words" in rep && rep.words).toEqual({
			state: "available",
			words: 7,
		});
	});

	it("names a judged stage whose scorecard is missing", async () => {
		await rm(fixture.scorecardFile("case-1", "control", 2));

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-1 arm control field repRecords[1].stages[0].evidence.recordFile",
		);
	});

	it("names a judged stage whose scorecard is not JSON", async () => {
		await Bun.write(fixture.scorecardFile("case-1", "control", 2), "{");

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-1 arm control field repRecords[1].stages[0].evidence.recordFile: invalid stage scorecard for build",
		);
	});

	describe("when an arm names a group run on other inputs than its first", () => {
		it("refuses a group graded by another judge model", async () => {
			const groupId = await fixture.addGroup("case-1", "candidate");
			await fixture.changeGroup(groupId, (group) => ({
				...group,
				inputs: { ...group.inputs, judgeModel: "haiku" },
			}));

			expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
				"case case-1 arm candidate group groups/case-1-candidate-more/group.json field inputs.judgeModel differs from group groups/case-1-candidate/group.json",
			);
		});

		it("refuses a group that ran another corpus", async () => {
			const groupId = await fixture.addGroup("case-1", "candidate");
			const corpus = "inputs/corpus/build/SKILL.md";
			await Bun.write(
				join(dirname(fixture.groupFileOf(groupId)), corpus),
				"edited corpus\n",
			);
			await fixture.changeGroup(groupId, (group) => ({
				...group,
				inputs: {
					...group.inputs,
					files: group.inputs.files.map((file) =>
						file.path === corpus
							? { ...file, sha256: digest("edited corpus\n") }
							: file,
					),
				},
			}));

			expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
				"case case-1 arm candidate group groups/case-1-candidate-more/group.json field inputs.files.corpus differs from group groups/case-1-candidate/group.json",
			);
		});

		it("refuses a group named twice, whose reps would count twice", async () => {
			await fixture.nameGroups("case-1", "candidate", [
				"case-1-candidate",
				"case-1-candidate",
			]);

			expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
				"case case-1 arm candidate group groups/case-1-candidate/group.json is named twice",
			);
		});
	});

	it("names a missing source group before report creation", async () => {
		await rm(fixture.groupFile("case-1", "control"));

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-1 arm control field group.path",
		);
	});

	it("names an invalid source group before report creation", async () => {
		await Bun.write(fixture.groupFile("case-2", "baseline"), "{}\n");

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-2 arm baseline field group.record",
		);
	});

	it("names a session group with a missing frozen case", async () => {
		await Bun.write(
			fixture.groupFile("case-1", "control"),
			`${JSON.stringify(
				{
					schemaVersion: 2,
					caseId: "case-1",
					groupId: "session-group",
					mode: "session",
					reps: 2,
					declaredStages: ["checks"],
					inputs: {
						lineage: { kind: "SESSION", lineage: "lineage-1" },
						files: [
							{
								kind: "case",
								path: "inputs/case.json",
								sha256: "a".repeat(64),
							},
						],
						model: "sonnet",
						sessionBudgetUsd: 0.2,
					},
					projectedCost: {
						reps: 2,
						perRepMaximumUsd: 0.2,
						preflightMaximumUsd: 0.1,
						totalMaximumUsd: 0.5,
					},
					preflight: { status: "MISSING", missing: "metrics" },
					approval: { method: "yes", approved: true },
					repRecords: [1, 2].map((ordinal) => ({
						repId: `session-group-rep-${ordinal}`,
						ordinal,
						path: `reps/session-group-rep-${ordinal}/rep.json`,
					})),
					reportFile: "report.json",
					makespanMs: 1,
				},
				null,
				2,
			)}\n`,
		);

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"inputs.files[case:inputs/case.json].path",
		);
	});

	it("names a missing referenced rep record", async () => {
		await rm(fixture.repFile("case-2", "control", 1));

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-2 arm control field repRecords[0].path",
		);
	});

	it("names an invalid referenced rep record", async () => {
		await Bun.write(fixture.repFile("case-1", "candidate", 2), "{}\n");

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-1 arm candidate field repRecords[1].record",
		);
	});

	it("names a rep whose mode disagrees with its source group", async () => {
		const repFile = fixture.repFile("case-1", "baseline", 1);
		const record = parseConfirmationRepRecord(await Bun.file(repFile).text());
		const changed = {
			...record,
			mode: "pipeline" as const,
			outcome: "UNSUCCESSFUL" as const,
		};
		await Bun.write(repFile, `${JSON.stringify(changed, null, 2)}\n`);

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-1 arm baseline field repRecords[0].mode",
		);
	});

	it("rejects frozen corpus bytes that no longer match their digest", async () => {
		await Bun.write(
			fixture.corpusFile("case-2", "candidate"),
			"tampered corpus\n",
		);

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-2 arm candidate field inputs.files[corpus:inputs/corpus/build/SKILL.md].sha256",
		);
	});

	it("normalizes only pipeline checkpoint identities derived from each corpus", async () => {
		await fixture.usePipelineCheckpoints();

		const evidence = await loadComparisonEvidence(fixture.manifestFile);

		expect(evidence.contract.mode).toBe("pipeline");
	});

	it("records a pipeline rep's words from its last declared stage", async () => {
		await fixture.usePipelineCheckpoints();
		const runsDirectory = join(temporaryDirectory, "pipeline-words-output");
		await mkdir(runsDirectory);

		const reportFile = await writeComparisonReport({
			manifestPath: fixture.manifestFile,
			runsDirectory,
		});

		const report = parseComparisonReport(await Bun.file(reportFile).text());
		const [rep] = report.cases[0]?.arms.candidate.source.reps ?? [];
		expect(report.mode).toBe("pipeline");
		expect(rep !== undefined && "words" in rep && rep.words).toEqual({
			state: "available",
			words: 3,
		});
	});

	it("reads a pipeline rep stopped before its last declared stage as unavailable, never its earlier stage's words", async () => {
		await fixture.usePipelineCheckpoints();
		await fixture.stopOneRepBeforeItsLastStage({
			role: "candidate",
			ordinal: 1,
		});
		const runsDirectory = join(temporaryDirectory, "stopped-words-output");
		await mkdir(runsDirectory);

		const reportFile = await writeComparisonReport({
			manifestPath: fixture.manifestFile,
			runsDirectory,
		});

		const report = parseComparisonReport(await Bun.file(reportFile).text());
		const reps = report.cases[0]?.arms.candidate.source.reps ?? [];
		expect(reps.map((rep) => "words" in rep && rep.words)).toEqual([
			{ state: "unavailable", reason: STOPPED_BEFORE_LAST_STAGE_REASON },
			{ state: "available", words: 4 },
		]);
	});

	it("rejects changed workflow state inside a pipeline checkpoint record", async () => {
		await fixture.usePipelineCheckpoints("candidate");

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-1 arms baseline and candidate field inputs.files.checkpoint:inputs/checkpoint/checkpoint.json",
		);
	});

	it("rejects arms whose frozen target configurations differ", async () => {
		await fixture.changePipelineTarget("case-1", "candidate");

		expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
			"case case-1 arms baseline and candidate field inputs.files.pipeline:inputs/pipeline.json",
		);
	});

	it("creates no comparison layout when source validation fails", async () => {
		const runsDirectory = join(temporaryDirectory, "comparison-output");
		await rm(fixture.repFile("case-1", "baseline", 1));

		expect(
			writeComparisonReport({
				manifestPath: fixture.manifestFile,
				runsDirectory,
			}),
		).rejects.toThrow("case case-1 arm baseline field repRecords[0].path");
		expect(await Bun.file(runsDirectory).exists()).toBe(false);
	});

	it("rejects a report destination that is also frozen source evidence", async () => {
		const runsDirectory = join(temporaryDirectory, "comparison-output");
		const manifestSha = digest(await Bun.file(fixture.manifestFile).text());
		const { reportFile } = comparisonReportPaths(runsDirectory, manifestSha);
		await mkdir(dirname(reportFile), { recursive: true });
		await Bun.write(reportFile, "source task evidence\n");
		await fixture.pointFrozenInputAt("task", reportFile);

		expect(
			writeComparisonReport({
				manifestPath: fixture.manifestFile,
				runsDirectory,
			}),
		).rejects.toThrow("destination overlaps source evidence");
		expect(await Bun.file(reportFile).text()).toBe("source task evidence\n");
	});

	it("atomically replaces a destination symlink without changing its target", async () => {
		const runsDirectory = join(temporaryDirectory, "comparison-output");
		const manifestSha = digest(await Bun.file(fixture.manifestFile).text());
		const { reportFile } = comparisonReportPaths(runsDirectory, manifestSha);
		const symlinkTarget = join(temporaryDirectory, "outside-report.json");
		await mkdir(dirname(reportFile), { recursive: true });
		await Bun.write(symlinkTarget, "outside bytes\n");
		await symlink(symlinkTarget, reportFile);

		await writeComparisonReport({
			manifestPath: fixture.manifestFile,
			runsDirectory,
		});

		const reportStats = await lstat(reportFile);
		expect(reportStats.isSymbolicLink()).toBe(false);
		expect(await Bun.file(symlinkTarget).text()).toBe("outside bytes\n");
		const report = parseComparisonReport(await Bun.file(reportFile).text());
		expect(report.cases).toHaveLength(2);
	});

	it("accepts legacy groups that recorded no case at all", async () => {
		for (const caseId of ["case-1", "case-2"]) {
			for (const role of ["baseline", "candidate", "control"] as const) {
				const groupFile = fixture.groupFile(caseId, role);
				const { caseId: _declared, ...legacy } = parseConfirmationGroupRecord(
					await Bun.file(groupFile).text(),
				);
				await Bun.write(groupFile, `${JSON.stringify(legacy, null, 2)}\n`);
			}
		}

		const evidence = await loadComparisonEvidence(fixture.manifestFile);

		expect(evidence.cases.at(0)?.arms.candidate.declaredCaseId).toBeUndefined();
	});

	it("names in the report the case the source groups recorded", async () => {
		const auditLogRoot = join(temporaryDirectory, "audit-log-cases");
		await mkdir(auditLogRoot);
		const auditLogFixture = new ComparisonEvidenceFixture(auditLogRoot, [
			"audit-log",
			"audit-log-follow-up",
		]);
		await auditLogFixture.write();
		const runsDirectory = join(temporaryDirectory, "audit-log-output");
		await mkdir(runsDirectory);

		const reportFile = await writeComparisonReport({
			manifestPath: auditLogFixture.manifestFile,
			runsDirectory,
		});

		const report = parseComparisonReport(await Bun.file(reportFile).text());
		expect(report.cases.map(({ caseId }) => caseId)).toEqual([
			"audit-log",
			"audit-log-follow-up",
		]);
	});

	it("writes a one-checkpoint stage comparison that estimates over reps", async () => {
		const oneCheckpointRoot = join(temporaryDirectory, "one-checkpoint");
		await mkdir(oneCheckpointRoot);
		const oneCheckpoint = new ComparisonEvidenceFixture(oneCheckpointRoot, [
			"build-checkpoint",
		]);
		await oneCheckpoint.write();
		const runsDirectory = join(temporaryDirectory, "one-checkpoint-output");
		await mkdir(runsDirectory);

		const reportFile = await writeComparisonReport({
			manifestPath: oneCheckpoint.manifestFile,
			runsDirectory,
		});

		const report = parseComparisonReport(await Bun.file(reportFile).text());
		expect(report.mode).toBe("stage");
		expect(report.cases.map(({ caseId }) => caseId)).toEqual([
			"build-checkpoint",
		]);
		expect("samplingUnit" in report && report.samplingUnit).toBe("rep");
	});

	it("serializes a completed comparison fixture byte for byte", async () => {
		const runsDirectory = join(temporaryDirectory, "characterization-output");
		await mkdir(runsDirectory);
		const manifestSha = digest(await Bun.file(fixture.manifestFile).text());
		const expectedReportFile = comparisonReportPaths(
			runsDirectory,
			manifestSha,
		).reportFile;
		const sourceBefore = await directoryDigests(
			join(temporaryDirectory, "groups"),
		);

		const reportFile = await writeComparisonReport({
			manifestPath: fixture.manifestFile,
			runsDirectory,
		});
		const reportText = await Bun.file(reportFile).text();
		const sourceAfter = await directoryDigests(
			join(temporaryDirectory, "groups"),
		);

		expect(reportFile).toBe(expectedReportFile);
		expect(reportText).toMatchSnapshot();
		expect(reportText.endsWith("\n")).toBe(true);
		expect(sourceAfter).toEqual(sourceBefore);
	});

	it("writes one read-only comparison report without external execution", async () => {
		const trapsDirectory = join(temporaryDirectory, "traps");
		const externalCallMarker = join(
			temporaryDirectory,
			"unexpected-external-call",
		);
		const manifestSha = digest(await Bun.file(fixture.manifestFile).text());
		const expectedReportFile = comparisonReportPaths(
			recordsDirectory(),
			manifestSha,
		).reportFile;
		await mkdir(trapsDirectory);
		for (const command of ["claude", "git"]) {
			const trap = join(trapsDirectory, command);
			await Bun.write(
				trap,
				'#!/bin/sh\ntouch "$EXTERNAL_CALL_MARKER"\nexit 97\n',
			);
			await chmod(trap, 0o755);
		}
		const before = await directoryDigests(temporaryDirectory);

		const output = await runCommand(
			[
				process.execPath,
				"run",
				join(CONTROL_DIR, "rehearse.ts"),
				"compare",
				fixture.manifestFile,
			],
			CONTROL_DIR,
			{
				env: {
					EXTERNAL_CALL_MARKER: externalCallMarker,
					PATH: `${trapsDirectory}:${Bun.env["PATH"] ?? ""}`,
				},
			},
		);
		writtenReportFile = expectedReportFile;
		const after = await directoryDigests(temporaryDirectory);
		const reportText = await Bun.file(writtenReportFile).text();
		const report = parseComparisonReport(reportText);

		expect(output).toBe(`${expectedReportFile}\n`);
		expect(report.manifest.sha256).toBe(manifestSha);
		expect(report.cases).toHaveLength(2);
		expect(after).toEqual(before);
		expect(await Bun.file(externalCallMarker).exists()).toBe(false);
	});

	it("reports agreement for every represented Judge model and no others", async () => {
		const runsDirectory = join(temporaryDirectory, "agreement-output");
		await mkdir(runsDirectory);
		await fixture.useJudgeModel("case-2", "sonnet");
		const calibrationArtifact = {
			status: "COMPLETE",
			rubric: "1. `agreement`: calibrated\n",
			grade: {
				requirements: [
					{
						id: "agreement",
						status: "PASS",
						evidence: [
							{
								source: "diff",
								path: "change.diff",
								claim: "calibrated evidence",
							},
						],
					},
				],
				verdict: "PASS",
				summary: "calibrated grade",
			},
			stageScorecards: [],
			calibration: {
				humanReview: {
					verdict: "ACCEPT",
					summary: "The human agrees.",
					findings: [],
				},
			},
		};
		await Promise.all([
			Bun.write(
				join(runsDirectory, "opus.json"),
				JSON.stringify({ ...calibrationArtifact, judgeModel: "opus" }),
			),
			Bun.write(
				join(runsDirectory, "sonnet.json"),
				JSON.stringify({ ...calibrationArtifact, judgeModel: "sonnet" }),
			),
		]);

		const reportFile = await writeComparisonReport({
			manifestPath: fixture.manifestFile,
			runsDirectory,
		});
		const report = z
			.object({
				schemaVersion: z.literal(6),
				judgeAgreement: z.object({
					baselines: z.array(
						z.object({
							judgeModel: z.string(),
							criteria: z.array(
								z.object({ rubricId: z.string(), sampleSize: z.number() }),
							),
						}),
					),
				}),
			})
			.parse(JSON.parse(await Bun.file(reportFile).text()));

		expect(report.judgeAgreement.baselines).toEqual([
			{
				judgeModel: "opus",
				criteria: [{ rubricId: "agreement", sampleSize: 1 }],
			},
			{
				judgeModel: "sonnet",
				criteria: [{ rubricId: "agreement", sampleSize: 1 }],
			},
		]);
	});
});
