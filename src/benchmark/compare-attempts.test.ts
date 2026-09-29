import { afterEach, describe, expect, it } from "bun:test";
import { Glob } from "bun";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { BaselineGroupRequest } from "./compare-attempts";
import { compareAttempts } from "./compare-attempts";
import { ComparisonEvidenceFixture } from "./comparison-evidence-test-support";
import { parseComparisonReport } from "./comparison-record";
import type { ComparisonArm } from "./comparison-record";
import type { ConfirmationMode } from "./confirmation-record";
import { confirmationGroupRecordSchema } from "./confirmation-record";
import { measureCorpusVersion } from "./corpus-version";
import { RefusedPreconditionError } from "./exit-codes";
import { confirmationGroupPaths } from "./run-layout";
import { claimShortId } from "./short-id";

const CASE_ID = "build-checkpoint";
const RUN = "2026-09-29T10-00-00.000Z";
const STAGE = "build";

interface Checkpoint {
	readonly run: string;
	readonly stage: string;
}

const REPLAYED: Checkpoint = { run: RUN, stage: STAGE };

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

async function temporaryDirectory(prefix: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), prefix));
	temporaryDirectories.push(directory);

	return directory;
}

function groupIdFor(role: ComparisonArm): string {
	return `${CASE_ID}-${role}`;
}

type CorpusFiles = Readonly<Record<string, string>>;

/**
 * Two stage groups replayed at one checkpoint, as arms A and B, each with the
 * corpus version its reps ran against, and a baseline runner that records
 * what it was asked to run and answers with a third recorded group.
 */
class RecordedArms {
	public readonly baselineRequests: BaselineGroupRequest[] = [];

	private constructor(
		public readonly runsDirectory: string,
		private readonly fixture: ComparisonEvidenceFixture,
	) {}

	public static async create(): Promise<RecordedArms> {
		const runsDirectory = await temporaryDirectory("rehearse-compare-runs-");
		const fixture = new ComparisonEvidenceFixture(
			await temporaryDirectory("rehearse-compare-fixture-"),
			[CASE_ID],
		);
		await fixture.write();

		return new RecordedArms(runsDirectory, fixture);
	}

	public async recordArm(
		role: "baseline" | "candidate",
		corpus: CorpusFiles,
		source: Checkpoint = REPLAYED,
	): Promise<string> {
		await this.recordGroup(role, { corpus, source });

		return groupIdFor(role);
	}

	/** Arm A as a group recorded before groups measured their corpus. */
	public async recordUnversionedArmA(): Promise<string> {
		await this.recordGroup("baseline", { source: REPLAYED });

		return groupIdFor("baseline");
	}

	/** Arm A as a group whose claim predates recording its checkpoint. */
	public async recordUnplacedArmA(corpus: CorpusFiles): Promise<string> {
		await this.recordGroup("baseline", { corpus });

		return groupIdFor("baseline");
	}

	/** Arm A as a whole-pipeline group, which replays no single stage. */
	public async recordPipelineArmA(corpus: CorpusFiles): Promise<string> {
		await this.recordGroup("baseline", {
			corpus,
			source: REPLAYED,
			mode: "pipeline",
		});

		return groupIdFor("baseline");
	}

	public baselineCorpusDirectory(): string {
		const [request] = this.baselineRequests;
		if (request === undefined) {
			throw new Error("Expected a baseline group to have run");
		}

		return request.corpusDirectory;
	}

	/** Rewrites a recorded arm's worker model, a controlled input. */
	public async useModel(groupId: string, model: string): Promise<void> {
		const { groupFile } = confirmationGroupPaths(this.runsDirectory, groupId);
		const group = confirmationGroupRecordSchema.parse(
			JSON.parse(await Bun.file(groupFile).text()),
		);
		await Bun.write(
			groupFile,
			`${JSON.stringify({ ...group, inputs: { ...group.inputs, model } }, null, 2)}\n`,
		);
	}

	public readonly runBaselineGroup = async (
		request: BaselineGroupRequest,
	): Promise<string> => {
		this.baselineRequests.push(request);
		await this.recordGroup("control", {
			source: { run: request.run, stage: request.stage },
		});

		return groupIdFor("control");
	};

