import { randomUUID } from "node:crypto";
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BaselineGroupRequest } from "./compare-attempts";
import { ComparisonEvidenceFixture } from "./comparison-evidence-test-support";
import type { ComparisonArm } from "./comparison-record";
import type { ConfirmationMode } from "./confirmation-record";
import { confirmationGroupRecordSchema } from "./confirmation-record";
import { measureCorpusVersion } from "./corpus-version";
import { confirmationGroupPaths } from "./run-layout";
import { claimShortId } from "./short-id";

export const CASE_ID = "build-checkpoint";
export const RUN = "2026-09-29T10-00-00.000Z";
export const STAGE = "build";

export interface Checkpoint {
	readonly run: string;
	readonly stage: string;
}

export const REPLAYED: Checkpoint = { run: RUN, stage: STAGE };

export function groupIdFor(role: ComparisonArm): string {
	return `${CASE_ID}-${role}`;
}

export type CorpusFiles = Readonly<Record<string, string>>;

/**
 * Two stage groups replayed at one checkpoint, as arms A and B, each with the
 * corpus version its reps ran against, and a baseline runner that records
 * what it was asked to run and answers with a third recorded group.
 */
export class RecordedArms {
	public readonly baselineRequests: BaselineGroupRequest[] = [];

	private constructor(
		public readonly runsDirectory: string,
		private readonly scratchDirectory: string,
		private readonly fixture: ComparisonEvidenceFixture,
	) {}

	/** Records into `runsDirectory`, building its fixtures in `scratchDirectory`. */
	public static async create(
		runsDirectory: string,
		scratchDirectory: string,
	): Promise<RecordedArms> {
		const fixture = new ComparisonEvidenceFixture(
			join(scratchDirectory, "fixture"),
			[CASE_ID],
		);
		await fixture.write();

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
		const root = join(this.scratchDirectory, "corpora", randomUUID());
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
