import { mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { nameGroups } from "./comparison-additional-groups-fixture";
import {
	comparisonBuildScorecard,
	comparisonStageGroup,
	digest,
	repRecord,
} from "./comparison-evidence-record-test-fixtures";
import comparisonFixtureJson from "./comparison-fixture-json";
import writeComparisonFrozenInputs from "./comparison-frozen-input-test-fixtures";
import type { ComparisonArm } from "./comparison-record";
import type { StageGradingRecord } from "./comparison-stage-grading";
import type { ConfirmationGroupRecord } from "./confirmation-record";
import { confirmationGroupRecordSchema } from "./confirmation-record";
import type { Immutable } from "./contracts";

interface RepWriteIdentity {
	readonly caseId: string;
	readonly role: ComparisonArm;
	readonly groupId: string;
	readonly ordinal: number;
}

const REP_IDENTITIES = [{ ordinal: 1 }, { ordinal: 2 }] as const;

const JSON_INDENTATION_SPACES = 2;

interface RepScorecardIdentity {
	readonly caseId: string;
	readonly role: ComparisonArm;
	readonly ordinal: number;
}

interface CorpusFileContent {
	readonly path: string;
	readonly content: string;
}

async function readComparisonGroup(
	groupFile: string,
): Promise<ConfirmationGroupRecord> {
	return confirmationGroupRecordSchema.parse(
		JSON.parse(await Bun.file(groupFile).text()),
	);
}

class ComparisonEvidenceFixture {
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
		return this.repFileOf(`${caseId}-${role}`, ordinal);
	}

	/**
	 * Records a second confirmation group of the arm's variant, run on the same
	 * frozen inputs, and names both groups for the arm in the manifest.
	 */
	public async addGroup(caseId: string, role: ComparisonArm): Promise<string> {
		const groupId = `${caseId}-${role}-more`;
		await this.writeGroup(caseId, role, groupId);
		await nameGroups(this, {
			caseId,
			groupIds: [`${caseId}-${role}`, groupId],
			role,
		});

		return groupId;
	}

	public async changeGroup(
		groupId: string,
		change: (
			group: Immutable<ConfirmationGroupRecord>,
		) => Immutable<ConfirmationGroupRecord>,
	): Promise<void> {
		const groupFile = this.groupFileOf(groupId);
		const group = await readComparisonGroup(groupFile);
		await Bun.write(
			groupFile,
			`${JSON.stringify(change(group), null, JSON_INDENTATION_SPACES)}\n`,
		);
	}

	public groupFileOf(groupId: string): string {
		return join(this.root, "groups", groupId, "group.json");
	}

	private repFileOf(groupId: string, ordinal: number): string {
		return join(
			this.root,
			"groups",
			groupId,
			"reps",
			`${groupId}-rep-${ordinal}`,
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
		{ caseId, role, ordinal }: RepScorecardIdentity,
		scorecard: StageGradingRecord,
	): Promise<void> {
		await Bun.write(
			this.scorecardFile(caseId, role, ordinal),
			`${JSON.stringify(scorecard, null, JSON_INDENTATION_SPACES)}\n`,
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
		const cases = await Array.fromAsync(this.caseIds, async (caseId) => {
			const arms = {
				baseline: await this.writeGroup(caseId, "baseline"),
				candidate: await this.writeGroup(caseId, "candidate"),
				control: await this.writeGroup(caseId, "control"),
			};
			return { arms, caseId };
		});

		await Bun.write(
			this.manifestFile,
			`${comparisonFixtureJson({ json: JSON.stringify({ cases, schemaVersion: 1 }), kind: "manifest" })}\n`,
		);
	}

	public async addCorpusFile(
		caseId: string,
		role: ComparisonArm,
		{ path, content }: CorpusFileContent,
	): Promise<void> {
		await Bun.write(join(this.groupDirectory(caseId, role), path), content);
		const groupFile = this.groupFile(caseId, role);
		const group = await readComparisonGroup(groupFile);
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
		await Bun.write(
			groupFile,
			`${JSON.stringify(changed, null, JSON_INDENTATION_SPACES)}\n`,
		);
	}

	private groupDirectory(caseId: string, role: ComparisonArm): string {
		return join(this.root, "groups", `${caseId}-${role}`);
	}

	private async writeRep({
		caseId,
		role,
		groupId,
		ordinal,
	}: RepWriteIdentity): Promise<ConfirmationGroupRecord["repRecords"][number]> {
		const recordFile = this.repFileOf(groupId, ordinal);
		await mkdir(dirname(recordFile), { recursive: true });
		const record = repRecord(caseId, groupId, ordinal);

		const recordText = comparisonFixtureJson({
			json: JSON.stringify(record),
			kind: "rep",
		});
		await Bun.write(recordFile, `${recordText}\n`);
		const scorecard = comparisonBuildScorecard(role, ordinal);

		const scorecardText = comparisonFixtureJson({
			json: JSON.stringify(scorecard),
			kind: "scorecard",
		});
		await Bun.write(
			join(dirname(recordFile), "stages", "build.json"),
			`${scorecardText}\n`,
		);
		return {
			ordinal,
			path: relative(join(this.root, "groups", groupId), recordFile),
			repId: `${groupId}-rep-${ordinal}`,
		};
	}

	private async writeGroup(
		caseId: string,
		role: ComparisonArm,
		groupId = `${caseId}-${role}`,
	): Promise<string> {
		const repRecords = await Array.fromAsync(
			REP_IDENTITIES,
			async ({ ordinal }) =>
				await this.writeRep({
					caseId,
					groupId,
					ordinal,
					role,
				}),
		);

		const files = await writeComparisonFrozenInputs(this.root, {
			caseId,
			groupId,
			role,
		});
		const group = comparisonStageGroup({ caseId, files, groupId, repRecords });
		const groupFile = this.groupFileOf(groupId);
		await Bun.write(
			groupFile,
			`${comparisonFixtureJson({ json: JSON.stringify(group), kind: "group" })}\n`,
		);

		return relative(dirname(this.manifestFile), groupFile);
	}
}

export { ComparisonEvidenceFixture, readComparisonGroup };