	private async recordGroup(
		role: ComparisonArm,
		recording: {
			readonly corpus?: CorpusFiles;
			readonly source?: Checkpoint;
			readonly mode?: ConfirmationMode;
		},
	): Promise<void> {
		const groupId = groupIdFor(role);
		const paths = confirmationGroupPaths(this.runsDirectory, groupId);
		await mkdir(dirname(paths.directory), { recursive: true });
		await cp(dirname(this.fixture.groupFile(CASE_ID, role)), paths.directory, {
			recursive: true,
		});
		const group = confirmationGroupRecordSchema.parse(
			JSON.parse(await Bun.file(paths.groupFile).text()),
		);
		const corpusVersion =
			recording.corpus === undefined
				? undefined
				: await this.measure(recording.corpus);
		await Bun.write(
			paths.groupFile,
			`${JSON.stringify(
				{
					...group,
					mode: recording.mode ?? group.mode,
					inputs: { ...group.inputs, corpusVersion },
				},
				null,
				2,
			)}\n`,
		);
		await claimShortId(
			this.runsDirectory,
			CASE_ID,
			recording.source === undefined
				? { kind: "group", groupId }
				: { kind: "group", groupId, source: recording.source },
		);
	}

	private async measure(
		corpus: CorpusFiles,
	): Promise<{ readonly kind: "version"; readonly digest: string }> {
		const root = await temporaryDirectory("rehearse-compare-corpus-");
		for (const [path, content] of Object.entries(corpus)) {
			await mkdir(dirname(join(root, path)), { recursive: true });
			await Bun.write(join(root, path), content);
		}
		const measurement = await measureCorpusVersion(this.runsDirectory, {
			kind: "directory",
			root,
		});
		if (measurement.kind !== "version") {
			throw new Error(`Expected a corpus version: ${measurement.refusal}`);
		}

		return measurement;
	}
}

async function refusalOf(attempt: Promise<unknown>): Promise<Error> {
	try {
		await attempt;
	} catch (error) {
		if (error instanceof RefusedPreconditionError) {
			return error;
		}
		throw error;
	}
	throw new Error("Expected the comparison to be refused");
}

const SHARED = {
	"CLAUDE.md": "global instructions\n",
	"skills/review/SKILL.md": "review\n",
};

