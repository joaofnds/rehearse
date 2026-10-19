import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import { z } from "zod";

import {
	claudeCallMetricsSchema,
	claudeEnvelopeSchema,
	claudeJsonSchema,
	contextFileSchema,
	evidenceLocatorSchema,
	evidenceSchema,
	gradedHardBlockersSchema,
	humanFindingSchema,
	humanReviewSchema,
	judgeAttemptListSchema,
	judgeGradeResponseSchema,
	judgeGradeSchema,
	localCheckResultSchema,
	productAnswerSchema,
	recordedStageEvidenceSchema,
	stageGradeSchema,
	stageJudgeInputSchema,
	stageJudgeOutputSchema,
	stageJudgeResponseSchema,
	stageLetterGradeSchema,
	stageRubricSchema,
	stageScorecardSchema,
	stageTurnSchema,
} from "./contracts";
import { analysisSessionArgs } from "./root-cause-analysis";

const ANALYSIS_BUDGET_USD = 1;

// These digests capture the exact provider schema bytes from d020bf3a before
// declaration sorting; deriving them from the current schemas would miss drift.
const historicalSchemaProtocols = [
	{
		digest: "50fa28afe5e018efb0e7a66a71bbb84c91b9197e65aab5be9860b3898e1efda7",
		name: "claudeCallMetricsSchema",
		schema: claudeCallMetricsSchema,
	},
	{
		digest: "8f05430dbe3d1c4b911c3ff0d2127cc02e26a44e5a6181c33041ef7434dcd352",
		name: "contextFileSchema",
		schema: contextFileSchema,
	},
	{
		digest: "9e4b380bf0f8c7c121183ed1e197eaf70042e0b0b740a0412eb55f272989d8f3",
		name: "evidenceLocatorSchema",
		schema: evidenceLocatorSchema,
	},
	{
		digest: "2f9546800535fa8e93c22e34c7ada4a3f095601b51e3094f4a1f5a9e26accb77",
		name: "evidenceSchema",
		schema: evidenceSchema,
	},
	{
		digest: "55db1af6475621c1a8b386714f8e1a2a457687e8ccfb6e3d249fb302e832e5b2",
		name: "gradedHardBlockersSchema",
		schema: gradedHardBlockersSchema,
	},
	{
		digest: "4009eccb44b8b2e4800f0c4f0afeca5f6b5f423eb4f652bfe56807e58447bcf9",
		name: "humanFindingSchema",
		schema: humanFindingSchema,
	},
	{
		digest: "43544edd261003e83ad6430a62d0f8e3b7c10a87c983487249859cd8ace5ac06",
		name: "humanReviewSchema",
		schema: humanReviewSchema,
	},
	{
		digest: "e2d3543a607142e59079657a4fc695077e8772610274e1346414856a021fec21",
		name: "judgeAttemptListSchema",
		schema: judgeAttemptListSchema,
	},
	{
		digest: "054a7a70ecfa7df30aedb129f99cf21ee5aa97420550c37bebd81812efcef015",
		name: "judgeGradeResponseSchema",
		schema: judgeGradeResponseSchema,
	},
	{
		digest: "e19d4c7c3156b5f1e7acdeecc0d2934fb9d1139c08e5a6264814a755d82fff85",
		name: "judgeGradeSchema",
		schema: judgeGradeSchema,
	},
	{
		digest: "aa41087364d7ec684b7e0a5050170a1905648ea4de271aee3367515d53c1d965",
		name: "localCheckResultSchema",
		schema: localCheckResultSchema,
	},
	{
		digest: "d06257c1722f96bcc4e86d9aa501fef92d1cfeca9b71f985d27c707aff5b6a24",
		name: "productAnswerSchema",
		schema: productAnswerSchema,
	},
	{
		digest: "e3a8c4f345ebf6db8cd8ab760561bf41d0d0a968a2558b2ef486f188f53c14f2",
		name: "recordedStageEvidenceSchema",
		schema: recordedStageEvidenceSchema,
	},
	{
		digest: "ee22ba9fd13834d29f7ea86c6f39a113b7d17ad74c3196e716e6cba5ec8666f6",
		name: "stageGradeSchema",
		schema: stageGradeSchema,
	},
	{
		digest: "bf639d32117e4be0a71177681f45146abdde424f294716779f31cb7f92354c16",
		name: "stageJudgeInputSchema",
		schema: stageJudgeInputSchema,
	},
	{
		digest: "1890246314a556d227e4ddc822e6897403d9187a722e0136df2f745644131252",
		name: "stageJudgeOutputSchema",
		schema: stageJudgeOutputSchema,
	},
	{
		digest: "bb5314de8d61a915c6be5ec1489a96963bcc6a6475bf3f0125a4702ef86ceaf9",
		name: "stageJudgeResponseSchema",
		schema: stageJudgeResponseSchema,
	},
	{
		digest: "b3413151a4ba772b23c9991a04fc29e0375a934921afa81ff04b39201f9d4f1b",
		name: "stageLetterGradeSchema",
		schema: stageLetterGradeSchema,
	},
	{
		digest: "1b898cff8abc38ddd35048b0f7bfcddf7bdb63e7914f3866b24a0c2b837b5986",
		name: "stageRubricSchema",
		schema: stageRubricSchema,
	},
	{
		digest: "491a75105bbaef4a9ff3ae2301772d5c7cf7488f16e9a54480d594e0cda61ed1",
		name: "stageScorecardSchema",
		schema: stageScorecardSchema,
	},
	{
		digest: "4720e254539f329c90c737d41c9e80d6078ac9f2c85dd83e2d5bd9856ecbebba",
		name: "stageTurnSchema",
		schema: stageTurnSchema,
	},
];

