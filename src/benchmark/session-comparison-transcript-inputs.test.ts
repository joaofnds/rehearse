import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { writeManifest } from "./session-comparison-group-test-fixture";
import { sessionGroupFile } from "./session-comparison-record-test-fixture";
import {
	addTranscriptInput,
	changeFrozenTranscript,
} from "./session-comparison-transcript-test-fixture";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";

const root = comparisonSuiteRoot();

async function testRefusesFrozenTranscriptBytesWhoseDigestDisagreesWithTheCase(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	await addTranscriptInput({
		caseId: "case-one",
		content: "original prefix\n",
		runsDirectory,
	});

	await changeFrozenTranscript({
		content: "changed prefix\n",
		groupFile: sessionGroupFile({
			caseId: "case-one",
			role: "candidate",
			runsDirectory,
		}),
	});

	expect(
		writeComparisonReport({ manifestPath, runsDirectory }),
	).rejects.toThrow(
		"case case-one arm candidate field inputs.files.transcript.sha256",
	);
}

describe("session comparison transcript inputs", () => {
	it(
		"refuses frozen transcript bytes whose digest disagrees with the case",
		testRefusesFrozenTranscriptBytesWhoseDigestDisagreesWithTheCase,
	);
});
