import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { CONTROL_DIR, DEFAULT_CASE_ID } from "#benchmark/config";
import type {
	LegacyComparisonReport,
	MultiCaseComparisonReport,
} from "#benchmark/comparison-record";
import { parseComparisonReport } from "#benchmark/comparison-record";
import {
	armResourcesWithoutElapsed,
	contrastResourcesWithoutElapsed,
} from "#benchmark/comparison-test-fixtures";
import { comparisonReportPaths } from "#benchmark/run-layout";
import { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { UsageError } from "#cli/commands";
import { LIST_KINDS, runList } from "#cli/list-command";
import { parseRecordId } from "#cli/record-id";
import { runShow } from "#cli/show-command";
import { claimShortId } from "#benchmark/short-id";

const RECORDLESS_UUID = "0f6b6f2a-0000-4000-8000-0000000000ff";

function lines(stdout: readonly string[]): readonly string[] {
	const text = stdout.join("");

	return text === "" ? [] : text.trimEnd().split("\n");
}

function ids(stdout: readonly string[]): readonly string[] {
	return lines(stdout).map((line) => line.split("\t")[0] ?? "");
}

type VersionTwoReport = Extract<
	LegacyComparisonReport,
	{ readonly schemaVersion: 2 }
>;
type LegacyPipelineArm = VersionTwoReport["cases"][number]["arms"]["baseline"];
type VersionThreeReport = Extract<
	LegacyComparisonReport,
	{ readonly schemaVersion: 3 }
>;
type LegacySessionArm = VersionThreeReport["cases"][number]["arms"]["baseline"];

function parseLegacyCandidate(text: string): LegacyComparisonReport {
	const parsed = parseComparisonReport(text);
	if (parsed.schemaVersion === 5) {
		throw new Error("expected a legacy comparison report");
	}

	return parsed;
}

function withoutOutcomeArm(
	arm: MultiCaseComparisonReport["cases"][number]["arms"]["baseline"],
): LegacyPipelineArm {
	return {
		...arm,
		resources: armResourcesWithoutElapsed(arm.resources),
		source: {
			...arm.source,
			reps: arm.source.reps.map((rep) => {
				const { outcomes: _outcomes, ...legacyRep } = rep;

				return legacyRep;
			}),
		},
	};
}

function withoutOutcomes(
	report: MultiCaseComparisonReport,
): VersionTwoReport["cases"] {
	return report.cases.map(({ caseId, arms }) => ({
		caseId,
		arms: {
			baseline: withoutOutcomeArm(arms.baseline),
			candidate: withoutOutcomeArm(arms.candidate),
			control: withoutOutcomeArm(arms.control),
		},
	}));
}

function legacyComparisonReport(
	report: MultiCaseComparisonReport,
	version: 1 | 2 | 3 | 4,
): LegacyComparisonReport {
	const cases = withoutOutcomes(report);
	const contrastWithoutElapsed = (
		contrast: MultiCaseComparisonReport["contrasts"]["candidateMinusBaseline"],
	): VersionTwoReport["contrasts"]["candidateMinusBaseline"] => ({
		...contrast,
		resources: contrastResourcesWithoutElapsed(contrast.resources),
	});
	const contrasts = {
		candidateMinusBaseline: contrastWithoutElapsed(
			report.contrasts.candidateMinusBaseline,
		),
		candidateMinusControl: contrastWithoutElapsed(
			report.contrasts.candidateMinusControl,
		),
		baselineMinusControl: contrastWithoutElapsed(
			report.contrasts.baselineMinusControl,
		),
	};
	if (version === 4) {
		return parseLegacyCandidate(
			JSON.stringify({
				...report,
				schemaVersion: 4,
				cases: report.cases.map(({ caseId, arms }) => ({
					caseId,
					arms: {
						baseline: {
							...arms.baseline,
							resources: armResourcesWithoutElapsed(arms.baseline.resources),
						},
						candidate: {
							...arms.candidate,
							resources: armResourcesWithoutElapsed(arms.candidate.resources),
						},
						control: {
							...arms.control,
							resources: armResourcesWithoutElapsed(arms.control.resources),
						},
					},
				})),
				contrasts,
			}),
		);
	}
	if (version === 1) {
		const { judgeAgreement: _judgeAgreement, ...fields } = report;

		return parseLegacyCandidate(
			JSON.stringify({ ...fields, schemaVersion: 1, cases, contrasts }),
		);
	}
	if (version === 2) {
		return parseLegacyCandidate(
			JSON.stringify({ ...report, schemaVersion: 2, cases, contrasts }),
		);
	}

	const sessionArm = (arm: LegacyPipelineArm): LegacySessionArm => ({
		...arm,
		source: {
			...arm.source,
			reps: Array.from(arm.source.reps, (rep) => ({
				...rep,
				attempt: {
					path: `attempts/${rep.repId}.json`,
					sha256: "a".repeat(64),
				},
			})),
		},
		quality: Array.from(arm.quality.slice(0, 1), (summary) => ({
			...summary,
			name: "checks",
		})),
	});
	const sessionCases: VersionThreeReport["cases"] = cases.map(
		({ caseId, arms }) => ({
			caseId,
			arms: {
				baseline: sessionArm(arms.baseline),
				candidate: sessionArm(arms.candidate),
				control: sessionArm(arms.control),
			},
		}),
	);
	const sessionContrast = (
		contrast: MultiCaseComparisonReport["contrasts"]["candidateMinusBaseline"],
	): VersionThreeReport["contrasts"]["candidateMinusBaseline"] => ({
		...contrast,
		resources: contrastResourcesWithoutElapsed(contrast.resources),
		quality: Array.from(contrast.quality.slice(0, 1), (summary) => ({
			...summary,
			name: "checks",
		})),
	});

	return parseLegacyCandidate(
		JSON.stringify({
			...report,
			schemaVersion: 3,
			mode: "session",
			declaredStages: ["checks"],
			judgeAgreement: { skippedCalibrations: 0, baselines: [] },
			cases: sessionCases,
			contrasts: {
				candidateMinusBaseline: sessionContrast(
					report.contrasts.candidateMinusBaseline,
				),
				candidateMinusControl: sessionContrast(
					report.contrasts.candidateMinusControl,
				),
				baselineMinusControl: sessionContrast(
					report.contrasts.baselineMinusControl,
				),
			},
		}),
	);
}

describe(runList.name, () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
		);
	});

	async function writtenFixture(): Promise<RecordedRunsFixture> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-list-"));
		roots.push(root);
		const fixture = new RecordedRunsFixture(root);
		await fixture.write();

		return fixture;
	}

	async function emptyRunsDirectory(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-list-empty-"));
		roots.push(root);

		return root;
	}

	it("prints one line per declared case with its id and title", async () => {
		const recorder = recordOutput();

		await runList(
			{ kind: "cases", runsDirectory: await emptyRunsDirectory() },
			recorder.output,
		);

		expect(ids(recorder.stdout)).toContain(`case:${DEFAULT_CASE_ID}`);
		expect(ids(recorder.stdout)).toContain("case:smoke");
	});

	it("marks a run without a manifest as not replayable", async () => {
		const fixture = await writtenFixture();
		const recorder = recordOutput();

		await runList(
			{ kind: "runs", runsDirectory: fixture.runsDirectory },
			recorder.output,
		);

		expect(lines(recorder.stdout)).toEqual([
			`run:${fixture.unreplayableRun}\t-\taudit-log\tFAILED\tnot replayable`,
			`run:${fixture.replayableRun}\t-\taudit-log\tCOMPLETE\treplayable`,
		]);
	});

	it("names a run that stopped at a stage, naming the stage and listing it replayable", async () => {
		const fixture = await writtenFixture();
		await fixture.writeStoppedRun();
		const recorder = recordOutput();

		await runList(
			{ kind: "runs", runsDirectory: fixture.runsDirectory },
			recorder.output,
		);

		expect(lines(recorder.stdout)).toContain(
			`run:${fixture.stoppedRun}\t-\taudit-log\tSTOPPED:build\treplayable`,
		);
	});

	it("reports a stopped run without a manifest as unreadable rather than replayable", async () => {
		const fixture = await writtenFixture();
		await fixture.writeStoppedRunWithoutManifest();
		const recorder = recordOutput();

		await runList(
			{ kind: "runs", runsDirectory: fixture.runsDirectory },
			recorder.output,
		);

		expect(ids(recorder.stdout)).not.toContain(`run:${fixture.stoppedRun}`);
		expect(recorder.stderr.join("")).toContain(`run:${fixture.stoppedRun}:`);
	});

	it("gives a stopped run without a manifest a plain incomplete reason, not a raw ENOENT", async () => {
		const fixture = await writtenFixture();
		await fixture.writeStoppedRunWithoutManifest();
		const recorder = recordOutput();

		await runList(
			{ kind: "runs", runsDirectory: fixture.runsDirectory },
			recorder.output,
		);

		const reasons = recorder.stderr.join("");
		expect(reasons).not.toContain("ENOENT");
		expect(reasons).toContain("incomplete");
	});

	it("gives a run with no record of any kind a plain no-record line", async () => {
		const fixture = await writtenFixture();
		await fixture.writeNoRecordRun();
		const recorder = recordOutput();

		await runList(
			{ kind: "runs", runsDirectory: fixture.runsDirectory },
			recorder.output,
		);

		expect(lines(recorder.stdout)).toContain(
			`run:${fixture.noRecordRun}\t-\tno record`,
		);
	});

	it("prints one line per checkpoint of every recorded run", async () => {
		const fixture = await writtenFixture();
		const recorder = recordOutput();

		await runList(
			{ kind: "checkpoints", runsDirectory: fixture.runsDirectory },
			recorder.output,
		);

		expect(lines(recorder.stdout)).toEqual([
			`checkpoint:${fixture.replayableRun}/build\t-\tbuild\tlineage-build`,
			`checkpoint:${fixture.replayableRun}/discuss\t-\tdiscuss\tlineage-discuss`,
		]);
	});

	describe("when the records' cases are numbered", () => {
		async function numberedFixture(): Promise<RecordedRunsFixture> {
			const fixture = await writtenFixture();
			await claimShortId(fixture.runsDirectory, "audit-log", {
				kind: "run",
				run: "2026-09-24T00-00-00.000Z",
			});
			await claimShortId(fixture.runsDirectory, "smoke", {
				kind: "run",
				run: "2026-09-24T00-00-01.000Z",
			});

			return fixture;
		}

		async function listed(
			kind: string,
			runsDirectory: string,
		): Promise<readonly string[]> {
			const recorder = recordOutput();
			await runList({ kind, runsDirectory }, recorder.output);

			return lines(recorder.stdout).map((line) =>
				line.split("\t").slice(0, 2).join("\t"),
			);
		}

		it("prints each record's short id beside its Record ID", async () => {
			const fixture = await numberedFixture();
			const { runsDirectory, replayableRun, unreplayableRun } = fixture;
			const { lineage, timestamp } = fixture.stageAttempt;
			const { caseId, uuid } = fixture.sessionAttempt;

			expect(await listed("runs", runsDirectory)).toEqual([
				`run:${unreplayableRun}\taudit-log/r1`,
				`run:${replayableRun}\taudit-log/r2`,
			]);
			expect(await listed("checkpoints", runsDirectory)).toEqual([
				`checkpoint:${replayableRun}/build\taudit-log/r2/s2`,
				`checkpoint:${replayableRun}/discuss\taudit-log/r2/s1`,
			]);
			expect(await listed("attempts", runsDirectory)).toEqual([
				`attempt:session:${caseId}/${uuid}\tsmoke/r1`,
				`attempt:stage:${lineage}/${timestamp}\taudit-log/r3`,
			]);
			expect(await listed("groups", runsDirectory)).toEqual([
				`group:${fixture.groupId}\taudit-log/g4`,
			]);
		});

		it("labels the checkpoint taken after task setup s0", async () => {
			const fixture = await numberedFixture();
			await fixture.writeInitialCheckpoint();

			expect(await listed("checkpoints", fixture.runsDirectory)).toContain(
				`checkpoint:${fixture.replayableRun}/initial\taudit-log/r2/s0`,
			);
		});
	});

	describe("when a checkpoint stage directory holds no record", () => {
		it("still prints the recorded checkpoints and names it on stderr", async () => {
			const fixture = await writtenFixture();
			await fixture.writeEmptyCheckpointDirectory("zz-empty");
			const recorder = recordOutput();

			await runList(
				{ kind: "checkpoints", runsDirectory: fixture.runsDirectory },
				recorder.output,
			);

			expect(ids(recorder.stdout)).toEqual([
				`checkpoint:${fixture.replayableRun}/build`,
				`checkpoint:${fixture.replayableRun}/discuss`,
			]);
			expect(recorder.stderr.join("")).toContain(
				`checkpoint:${fixture.replayableRun}/zz-empty`,
			);
		});

		it("gives the missing record a plain incomplete reason, not a raw ENOENT", async () => {
			const fixture = await writtenFixture();
			await fixture.writeEmptyCheckpointDirectory("zz-empty");
			const recorder = recordOutput();

			await runList(
				{ kind: "checkpoints", runsDirectory: fixture.runsDirectory },
				recorder.output,
			);

			const reasons = recorder.stderr.join("");
			expect(reasons).not.toContain("ENOENT");
			expect(reasons).toContain("incomplete");
		});
	});

	it("prints one line per confirmation group with its case, mode, and rep count", async () => {
		const fixture = await writtenFixture();
		const recorder = recordOutput();

		await runList(
			{ kind: "groups", runsDirectory: fixture.runsDirectory },
			recorder.output,
		);

		expect(lines(recorder.stdout)).toEqual([
			`group:${fixture.groupId}\t-\taudit-log\tstage\t2 reps`,
		]);
	});

	it("prints one line per comparison report with its case and rep counts", async () => {
		const fixture = await writtenFixture();
		const recorder = recordOutput();

		await runList(
			{ kind: "comparisons", runsDirectory: fixture.runsDirectory },
			recorder.output,
		);

		expect(lines(recorder.stdout)).toEqual([
			`comparison:${fixture.comparisonDigest}\t2 cases\t4 reps`,
		]);
	});

	it.each([1, 2, 3, 4] as const)(
		"lists and shows a version-%i comparison without changing its bytes",
		async (version) => {
			const fixture = await writtenFixture();
			const paths = comparisonReportPaths(
				fixture.runsDirectory,
				fixture.comparisonDigest,
			);
			const current = parseComparisonReport(
				await Bun.file(paths.reportFile).text(),
			);
			if (current.schemaVersion !== 5 || "samplingUnit" in current) {
				throw new Error(
					"expected the fixture to write a multi-case version-5 report",
				);
			}
			const text = `${JSON.stringify(
				legacyComparisonReport(current, version),
				null,
				2,
			)}\n`;
			await Bun.write(paths.reportFile, text);

			const listed = recordOutput();
			await runList(
				{ kind: "comparisons", runsDirectory: fixture.runsDirectory },
				listed.output,
			);
			expect(lines(listed.stdout)).toEqual([
				`comparison:${fixture.comparisonDigest}\t2 cases\t4 reps`,
			]);
			expect(listed.stderr).toEqual([]);

			const shownJson = recordOutput();
			await runShow(
				{
					id: `comparison:${fixture.comparisonDigest}`,
					json: true,
					runsDirectory: fixture.runsDirectory,
				},
				shownJson.output,
			);
			expect(shownJson.stdout.join("")).toBe(text);
			expect(parseComparisonReport(text).schemaVersion).toBe(version);

			const shownSummary = recordOutput();
			await runShow(
				{
					id: `comparison:${fixture.comparisonDigest}`,
					json: false,
					runsDirectory: fixture.runsDirectory,
				},
				shownSummary.output,
			);
			expect(shownSummary.stdout.join("")).toContain("2 cases");
		},
	);

	it("prints one line per attempt of both kinds with its case, outcome, and model", async () => {
		const fixture = await writtenFixture();
		const recorder = recordOutput();

		await runList(
			{ kind: "attempts", runsDirectory: fixture.runsDirectory },
			recorder.output,
		);

		expect(lines(recorder.stdout)).toEqual([
			`attempt:session:${fixture.sessionAttempt.caseId}/${fixture.sessionAttempt.uuid}\t-\tsmoke\tSUCCESSFUL\tsonnet`,
			`attempt:stage:${fixture.stageAttempt.lineage}/${fixture.stageAttempt.timestamp}\t-\tbuild\tA CONTINUE\tsonnet`,
		]);
	});

	it("reads an attempt whose exact-repeat evidence has a maximum-length preview", async () => {
		const fixture = await writtenFixture();
		const recorder = recordOutput();

		await runList(
			{ kind: "attempts", runsDirectory: fixture.runsDirectory },
			recorder.output,
		);

		expect(lines(recorder.stdout)).toContain(
			`attempt:session:${fixture.sessionAttempt.caseId}/${fixture.sessionAttempt.uuid}\t-\tsmoke\tSUCCESSFUL\tsonnet`,
		);
		expect(recorder.stderr).toEqual([]);
	});

	it.each([...LIST_KINDS])(
		"prints ids show accepts back for %s",
		async (kind) => {
			const fixture = await writtenFixture();
			const recorder = recordOutput();
			await runList(
				{ kind, runsDirectory: fixture.runsDirectory },
				recorder.output,
			);
			const printed = ids(recorder.stdout);

			expect(printed.length).toBeGreaterThan(0);
			for (const id of printed) {
				const shown = recordOutput();
				await runShow(
					{ id, json: true, runsDirectory: fixture.runsDirectory },
					shown.output,
				);

				expect(shown.stdout.join("")).not.toBe("");
				expect(parseRecordId(id)).toBeDefined();
			}
		},
	);

	describe("when one record cannot be read", () => {
		it("still prints the valid lines and names the unreadable one on stderr", async () => {
			const fixture = await writtenFixture();
			await fixture.writeUnreadableGroup("group-broken");
			await fixture.writeGroupWithoutCaseId("group-2");
			const recorder = recordOutput();

			await runList(
				{ kind: "groups", runsDirectory: fixture.runsDirectory },
				recorder.output,
			);

			expect(ids(recorder.stdout)).toEqual([
				`group:${fixture.groupId}`,
				"group:group-2",
			]);
			expect(recorder.stderr.join("")).toContain("group:group-broken");
		});
	});

	describe("when an attempt directory holds no record", () => {
		it("still prints the recorded attempts and names it on stderr", async () => {
			const fixture = await writtenFixture();
			await fixture.writeEmptyAttemptDirectory("smoke", RECORDLESS_UUID);
			const recorder = recordOutput();

			await runList(
				{ kind: "attempts", runsDirectory: fixture.runsDirectory },
				recorder.output,
			);

			expect(ids(recorder.stdout)).toEqual([
				`attempt:session:${fixture.sessionAttempt.caseId}/${fixture.sessionAttempt.uuid}`,
				`attempt:stage:${fixture.stageAttempt.lineage}/${fixture.stageAttempt.timestamp}`,
			]);
			expect(recorder.stderr.join("")).toContain(
				`attempt:session:smoke/${RECORDLESS_UUID}`,
			);
		});

		it("gives the missing record a plain incomplete reason, not a raw ENOENT", async () => {
			const fixture = await writtenFixture();
			await fixture.writeEmptyAttemptDirectory("smoke", RECORDLESS_UUID);
			const recorder = recordOutput();

			await runList(
				{ kind: "attempts", runsDirectory: fixture.runsDirectory },
				recorder.output,
			);

			const reasons = recorder.stderr.join("");
			expect(reasons).not.toContain("ENOENT");
			expect(reasons).toContain("incomplete");
		});
	});

	describe("when a reason names a file under the control root", () => {
		/**
		 * The production runs directory is under the control root and the README
		 * tells a session to paste this output onto a card other people read, so
		 * a reason naming an absolute path there discloses the home directory
		 * for nothing.
		 */
		it("names it relative to the control root", async () => {
			const root = await mkdtemp(join(CONTROL_DIR, "rehearse-list-test-"));
			roots.push(root);
			const fixture = new RecordedRunsFixture(root);
			await fixture.writeStoppedRunWithoutManifest();
			const recorder = recordOutput();

			await runList({ kind: "runs", runsDirectory: root }, recorder.output);

			const reasons = recorder.stderr.join("");
			expect(reasons).toContain(
				`${basename(root)}/${fixture.stoppedRun}.checkpoints/manifest.json`,
			);
			expect(reasons).not.toContain(homedir());
		});
	});

	describe("when nothing has been recorded", () => {
		it.each([
			"runs",
			"checkpoints",
			"attempts",
			"groups",
			"comparisons",
		] as const)("prints nothing for %s", async (kind) => {
			const recorder = recordOutput();

			await runList(
				{ kind, runsDirectory: join(await emptyRunsDirectory(), "absent") },
				recorder.output,
			);

			expect(recorder.stdout).toEqual([]);
		});
	});

	describe("when the kind is not one of the six", () => {
		it("refuses it as a usage error naming the accepted kinds", async () => {
			const recorder = recordOutput();

			const failure = await failureOf(
				runList(
					{ kind: "bogus", runsDirectory: await emptyRunsDirectory() },
					recorder.output,
				),
			);

			expect(failure).toBeInstanceOf(UsageError);
			expect(failure.message).toContain("cases");
			expect(failure.message).toContain("comparisons");
			expect(recorder.stdout).toEqual([]);
		});
	});
});
