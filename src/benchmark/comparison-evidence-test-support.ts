import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type {
	ConfirmationGroupRecord,
	ConfirmationRepRecord,
} from "./confirmation-record";
import {
	confirmationGroupRecordSchema,
	confirmationRepRecordSchema,
	parseConfirmationRepRecord,
} from "./confirmation-record";
import type { ComparisonArm } from "./comparison-record";
import type { StageGradingRecord } from "./comparison-stage-grading";

export function digest(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

export class ComparisonEvidenceFixture {
	/**
	 * Comparability requires every arm's group to record the case its manifest
	 * entry names, so the ids are declared once here and read by both sides.
	 * Composing several fixture roots into one manifest needs them unique across
	 * roots, which is what naming them at construction is for.
	 */
	public constructor(
		private readonly root: string,
		public readonly caseIds: readonly string[] = ["case-1", "case-2"],
	) {}

	public get manifestFile(): string {
		return join(this.root, "comparison.json");
	}

	public groupFile(caseId: string, role: ComparisonArm): string {
		return join(this.groupDirectory(caseId, role), "group.json");
	}

	public repFile(caseId: string, role: ComparisonArm, ordinal: number): string {
		return join(
			this.groupDirectory(caseId, role),
			"reps",
			`${caseId}-${role}-rep-${ordinal}`,
			"rep.json",
		);
	}

	public scorecardFile(
		caseId: string,
		role: ComparisonArm,
		ordinal: number,
	): string {
		return join(
			dirname(this.repFile(caseId, role, ordinal)),
			"stages",
			"build.json",
		);
	}

	public async writeScorecard(
		caseId: string,
		role: ComparisonArm,
		ordinal: number,
		scorecard: StageGradingRecord,
	): Promise<void> {
		await Bun.write(
			this.scorecardFile(caseId, role, ordinal),
			`${JSON.stringify(scorecard, null, 2)}\n`,
		);
	}

	public corpusFile(caseId: string, role: ComparisonArm): string {
		return join(
			this.groupDirectory(caseId, role),
			"inputs",
			"corpus",
			"build",
			"SKILL.md",
		);
	}

	public async write(): Promise<void> {
		const cases = [];
		for (const caseId of this.caseIds) {
			const arms = {
				baseline: await this.writeGroup(caseId, "baseline"),
				candidate: await this.writeGroup(caseId, "candidate"),
				control: await this.writeGroup(caseId, "control"),
			};
			cases.push({ caseId, arms });
		}

		await Bun.write(
			this.manifestFile,
			`${JSON.stringify({ schemaVersion: 1, cases }, null, 2)}\n`,
		);
	}

	public async pointFrozenInputAt(
		kind: ConfirmationGroupRecord["inputs"]["files"][number]["kind"],
		path: string,
	): Promise<void> {
		const sha256 = digest(await Bun.file(path).text());
		for (const caseId of this.caseIds) {
			for (const role of ["baseline", "candidate", "control"] as const) {
				const groupFile = this.groupFile(caseId, role);
				const group = confirmationGroupRecordSchema.parse(
					JSON.parse(await Bun.file(groupFile).text()),
				);
				const changed = confirmationGroupRecordSchema.parse({
					...group,
					inputs: {
						...group.inputs,
						files: group.inputs.files.map((file) =>
							file.kind === kind ? { kind: file.kind, path, sha256 } : file,
						),
					},
				});
				await Bun.write(groupFile, `${JSON.stringify(changed, null, 2)}\n`);
			}
		}
	}

	public async addCorpusFile(
		caseId: string,
		role: ComparisonArm,
		path: string,
		content: string,
	): Promise<void> {
		await Bun.write(join(this.groupDirectory(caseId, role), path), content);
		const groupFile = this.groupFile(caseId, role);
		const group = confirmationGroupRecordSchema.parse(
			JSON.parse(await Bun.file(groupFile).text()),
		);
		const changed = confirmationGroupRecordSchema.parse({
			...group,
			inputs: {
				...group.inputs,
				files: [
					...group.inputs.files,
					{ kind: "corpus", path, sha256: digest(content) },
				],
			},
		});
		await Bun.write(groupFile, `${JSON.stringify(changed, null, 2)}\n`);
	}

	public async useJudgeModel(
		caseId: string,
		judgeModel: string,
	): Promise<void> {
		for (const role of ["baseline", "candidate", "control"] as const) {
			const groupFile = this.groupFile(caseId, role);
			const group = confirmationGroupRecordSchema.parse(
				JSON.parse(await Bun.file(groupFile).text()),
			);
			await Bun.write(
				groupFile,
				`${JSON.stringify(
					{
						...group,
						inputs: { ...group.inputs, judgeModel },
					},
					null,
					2,
				)}\n`,
			);
		}
	}

	public async changePipelineTarget(
		caseId: string,
		role: ComparisonArm,
	): Promise<void> {
		const groupFile = this.groupFile(caseId, role);
		const group = confirmationGroupRecordSchema.parse(
			JSON.parse(await Bun.file(groupFile).text()),
		);
		const pipeline = group.inputs.files.find(({ kind }) => kind === "pipeline");
		if (pipeline === undefined) {
			throw new Error("Expected a frozen pipeline input");
		}
		const content = `${JSON.stringify({
			stages: ["build"],
			target: {
				checks: [{ command: ["bun", "run", "different"] }],
				integrityFiles: ["package.json"],
			},
		})}\n`;
		await Bun.write(
			join(this.groupDirectory(caseId, role), pipeline.path),
			content,
		);
		const changed = confirmationGroupRecordSchema.parse({
			...group,
			inputs: {
				...group.inputs,
				files: group.inputs.files.map((file) =>
					file.kind === "pipeline"
						? { kind: file.kind, path: file.path, sha256: digest(content) }
						: file,
				),
			},
		});
		await Bun.write(groupFile, `${JSON.stringify(changed, null, 2)}\n`);
	}

	public async usePipelineCheckpoints(
		changedWorkflowRole?: ComparisonArm,
	): Promise<void> {
		for (const caseId of this.caseIds) {
			for (const role of ["baseline", "candidate", "control"] as const) {
				const groupFile = this.groupFile(caseId, role);
				const group = confirmationGroupRecordSchema.parse(
					JSON.parse(await Bun.file(groupFile).text()),
				);
				const checkpoint = {
					stage: "initial",
					targetSha: role.slice(0, 1).repeat(40),
					lineage: `${role}-derived-lineage`,
					upstream: `${role}-derived-upstream`,
					model: "sonnet",
					corpusFiles: [],
					artifacts: [],
					workflowState:
						role === changedWorkflowRole
							? [
									{
										path: "backlog/tasks/act.md",
										sha256: "f".repeat(64),
									},
								]
							: [],
				};
				const checkpointPath = join(
					this.groupDirectory(caseId, role),
					"inputs/checkpoint/checkpoint.json",
				);
				const checkpointText = `${JSON.stringify(checkpoint, null, 2)}\n`;
				await Bun.write(checkpointPath, checkpointText);
				const upstreamCorpus = `${role} upstream corpus\n`;
				const upstreamCorpusPath = join(
					this.groupDirectory(caseId, role),
					"inputs/corpus/discuss/SKILL.md",
				);
				await Bun.write(upstreamCorpusPath, upstreamCorpus);
				const changedGroup = confirmationGroupRecordSchema.parse({
					...group,
					mode: "pipeline",
					inputs: {
						...group.inputs,
						files: [
							...group.inputs.files.map((file) =>
								file.path === "inputs/corpus/discuss/SKILL.md"
									? {
											kind: file.kind,
											path: file.path,
											sha256: digest(upstreamCorpus),
										}
									: file,
							),
							{
								kind: "checkpoint",
								path: relative(
									this.groupDirectory(caseId, role),
									checkpointPath,
								),
								sha256: digest(checkpointText),
							},
						],
					},
				});
				await Bun.write(
					groupFile,
					`${JSON.stringify(changedGroup, null, 2)}\n`,
				);

				for (const ordinal of [1, 2]) {
					const repFile = this.repFile(caseId, role, ordinal);
					const rep = parseConfirmationRepRecord(
						await Bun.file(repFile).text(),
					);
					await Bun.write(
						repFile,
						`${JSON.stringify(
							{
								...rep,
								mode: "pipeline",
								finalOutcome: {
									status: "JUDGED",
									verdict: "PASS",
									evidence: {
										resultSha: "e".repeat(40),
										recordFile: "final.json",
									},
								},
							},
							null,
							2,
						)}\n`,
					);
				}
			}
		}
	}

	private groupDirectory(caseId: string, role: ComparisonArm): string {
		return join(this.root, "groups", `${caseId}-${role}`);
	}

	private static lineage(
		caseId: string,
	): ConfirmationGroupRecord["inputs"]["lineage"] {
		return {
			kind: "CHECKPOINT",
			lineage: `${caseId}-checkpoint`,
			targetSha: (caseId === "case-1" ? "a" : "b").repeat(40),
		};
	}

	private async writeFrozenInputs(
		caseId: string,
		role: ComparisonArm,
	): Promise<ConfirmationGroupRecord["inputs"]["files"]> {
		const directory = this.groupDirectory(caseId, role);
		const files = [
			{
				kind: "checkpoint" as const,
				path: "inputs/checkpoint/state.json",
				content: `${caseId} checkpoint\n`,
			},
			{
				kind: "corpus" as const,
				path: "inputs/corpus/build/SKILL.md",
				content: `${role} corpus\n`,
			},
			{
				kind: "corpus" as const,
				path: "inputs/corpus/discuss/SKILL.md",
				content: `${caseId} upstream corpus\n`,
			},
			{
				kind: "instructions" as const,
				path: "inputs/instructions.md",
				content: `${role} corpus\n`,
			},
			{
				kind: "pipeline" as const,
				path: "inputs/pipeline.json",
				content: '{"stages":["build"]}\n',
			},
			{
				kind: "product-brief" as const,
				path: "inputs/product-brief.md",
				content: `${caseId} brief\n`,
			},
			{
				kind: "rubric" as const,
				path: "inputs/rubric.json",
				content: `${caseId} rubric\n`,
			},
			{
				kind: "task" as const,
				path: "inputs/task.md",
				content: `${caseId} task\n`,
			},
		];
		for (const file of files) {
			const path = join(directory, file.path);
			await mkdir(dirname(path), { recursive: true });
			await Bun.write(path, file.content);
		}

		return files.map(({ content, kind, path }) => ({
			kind,
			path,
			sha256: digest(content),
		}));
	}

	/**
	 * The build stage's scorecard: the baseline arm, stripped of the skill
	 * under test, fires the scope blocker that the corpus arms clear.
	 */
	public static scorecard(role: ComparisonArm): StageGradingRecord {
		return {
			stage: "build",
			input: { artifact: { path: "plan.md", content: `${role} build plan` } },
			grade: {
				hardBlockers: [
					{
						id: "scope-declared",
						status: role === "baseline" ? "FAIL" : "PASS",
					},
				],
				dimensions: [{ id: "clarity", grade: role === "baseline" ? "C" : "A" }],
				grade: "A",
				verdict: "CONTINUE",
			},
		};
	}

	private static repRecord(
		caseId: string,
		role: ComparisonArm,
		ordinal: number,
	): ConfirmationRepRecord {
		const groupId = `${caseId}-${role}`;
		const repId = `${groupId}-rep-${ordinal}`;
		const resultEvidence = {
			resultSha: "e".repeat(40),
			recordFile: "stages/build.json",
		};

		return confirmationRepRecordSchema.parse({
			schemaVersion: 1,
			caseId,
			groupId,
			repId,
			ordinal,
			mode: "stage",
			worktreePath: `/worktrees/${repId}`,
			lineage: ComparisonEvidenceFixture.lineage(caseId),
			outcome: "SUCCESSFUL",
			stages: [
				{
					stage: "build",
					status: "JUDGED",
					grade: "A",
					verdict: "CONTINUE",
					elapsedMs: 10,
					evidence: resultEvidence,
				},
			],
			finalOutcome: { status: "NOT_APPLICABLE" },
			metrics: {
				status: "COMPLETE",
				calls: [
					{
						role: "worker",
						metrics: {
							costUsd: ordinal,
							inputTokens: ordinal * 10,
							outputTokens: ordinal * 2,
							cacheReadTokens: ordinal * 3,
							cacheWriteTokens: ordinal * 4,
							turns: ordinal,
						},
					},
				],
			},
			workerTrajectorySteps: ordinal,
			elapsedMs: ordinal * 100,
		});
	}

	private async writeGroup(
		caseId: string,
		role: ComparisonArm,
	): Promise<string> {
		const groupId = `${caseId}-${role}`;
		const groupDirectory = this.groupDirectory(caseId, role);
		const repRecords = [];
		for (const ordinal of [1, 2]) {
			const recordFile = this.repFile(caseId, role, ordinal);
			await mkdir(dirname(recordFile), { recursive: true });
			await Bun.write(
				recordFile,
				`${JSON.stringify(ComparisonEvidenceFixture.repRecord(caseId, role, ordinal), null, 2)}\n`,
			);
			await this.writeScorecard(
				caseId,
				role,
				ordinal,
				ComparisonEvidenceFixture.scorecard(role),
			);
			repRecords.push({
				repId: `${groupId}-rep-${ordinal}`,
				ordinal,
				path: relative(groupDirectory, recordFile),
			});
		}

		const group = confirmationGroupRecordSchema.parse({
			schemaVersion: 1,
			caseId,
			groupId,
			mode: "stage",
			reps: 2,
			declaredStages: ["build"],
			inputs: {
				lineage: ComparisonEvidenceFixture.lineage(caseId),
				files: await this.writeFrozenInputs(caseId, role),
				model: "sonnet",
				judgeModel: "opus",
				sessionBudgetUsd: 5,
				pipelinePath: "pipelines/default.json",
			},
			projectedCost: {
				reps: 2,
				perRepMaximumUsd: 20,
				totalMaximumUsd: 40,
			},
			approval: { method: "yes", approved: true },
			repRecords,
			reportFile: "report.json",
			makespanMs: 200,
		});
		const groupFile = this.groupFile(caseId, role);
		await Bun.write(groupFile, `${JSON.stringify(group, null, 2)}\n`);

		return relative(dirname(this.manifestFile), groupFile);
	}
}