const SCHEMA_PARAMETER_INDEX = 0;

interface SchemaProtocol {
	readonly digest: string;
	readonly name: string;
	readonly schema: Parameters<
		typeof claudeJsonSchema
	>[typeof SCHEMA_PARAMETER_INDEX];
}

function retainsSchemaBytes({ digest, schema }: SchemaProtocol): void {
	const bytes = claudeJsonSchema(schema);
	const actual = createHash("sha256").update(bytes).digest("hex");

	expect(actual).toBe(digest);
}

describe(claudeJsonSchema.name, () => {
	it.each(historicalSchemaProtocols)(
		"retains historical provider bytes for $name",
		retainsSchemaBytes,
	);

	it("retains the exact stage turn schema supplied to the provider", () => {
		const bytes = claudeJsonSchema(stageTurnSchema);

		expect(bytes).toBe(
			'{"type":"object","properties":{"status":{"type":"string","enum":["QUESTION","COMPLETE"],"description":"QUESTION when product input is required; COMPLETE only after the native skill has finished and saved its durable artifact"},"message":{"type":"string","minLength":1,"description":"One question with its recommendation and context, or a concise completion summary"}},"required":["status","message"],"additionalProperties":false}',
		);
	});

	it("retains historical sealed root-cause analysis invocation bytes", () => {
		const args = analysisSessionArgs("sonnet", ANALYSIS_BUDGET_USD);
		const bytes = JSON.stringify(args);
		const digest = createHash("sha256").update(bytes).digest("hex");

		expect(digest).toBe(
			"c2df0c6e339c4a1a79e3fa53abdf8a435ac8b143b9244a34c24a8c4698b2c9bd",
		);
	});

	it("preserves native export bytes for schemas without protocol ordering", () => {
		const schema = z.object({ first: z.string(), second: z.number() });

		const bytes = claudeJsonSchema(schema);

		expect(bytes).toBe(
			'{"type":"object","properties":{"first":{"type":"string"},"second":{"type":"number"}},"required":["first","second"],"additionalProperties":false}',
		);
	});

	it("continues to reject unsupported transform schemas", () => {
		expect(() => claudeJsonSchema(claudeEnvelopeSchema)).toThrow(
			"Transforms cannot be represented in JSON Schema",
		);
	});
});
