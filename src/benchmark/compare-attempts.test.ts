import { afterEach, describe, expect, it } from "bun:test";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { BaselineGroupRequest } from "./compare-attempts";
import { compareAttempts } from "./compare-attempts";
import { ComparisonEvidenceFixture } from "./comparison-evidence-test-support";
import type { ComparisonArm } from "./comparison-record";
import { confirmationGroupRecordSchema } from "./confirmation-record";
import { measureCorpusVersion } from "./corpus-version";
import { RefusedPreconditionError } from "./exit-codes";
import { confirmationGroupPaths } from "./run-layout";
import { claimShortId } from "./short-id";

const CASE_ID = "build-checkpoint";
const RUN = "2026-09-29T10-00-00.000Z";
const STAGE = "build";

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
	): Promise<string> {
		await this.recordGroup(role, corpus);

		return groupIdFor(role);
	}

	public readonly runBaselineGroup = async (
		request: BaselineGroupRequest,
	): Promise<string> => {
		this.baselineRequests.push(request);
		await this.recordGroup("control", undefined);

		return groupIdFor("control");
	};

	private async recordGroup(
		role: ComparisonArm,
		corpus: CorpusFiles | undefined,
	): Promise<void> {
		const groupId = groupIdFor(role);
		const paths = confirmationGroupPaths(this.runsDirectory, groupId);
		await mkdir(dirname(paths.directory), { recursive: true });
		await cp(dirname(this.fixture.groupFile(CASE_ID, role)), paths.directory, {
			recursive: true,
		});
		if (corpus !== undefined) {
			const group = confirmationGroupRecordSchema.parse(
				JSON.parse(await Bun.file(paths.groupFile).text()),
			);
			const corpusVersion = await this.measure(corpus);
			await Bun.write(
				paths.groupFile,
				`${JSON.stringify({ ...group, inputs: { ...group.inputs, corpusVersion } }, null, 2)}\n`,
			);
		}
		await claimShortId(this.runsDirectory, CASE_ID, {
			kind: "group",
			groupId,
			source: { run: RUN, stage: STAGE },
		});
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
});
