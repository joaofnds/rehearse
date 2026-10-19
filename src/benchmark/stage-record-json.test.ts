import { describe, expect, it } from "bun:test";

import orderedJson from "./ordered-json";
import { pipelineDefinitionSchema, pipelineValidationOrder } from "./pipeline";
import { writeStageJudgeFailure } from "./run-abort";
import StageByteWorkspace from "./stage-byte-workspace-test-fixture";
import stageRecordJson from "./stage-record-json";
import { TestResources } from "./test-support";

const workspace = new StageByteWorkspace(TestResources.forEachTest());

async function digest(path: string): Promise<string> {
	const bytes = await Bun.file(path).bytes();
	return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}

const stageRecordJsonPersistsProgressAndCompletion =
	async (): Promise<void> => {
		const { file, pending, record, abort } = await workspace.prepare();
		try {
			await abort.writePendingStage(pending);
			expect(await digest(file)).toBe(
				"21bca13fff9159902407cefb3b25750069c99ca95f9af511610f430856e9c7cb",
			);
			await abort.writeStageProgress(record);
			expect(await digest(file)).toBe(
				"1133af9d4003def58430d1742b060b3e92486976db6ab920f11644fc10fc7713",
			);
			await abort.completeStage(record);
			expect(await digest(file)).toBe(
				"1133af9d4003def58430d1742b060b3e92486976db6ab920f11644fc10fc7713",
			);
		} finally {
			abort.release();
		}
	};
const stageRecordJsonPersistsStoppedEvidence = async (): Promise<void> => {
	const { file, pending, record, abort, scorecard } = await workspace.prepare();
	try {
		await abort.writePendingStage(pending);
		await abort.writeStageProgress(record);
		await abort.completeStage(record);
		await writeStageJudgeFailure(
			{
				...pending,
				scorecard,
				stopped: { elapsedMs: 10, minimumGrade: "B", runElapsedMs: 20 },
			},
			"stopped",
		);
		expect(await digest(file)).toBe(
			"52c2247aed4ce9394108a99edcd7366354f2aa2804c6bd5324f45201fa90e9a2",
		);
	} finally {
		abort.release();
	}
};

const stageRecordJsonKeepsFrozenPipelineBytesAndDictionaryInsertionOrder =
	async (): Promise<void> => {
		const fixture: unknown = await Bun.file(
			new URL("__fixtures__/stage-record-pipeline.json", import.meta.url),
		).json();
		const pipeline = pipelineDefinitionSchema.parse(fixture);
		const content = `${orderedJson({
			json: JSON.stringify(pipeline),
			order: pipelineValidationOrder,
		})}\n`;
		// Independently captured from d020bf3a pipelineDefinitionSchema + JSON.stringify.
		const actual = new Bun.CryptoHasher("sha256").update(content).digest("hex");

		expect(actual).toBe(
			"ce09106152c2b9716abb92a3c853a93d763acb0243525da4198324cb7dabf128",
		);
	};

const stageRecordJsonPreservesUnknownFieldsAndOwnedPrototypenamedDataAtTheStageBoundary =
	(): void => {
		const json =
			'{"unknown":{"__proto__":{"preserved":true},"constructor":"value"},"grade":{"unknown":[{"__proto__":{"nested":true}}]},"__proto__":{"root":true}}';

		const serialized = stageRecordJson({ json });

		expect(serialized).toBe(`{
  "grade": {
    "unknown": [
      {
        "__proto__": {
          "nested": true
        }
      }
    ]
  },
  "unknown": {
    "__proto__": {
      "preserved": true
    },
    "constructor": "value"
  },
  "__proto__": {
    "root": true
  }
}
`);
	};

describe(stageRecordJson.name, () => {
	it(
		"persists pending, progress and completion bytes",
		stageRecordJsonPersistsProgressAndCompletion,
	);
	it("persists stopped evidence bytes", stageRecordJsonPersistsStoppedEvidence);

	it(
		"keeps frozen pipeline bytes and dictionary insertion order",
		stageRecordJsonKeepsFrozenPipelineBytesAndDictionaryInsertionOrder,
	);

	it(
		"preserves unknown fields and owned prototype-named data at the stage boundary",
		stageRecordJsonPreservesUnknownFieldsAndOwnedPrototypenamedDataAtTheStageBoundary,
	);
});
