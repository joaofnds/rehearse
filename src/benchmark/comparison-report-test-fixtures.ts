import type {
	ComparisonArmEvidence,
	ComparisonEvidence,
} from "./comparison-evidence";
import { SHA256_HEX_CHARACTERS } from "./comparison-evidence-record-test-fixtures";
import type { ComparisonArm } from "./comparison-record";
import type { SourceRep } from "./comparison-report-integrity-test-examples";
import {
	FAIL,
	GIT_SHA_HEX_CHARACTERS,
	PASS,
	comparisonReps,
} from "./comparison-test-fixtures";
import type {
	ConfirmationGroupRecord,
	ConfirmationRepRecord,
} from "./confirmation-record";
import { confirmationGroupRecordSchema } from "./confirmation-record";
import type { Immutable } from "./contracts";
import type { JudgeAgreementReport } from "./judge-agreement";

interface ReportArmIdentity {
	readonly caseId: string;
	readonly role: ComparisonArm;
}

const EXPECTED_FIRST_CANDIDATE_REP = {
	group: 0,
	ordinal: 1,
	outcomes: [
		{
			grade: "A",
			name: "discuss",
			status: "JUDGED",
			successful: true,
		},
		{
			grade: "A",
			name: "build",
			status: "JUDGED",
			successful: true,
		},
		{
			grade: "PASS",
			name: "final",
			status: "JUDGED",
			successful: true,
		},
	],
	path: "groups/case-1-candidate/reps/case-1-candidate-rep-1/rep.json",
	repId: "case-1-candidate-rep-1",
	sha256: "7".repeat(SHA256_HEX_CHARACTERS),
} satisfies SourceRep;

const RECORDED_JUDGE_AGREEMENT = {
	baselines: [
		{
			criteria: [
				{
					cohensKappa: null,
					judgeFailHumanFail: 0,
					judgeFailHumanPass: 0,
					judgePassHumanFail: 0,
					judgePassHumanPass: 1,
					observedAgreement: 1,
					rubricId: "correctness",
					sampleSize: 1,
				},
			],
			judgeModel: "opus",
			rubricSha256: "9".repeat(SHA256_HEX_CHARACTERS),
			stage: "final",
		},
	],
	skippedCalibrations: 1,
} satisfies JudgeAgreementReport;

function reportGroupRecord(
	{ caseId, role }: ReportArmIdentity,
	corpus: ComparisonArmEvidence["executedCorpus"][number],
	reps: readonly Immutable<ConfirmationRepRecord>[],
): ConfirmationGroupRecord {
	const groupId = `${caseId}-${role}`;
	return confirmationGroupRecordSchema.parse({
		approval: { approved: true, method: "yes" },
		caseId,
		declaredStages: ["discuss", "build"],
		groupId,
		inputs: {
			files: [
				corpus,
				{
					kind: "task",
					path: "inputs/task.md",
					sha256: (caseId === "case-1" ? "4" : "5").repeat(
						SHA256_HEX_CHARACTERS,
					),
				},
			],
			judgeModel: "opus",
			lineage: { kind: "SOURCE", sha: "a".repeat(GIT_SHA_HEX_CHARACTERS) },
			model: "sonnet",
			pipelinePath: "pipelines/default.json",
			sessionBudgetUsd: 5,
		},
		makespanMs: 400,
		mode: "pipeline",
		projectedCost: {
			perRepMaximumUsd: 30,
			reps: 4,
			totalMaximumUsd: 120,
		},
		repRecords: reps.map((rep) => ({
			ordinal: rep.ordinal,
			path: `reps/${rep.repId}/rep.json`,
			repId: rep.repId,
		})),
		reportFile: "report.json",
		reps: 4,
		schemaVersion: 1,
	});
}

function reportArmEvidence(
	caseId: string,
	role: ComparisonArm,
	reps: readonly Immutable<ConfirmationRepRecord>[],
): ComparisonArmEvidence {
	const groupId = `${caseId}-${role}`;
	const corpus = {
		kind: "corpus" as const,
		path: "inputs/corpus/SKILL.md",
		sha256: { baseline: "1", candidate: "2", control: "3" }[role].repeat(
			SHA256_HEX_CHARACTERS,
		),
	};
	const record = reportGroupRecord({ caseId, role }, corpus, reps);

	const group = {
		path: `groups/${groupId}/group.json`,
		record,
		sha256: "6".repeat(SHA256_HEX_CHARACTERS),
	};

	return {
		controlledFiles: record.inputs.files.filter(
			({ kind }) => kind !== "corpus" && kind !== "instructions",
		),
		declaredCaseId: record.caseId,
		executedCorpus: [corpus],
		group,
		groups: [group],
		reps: reps.map((rep) => ({
			path: `groups/${groupId}/reps/${rep.repId}/rep.json`,
			record: rep,
			sha256: "7".repeat(SHA256_HEX_CHARACTERS),
		})),
		role,
		sourcePaths: [],
	};
}

function comparisonEvidenceFixture(): ComparisonEvidence {
	const cases = ["case-1", "case-2"].map((caseId) => {
		const baseline = comparisonReps(caseId, "baseline", {
			outcomes: [PASS, PASS, FAIL, FAIL],
		});
		const candidate = comparisonReps(caseId, "candidate", {
			outcomes: [PASS, PASS, PASS, PASS],
		});
		const control = comparisonReps(caseId, "control", {
			outcomes: [FAIL, FAIL, FAIL, FAIL],
		});

		return {
			arms: {
				baseline: reportArmEvidence(caseId, "baseline", baseline),
				candidate: reportArmEvidence(caseId, "candidate", candidate),
				control: reportArmEvidence(caseId, "control", control),
			},
			caseId,
		};
	});

	return {
		cases,
		contract: {
			declaredStages: ["discuss", "build"],
			mode: "pipeline",
			reps: 4,
		},
		manifest: {
			path: "/tmp/comparison.json",
			sha256: "8".repeat(SHA256_HEX_CHARACTERS),
		},
		sourcePaths: [],
	};
}

export {
	EXPECTED_FIRST_CANDIDATE_REP,
	RECORDED_JUDGE_AGREEMENT,
	comparisonEvidenceFixture,
	reportArmEvidence,
};
