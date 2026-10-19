import { stageJudgeInputSchema } from "./contracts";
import { runJudge } from "./judge";
import type { StageEvidenceOrigin } from "./judge-evidence";
import capturePromptEvidence from "./judge-prompt-evidence";
import type { PromptEvidence, PromptResources } from "./judge-prompt-evidence";
import JudgePromptObservation from "./judge-prompt-observation";
import {
	producePromptStageInput,
	promptRubricContent,
} from "./judge-prompt-stage-session";
import type { StageKind } from "./pipeline";
import { runStageJudge } from "./stage-grading";
import { parseStageRubric } from "./stage-rubric";
import { judgeBudget } from "./test-support";

class JudgePromptHarness {
	private constructor(private readonly evidence: PromptEvidence) {}

	public static async create(
		resources: PromptResources,
	): Promise<JudgePromptHarness> {
		const evidence = await capturePromptEvidence(resources);
		return new JudgePromptHarness(evidence);
	}

	public async stage(
		kind: StageKind,
		origin: StageEvidenceOrigin = "session",
	): Promise<string> {
		const session = await producePromptStageInput(this.evidence, kind);
		const content = await promptRubricContent();
		const observation = new JudgePromptObservation({
			filename: "stage-response.json",
		});

		const scorecard = await runStageJudge(
			{ budget: judgeBudget(), effort: undefined, model: "sonnet" },
			{
				evidenceOrigin: origin,
				input:
					origin === "record"
						? stageJudgeInputSchema.parse(session.input)
						: session.input,
				source: {
					content,
					rubric: parseStageRubric(content, kind),
					rubricPath: "rubric.json",
				},
			},
			{ invoke: observation.invoke },
		);

		return observation.observedPrompt(scorecard.prompt);
	}

	public async final(): Promise<string> {
		const observation = new JudgePromptObservation({
			filename: "final-response.json",
		});

		const result = await runJudge(
			{ budget: judgeBudget(), effort: undefined, model: "sonnet" },
			{
				baselineContext: this.evidence.baselineContext,
				changedPaths: ["context.md"],
				checkIntegrity: this.evidence.checkIntegrity,
				diff: "Changed context",
				localChecks: this.evidence.localChecks,
				rubric: "1. `check-integrity`: Integrity\n2. `local-checks`: Local",
			},
			observation.invoke,
		);

		return observation.observedPrompt(result.prompt);
	}
}

export { JudgePromptHarness as default };
