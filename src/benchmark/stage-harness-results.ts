import type {
	EvidenceLocator,
	StageJudgeInput,
	StageJudgeOutput,
} from "./contracts";

type HarnessSource = "check-integrity" | "local-checks" | "harness-failure";

const HARNESS_RESULTS = {
	"check-integrity": "checkIntegrity",
	"harness-failure": "harnessFailure",
	"local-checks": "localChecks",
} as const satisfies Record<HarnessSource, keyof StageJudgeInput>;

function harnessLocator(
	source: HarnessSource,
	input: StageJudgeInput,
): EvidenceLocator {
	const result = HARNESS_RESULTS[source];
	const value = input[result];

	return {
		kind: "harness",
		recorded: value !== undefined && value !== "",
		result,
	};
}

function forcedStageFailures(
	input: StageJudgeInput,
): ReadonlyMap<string, StageJudgeOutput["hardBlockers"][number]["evidence"]> {
	const forcedFailures = new Map<
		string,
		StageJudgeOutput["hardBlockers"][number]["evidence"]
	>();

	if (input.harnessFailure !== undefined && input.harnessFailure !== "") {
		forcedFailures.set("invalid-stage-delivery", [
			{
				claim: input.harnessFailure,
				locator: harnessLocator("harness-failure", input),
				path: "harness",
				source: "harness-failure",
			},
		]);
	}

	if (input.kind === "delivery" && input.checkIntegrity?.status === "FAIL") {
		forcedFailures.set("false-test-safety", [
			{
				claim: input.checkIntegrity.evidence
					.map(({ claim }) => claim)
					.join("; "),
				locator: harnessLocator("check-integrity", input),
				path: "harness",
				source: "check-integrity",
			},
		]);
	}

	if (input.kind === "delivery" && input.localChecks?.status === "FAIL") {
		forcedFailures.set("unfinished-delivery", [
			{
				claim: input.localChecks.evidence.map(({ claim }) => claim).join("; "),
				locator: harnessLocator("local-checks", input),
				path: "harness",
				source: "local-checks",
			},
		]);
	}

	return forcedFailures;
}

function applyAuthoritativeStageResults(
	output: StageJudgeOutput,
	input: StageJudgeInput,
): StageJudgeOutput {
	const forcedFailures = forcedStageFailures(input);

	for (const id of forcedFailures.keys()) {
		if (!output.hardBlockers.some((blocker) => blocker.id === id)) {
			throw new Error(`Stage rubric must retain harness blocker ${id}`);
		}
	}

	return {
		...output,
		hardBlockers: output.hardBlockers.map((blocker) => {
			const evidence = forcedFailures.get(blocker.id);
			return evidence ? { ...blocker, evidence, status: "FAIL" } : blocker;
		}),
	};
}

export { harnessLocator, applyAuthoritativeStageResults };