describe(compareAttempts.name, () => {
	describe("when arms A and B hold identical corpora", () => {
		it("refuses before running a baseline group", async () => {
			const arms = await RecordedArms.create();
			const armA = await arms.recordArm("baseline", SHARED);
			const armB = await arms.recordArm("candidate", SHARED);

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(
				"arms A and B hold identical corpora, so nothing is under test",
			);
			expect(arms.baselineRequests).toEqual([]);
		});
	});

	describe("when arms A and B differ in more than one corpus unit", () => {
		it("refuses and names every differing unit", async () => {
			const arms = await RecordedArms.create();
			const armA = await arms.recordArm("baseline", SHARED);
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"agents/helper.md": "helper\n",
				"skills/build/SKILL.md": "build\n",
			});

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(
				"arms A and B differ in more than one corpus unit: agents/helper.md, skills/build/",
			);
			expect(arms.baselineRequests).toEqual([]);
		});
	});

	describe("when arms A and B differ in a unit that is not a skill", () => {
		it("refuses and points at a manifest-supplied control", async () => {
			const arms = await RecordedArms.create();
			const armA = await arms.recordArm("baseline", SHARED);
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"CLAUDE.md": "revised global instructions\n",
			});

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(
				"the arms differ in CLAUDE.md, which is not a skill; supply the control through a comparison manifest",
			);
			expect(arms.baselineRequests).toEqual([]);
		});
	});

	describe("when arms A and B replayed different checkpoints", () => {
		it("refuses and names both checkpoints", async () => {
			const arms = await RecordedArms.create();
			const armA = await arms.recordArm("baseline", SHARED);
			const armB = await arms.recordArm(
				"candidate",
				{ ...SHARED, "skills/build/SKILL.md": "build\n" },
				{ run: RUN, stage: "review" },
			);

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(
				`arms A and B replayed different checkpoints: ${RUN} ${STAGE} and ${RUN} review`,
			);
			expect(arms.baselineRequests).toEqual([]);
		});
	});

	describe("when an arm records no checkpoint it replayed", () => {
		it("refuses and names the group", async () => {
			const arms = await RecordedArms.create();
			const armA = await arms.recordUnplacedArmA(SHARED);
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"skills/build/SKILL.md": "build\n",
			});

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(
				`group ${armA} records no checkpoint it replayed`,
			);
		});
	});

	describe("when an arm records no corpus version", () => {
		it("refuses and names the group", async () => {
			const arms = await RecordedArms.create();
			const armA = await arms.recordUnversionedArmA();
			const armB = await arms.recordArm("candidate", SHARED);

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(`group ${armA} records no corpus version`);
		});
	});

	describe("when an arm is not a stage group", () => {
		it("refuses and names the group and its mode", async () => {
			const arms = await RecordedArms.create();
			const armA = await arms.recordPipelineArmA(SHARED);
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"skills/build/SKILL.md": "build\n",
			});

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(
				`group ${armA} is a pipeline group; only stage groups replay one checkpoint`,
			);
		});
	});

	describe("when arms A and B ran with different controlled inputs", () => {
		it("refuses and names the differing field before running a baseline group", async () => {
			const arms = await RecordedArms.create();
			const armA = await arms.recordArm("baseline", SHARED);
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"skills/build/SKILL.md": "build\n",
			});
			await arms.useModel(armB, "haiku");

			const refusal = await refusalOf(
				compareAttempts(
					{ runsDirectory: arms.runsDirectory, armA, armB },
					{ runBaselineGroup: arms.runBaselineGroup },
				),
			);

			expect(refusal.message).toBe(
				`case ${CASE_ID} arms baseline and candidate field inputs.model differs`,
			);
			expect(arms.baselineRequests).toEqual([]);
		});
	});

	describe("when arms A and B differ in one skill", () => {
		it("runs the baseline group on arm A without that skill, with arm A's inputs", async () => {
			const arms = await RecordedArms.create();
			const armA = await arms.recordArm("baseline", {
				...SHARED,
				"skills/build/SKILL.md": "build\n",
			});
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"skills/build/SKILL.md": "revised build\n",
			});

			await compareAttempts(
				{ runsDirectory: arms.runsDirectory, armA, armB },
				{ runBaselineGroup: arms.runBaselineGroup },
			);

			const corpusDirectory = arms.baselineCorpusDirectory();
			expect(arms.baselineRequests).toEqual([
				{
					run: RUN,
					stage: STAGE,
					corpusDirectory,
					reps: 2,
					model: "sonnet",
					effort: undefined,
					judgeModel: "opus",
					judgeEffort: undefined,
					sessionBudgetUsd: 5,
				},
			]);
			expect(dirname(corpusDirectory)).toBe(
				join(arms.runsDirectory, "baseline-corpora"),
			);
			const corpus = await Array.fromAsync(
				new Glob("**/*").scan({ cwd: corpusDirectory }),
			);
			expect(corpus.toSorted()).toEqual([
				"CLAUDE.md",
				"skills/review/SKILL.md",
			]);
			const review = Bun.file(join(corpusDirectory, "skills/review/SKILL.md"));
			expect(await review.text()).toBe("review\n");
		});
	});

	describe("when the baseline group has run", () => {
		it("writes the report of arm A against arm B with the derived baseline, and how it was derived", async () => {
			const arms = await RecordedArms.create();
			const armA = await arms.recordArm("baseline", {
				...SHARED,
				"skills/build/SKILL.md": "build\n",
			});
			const armB = await arms.recordArm("candidate", {
				...SHARED,
				"skills/build/SKILL.md": "revised build\n",
			});

			const { reportFile } = await compareAttempts(
				{ runsDirectory: arms.runsDirectory, armA, armB },
				{ runBaselineGroup: arms.runBaselineGroup },
			);

			const report = parseComparisonReport(await Bun.file(reportFile).text());
			expect(reportFile).toBe(
				join(
					arms.runsDirectory,
					"comparisons",
					report.manifest.sha256,
					"report.json",
				),
			);
			const derivation: unknown = await Bun.file(
				join(dirname(reportFile), "baseline.json"),
			).json();
			expect(derivation).toEqual({
				schemaVersion: 1,
				kind: "derived",
				skillUnderTest: "skills/build/",
				arms: {
					baseline: armA,
					candidate: armB,
					control: groupIdFor("control"),
				},
				baselineCorpus: basename(arms.baselineCorpusDirectory()),
			});
		});
	});
});
