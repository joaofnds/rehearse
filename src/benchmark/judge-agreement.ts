import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { Immutable } from "./contracts";
import type {
	CalibrationDirectoryEntry,
	LoadedCalibrationArtifact,
} from "./judge-agreement-artifacts";
import {
	readCalibrationArtifact,
	resolvedStageCalibration,
} from "./judge-agreement-artifacts";
import type {
	JudgeAgreementCalibration,
	JudgeAgreementObservation,
	JudgeAgreementReport,
} from "./judge-agreement-contract";
import buildJudgeAgreementReport from "./judge-agreement-counts";
import { calibrationObservations } from "./judge-agreement-observations";

const SKIPPED_CALIBRATION_COUNT_INCREMENT = 1;

const INITIAL_SKIPPED_CALIBRATION_COUNT = 0;
class AgreementArtifactReader {
	private readonly observations: JudgeAgreementObservation[];
	private skippedCalibrations = INITIAL_SKIPPED_CALIBRATION_COUNT;
	public constructor(
		private readonly runsDirectory: string,
		currentCalibrations: readonly Readonly<JudgeAgreementCalibration>[],
	) {
		this.observations = currentCalibrations.flatMap((calibration) =>
			calibrationObservations(calibration),
		);
	}
	public async read(): Promise<JudgeAgreementReport> {
		const entries = await readdir(this.runsDirectory, {
			withFileTypes: true,
		}).catch(() => []);
		await Array.fromAsync(entries, async (entry) => {
			await this.include(entry, entries);
		});

		return buildJudgeAgreementReport(
			this.observations,
			this.skippedCalibrations,
		);
	}
	private async include(
		entry: CalibrationDirectoryEntry,
		entries: readonly CalibrationDirectoryEntry[],
	): Promise<void> {
		if (!entry.isFile() || !entry.name.endsWith(".json")) {
			return;
		}

		const artifact = await readCalibrationArtifact(
			join(this.runsDirectory, entry.name),
		);
		if (artifact === undefined) {
			return;
		}

		if (artifact.kind === "stage") {
			await this.includeStage(artifact.record, entry.name, entries);
			return;
		}

		const final = artifact.record;
		this.observations.push(
			...calibrationObservations({
				final: { grade: final.grade, rubric: final.rubric },
				humanReview: final.calibration.humanReview,
				judgeModel: final.judgeModel,
				stages: final.stageScorecards,
			}),
		);
	}
	private async includeStage(
		stage: Immutable<
			Extract<LoadedCalibrationArtifact, { kind: "stage" }>["record"]
		>,
		fileName: string,
		entries: readonly CalibrationDirectoryEntry[],
	): Promise<void> {
		const calibration = await resolvedStageCalibration(this.runsDirectory, {
			entries,
			fileName,
			stage,
		});
		if (calibration === undefined) {
			this.skippedCalibrations += SKIPPED_CALIBRATION_COUNT_INCREMENT;
			return;
		}

		this.observations.push(...calibrationObservations(calibration));
	}
}
async function loadJudgeAgreementReport(
	runsDirectory: string,
	currentCalibrations: readonly Readonly<JudgeAgreementCalibration>[] = [],
): Promise<JudgeAgreementReport> {
	return await new AgreementArtifactReader(
		runsDirectory,
		currentCalibrations,
	).read();
}

function filterJudgeAgreementReport(
	report: Readonly<JudgeAgreementReport>,
	judgeModels: readonly string[],
): JudgeAgreementReport {
	const included = new Set(judgeModels);

	return {
		baselines: report.baselines.filter(({ judgeModel }) =>
			included.has(judgeModel),
		),
		skippedCalibrations: report.skippedCalibrations,
	};
}

export { loadJudgeAgreementReport, filterJudgeAgreementReport };
export { default as judgeAgreementReportSchema } from "./judge-agreement-contract";
export {
	stageRubricSha256,
	finalRubricSha256,
	calibrationObservations,
} from "./judge-agreement-observations";
export { default as buildJudgeAgreementReport } from "./judge-agreement-counts";
export type {
	AgreementDecision,
	JudgeAgreementObservation,
	JudgeAgreementCriterion,
	JudgeAgreementBaseline,
	JudgeAgreementReport,
	CalibratedStage,
	CalibratedFinal,
	JudgeAgreementCalibration,
} from "./judge-agreement-contract";
