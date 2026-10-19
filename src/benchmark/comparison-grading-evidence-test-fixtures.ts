import { dirname, join } from "node:path";

import { comparisonBuildScorecard } from "./comparison-evidence-record-test-fixtures";
import type { ComparisonEvidenceFixture } from "./comparison-evidence-test-support";
import { readComparisonGroup } from "./comparison-evidence-test-support";
import type { ComparisonArm } from "./comparison-record";
import type { StageGradingRecord } from "./comparison-stage-grading";
import type { StageLetterGrade } from "./config";
import type { ConfirmationRepRecord } from "./confirmation-record";
import { parseConfirmationRepRecord } from "./confirmation-record";

const ORDINAL_BASE = 1;

const REP_IDENTITIES = [{ ordinal: 1 }, { ordinal: 2 }] as const;

const JSON_INDENTATION_SPACES = 2;

const GIT_SHA_HEX_CHARACTERS = 40;

function preliminaryStageScorecard(
	role: ComparisonArm,
	ordinal: number,
): StageGradingRecord {
	return {
		...comparisonBuildScorecard(role, ordinal),
		input: {
			artifact: {
				content: "a shape that runs to seven words",
				path: "shape.md",
			},
		},
		stage: "shape",
	};
}

function stoppedPreliminaryOutcome(
	firstStage: ConfirmationRepRecord["stages"][number],
): Pick<ConfirmationRepRecord, "finalOutcome" | "outcome" | "stages"> {
	return {
		finalOutcome: {
			reason: "the judge stopped the attempt at shape",
			status: "NOT_REACHED",
		},
		outcome: "UNSUCCESSFUL",
		stages: [
			firstStage,
			{
				reason: "the judge stopped the attempt at shape",
				stage: "build",
				status: "NOT_REACHED",
			},
		],
	};
}

function preliminaryStage(
	isStopped: boolean,
): ConfirmationRepRecord["stages"][number] {
	return {
		elapsedMs: 10,
		evidence: {
			recordFile: "stages/shape.json",
			resultSha: "e".repeat(GIT_SHA_HEX_CHARACTERS),
		},
		grade: "A",
		stage: "shape",
		status: "JUDGED",
		verdict: isStopped ? "STOP" : "CONTINUE",
	};
}

/**
 * Puts a judged shape stage before build in every arm, and has one rep's
 * judge STOP it at shape, so that rep never reaches its last stage.
 */
async function stopOneRepBeforeItsLastStage(
	fixture: ComparisonEvidenceFixture,
	stopped: Readonly<{ role: ComparisonArm; ordinal: number }>,
): Promise<void> {
	await Array.fromAsync(fixture.caseIds, async (caseId) => {
		await Array.fromAsync(
			["baseline", "candidate", "control"] as const,
			async (role) => {
				const groupFile = fixture.groupFile(caseId, role);
				const group = await readComparisonGroup(groupFile);
				await Bun.write(
					groupFile,
					`${JSON.stringify({ ...group, declaredStages: ["shape", "build"] }, null, JSON_INDENTATION_SPACES)}\n`,
				);

				await Array.fromAsync(REP_IDENTITIES, async ({ ordinal }) => {
					const isStopped =
						role === stopped.role && ordinal === stopped.ordinal;
					const repFile = fixture.repFile(caseId, role, ordinal);
					const rep = parseConfirmationRepRecord(
						await Bun.file(repFile).text(),
					);
					const firstStage = preliminaryStage(isStopped);
					const stoppedFields = stoppedPreliminaryOutcome(firstStage);
					await Bun.write(
						repFile,
						`${JSON.stringify(
							isStopped
								? { ...rep, ...stoppedFields }
								: { ...rep, stages: [firstStage, ...rep.stages] },
							null,
							JSON_INDENTATION_SPACES,
						)}\n`,
					);
					await Bun.write(
						join(dirname(repFile), "stages", "shape.json"),
						`${JSON.stringify(
							preliminaryStageScorecard(role, ordinal),
							null,
							JSON_INDENTATION_SPACES,
						)}\n`,
					);
				});
			},
		);
	});
}

/** Grades each of one arm's reps at build, in ordinal order. */
async function gradeBuild(
	fixture: ComparisonEvidenceFixture,
	role: ComparisonArm,
	grades: readonly [StageLetterGrade, StageLetterGrade],
): Promise<void> {
	await Array.fromAsync(fixture.caseIds, async (caseId) => {
		await Array.fromAsync(grades.entries(), async ([index, grade]) => {
			const ordinal = index + ORDINAL_BASE;
			const repFile = fixture.repFile(caseId, role, ordinal);
			const rep = parseConfirmationRepRecord(await Bun.file(repFile).text());
			const [build] = rep.stages;
			await Bun.write(
				repFile,
				`${JSON.stringify(
					{
						...rep,
						outcome:
							grade === "A" || grade === "B" ? "SUCCESSFUL" : "UNSUCCESSFUL",
						stages: [{ ...build, grade }],
					},
					null,
					JSON_INDENTATION_SPACES,
				)}\n`,
			);
			const scorecard = comparisonBuildScorecard(role, ordinal);
			await fixture.writeScorecard(
				{ caseId, ordinal, role },
				{
					...scorecard,
					grade: { ...scorecard.grade, grade },
				},
			);
		});
	});
}

export { gradeBuild, stopOneRepBeforeItsLastStage };
