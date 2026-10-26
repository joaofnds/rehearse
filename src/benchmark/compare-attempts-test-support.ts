import { dirname, join, relative } from "node:path";

import writeReplayableRunManifest from "#cli/replay-test-support";

import type { ArmGroupRequest } from "./compare-attempts";
import { useModel } from "./compare-attempts-evidence-test-fixtures";
import type {
	Checkpoint,
	CorpusFiles,
	Recording,
} from "./compare-attempts-group-recording-fixture";
import RecordedComparisonGroupWriter from "./compare-attempts-group-recording-fixture";
import { ComparisonEvidenceFixture } from "./comparison-evidence-test-support";
import type { ComparisonArm } from "./comparison-record";
import { CONTROL_DIR } from "./config";
import { confirmationGroupRecordSchema } from "./confirmation-record";
import { benchmarkRunPaths, confirmationGroupPaths } from "./run-layout";

const FIXTURE_JSON_INDENT_SPACES = 2;

const CASE_ID = "build-checkpoint";

const RUN = "2026-09-29T10-00-00.000Z";

const STAGE = "build";

const REPLAYED: Checkpoint = { run: RUN, stage: STAGE };

const STAGE_RUBRIC_PATH = "cases/audit-log/rubrics/build.json";

/** The rubric the replayed run's pipeline names for its build stage. */
const STAGE_RUBRIC = await Bun.file(STAGE_RUBRIC_PATH).text();

function groupIdFor(role: ComparisonArm): string {
	return `${CASE_ID}-${role}`;
}

/** The group an extension adds to the arm, beside the arm's first group. */
function moreGroupIdFor(role: ComparisonArm): string {
	return `${CASE_ID}-${role}-more`;
}

/**
 * Two stage groups replayed at one checkpoint, as arms A and B, each with the
 * corpus version its reps ran against, and a baseline runner that records
 * what it was asked to run and answers with a third recorded group. An
 * extension's runner answers each arm with a second group recorded as the
 * arm's first was, reading in its stage what the first read.
 */
class RecordedArms {
	public readonly baselineRequests: ArmGroupRequest[] = [];
	public readonly moreRequests: ArmGroupRequest[] = [];
	private readonly recordings = new Map<ComparisonArm, Recording>();
	private readonly groupWriter: RecordedComparisonGroupWriter;
	private readonly stageReads = new Map<string, string[]>();

	private constructor(
		public readonly runsDirectory: string,
		private readonly scratchDirectory: string,
		private readonly fixture: ComparisonEvidenceFixture,
	) {
		this.groupWriter = new RecordedComparisonGroupWriter({
			caseId: CASE_ID,
			rubric: STAGE_RUBRIC,
			runsDirectory,
			scratchDirectory,
		});
	}

	/**
	 * Records into `runsDirectory`, beside the manifest of the run its arms
	 * replayed, building its fixtures in `scratchDirectory`.
	 */
	public static async create(
		runsDirectory: string,
		scratchDirectory: string,
	): Promise<RecordedArms> {
		const fixture = new ComparisonEvidenceFixture(
			join(scratchDirectory, "fixture"),
			[CASE_ID],
		);
		await fixture.write();
		await writeReplayableRunManifest(RUN, runsDirectory);

		return new RecordedArms(runsDirectory, scratchDirectory, fixture);
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
			mode: "pipeline",
			source: REPLAYED,
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

	/**
	 * Records that the arm's replayed stage read a corpus file, as a stage
	 * replay freezes its stage's skills under inputs/corpus/<stage>/.
	 */
	public async readInStage(groupId: string, layoutPath: string): Promise<void> {
		this.stageReads.set(groupId, [
			...(this.stageReads.get(groupId) ?? []),
			layoutPath,
		]);
		const { groupFile } = confirmationGroupPaths(this.runsDirectory, groupId);
		const group = confirmationGroupRecordSchema.parse(
			JSON.parse(await Bun.file(groupFile).text()),
		);
		const stageFile = group.inputs.files.find(({ kind }) => kind === "corpus");
		if (stageFile === undefined) {
			throw new Error("Expected the fixture group to freeze a corpus file");
		}
		const read = {
			...stageFile,
			path: `inputs/corpus/${STAGE}/${layoutPath}`,
		};
		const directory = dirname(groupFile);
		await Bun.write(
			join(directory, read.path),
			Bun.file(join(directory, stageFile.path)),
		);
		await Bun.write(
			groupFile,
			`${JSON.stringify({ ...group, inputs: { ...group.inputs, files: [...group.inputs.files, read] } }, null, FIXTURE_JSON_INDENT_SPACES)}\n`,
		);
	}

	/** Points the replayed run's pipeline at another rubric for its stage. */
	public async nameStageRubric(rubric: string): Promise<void> {
		const { manifestFile } = benchmarkRunPaths(this.runsDirectory, RUN);
		const manifest = await Bun.file(manifestFile).text();
		await Bun.write(
			manifestFile,
			manifest.replaceAll(`"${STAGE_RUBRIC_PATH}"`, `"${rubric}"`),
		);
	}

	/**
	 * Edits the rubric the replayed run's pipeline names for its stage by one
	 * trailing line ending, as an edit made after arm A was recorded would,
	 * and returns the path the pipeline now names.
	 */
	public async editStageRubric(): Promise<string> {
		const rubricFile = join(this.scratchDirectory, "edited-rubric.json");
		await Bun.write(rubricFile, `${STAGE_RUBRIC}\n`);

		const rubric = relative(CONTROL_DIR, rubricFile);
		await this.nameStageRubric(rubric);

		return rubric;
	}

	public readonly runBaselineGroup = async (
		request: ArmGroupRequest,
	): Promise<string> => {
		this.baselineRequests.push(request);
		await this.recordGroup("control", {
			source: { run: request.run, stage: request.stage },
		});
		await useModel({
			groupId: groupIdFor("control"),
			model: request.model,
			runsDirectory: this.runsDirectory,
		});

		return groupIdFor("control");
	};

	public readonly runMoreGroup = async (
		request: ArmGroupRequest,
	): Promise<string> => {
		this.moreRequests.push(request);
		const groupId = await this.fixture.addGroup(CASE_ID, request.role);
		await this.groupWriter.copyGroup({
			fixtureGroupFile: this.fixture.groupFileOf(groupId),
			groupId,
			recording: this.recordings.get(request.role) ?? {},
		});
		await Array.fromAsync(
			this.stageReads.get(groupIdFor(request.role)) ?? [],
			async (layoutPath) => {
				await this.readInStage(groupId, layoutPath);
			},
		);

		return groupId;
	};

	private async recordGroup(
		role: ComparisonArm,
		recording: Recording,
	): Promise<void> {
		this.recordings.set(role, recording);
		await this.groupWriter.copyGroup({
			fixtureGroupFile: this.fixture.groupFile(CASE_ID, role),
			groupId: groupIdFor(role),
			recording,
		});
	}
}

export {
	CASE_ID,
	groupIdFor,
	moreGroupIdFor,
	RecordedArms,
	REPLAYED,
	RUN,
	STAGE,
	STAGE_RUBRIC,
};
