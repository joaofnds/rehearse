import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import {
	evidenceApp,
	evidenceRun as run,
} from "#server/api-evidence-test-fixture";
import { ApiTestWorkspace } from "#server/api-test-workspace";

const workspace = new ApiTestWorkspace();

afterEach(async () => {
	await workspace.dispose();
});

describe("GET /api/runs/:run/stages/:stage/evidence/:section/:item/:index", () => {
	it(
		"serves a stage evidence item's recorded source, never the path the judge wrote",
		verifyServesAStageEvidenceItemSRecordedSourceNever,
	);

	it.each([
		[
			"an evidence item the grade lacks",
			`/api/runs/${run}/stages/build/evidence/requirements/scope/1`,
		],
		[
			"a stage the run did not record",
			`/api/runs/${run}/stages/ship/evidence/requirements/scope/0`,
		],
		[
			"a stage named ..",
			`/api/runs/${run}/stages/%2E%2E/evidence/requirements/scope/0`,
		],
		[
			"a stage holding a slash",
			`/api/runs/${run}/stages/build%2Fx/evidence/requirements/scope/0`,
		],
	])("answers 404 for %s", async (_label, url) => {
		const app = await evidenceApp(workspace);

		const response = await app.read(url);

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	});
});

describe("GET /api/runs/:run/final/evidence/:item/:index", () => {
	it(
		"serves the final judge's evidence item",
		verifyServesTheFinalJudgeSEvidenceItem,
	);

	it(
		"refuses a run id with a traversing segment",
		verifyRefusesARunIdWithATraversingSegment,
	);
});

async function verifyServesAStageEvidenceItemSRecordedSourceNever(): Promise<void> {
	const app = await evidenceApp(workspace);

	const response = await app.stageEvidence({
		index: "0",
		item: "scope",
		run,
		section: "requirements",
		stage: "build",
	});
	const body: unknown = await response.json();

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(body).toMatchObject({
		path: "../../etc/passwd",
		source: "baseline-context",
		view: {
			kind: "text",
			label: "../../etc/passwd",
			span: { end: 14, start: 0 },
			text: "recorded bytes\n",
		},
	});
	expect(JSON.stringify(body)).not.toContain("root:");
}

async function verifyServesTheFinalJudgeSEvidenceItem(): Promise<void> {
	const app = await evidenceApp(workspace);

	const response = await app.finalEvidence({ index: "0", item: "scope", run });

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toMatchObject({
		view: { kind: "text", text: "recorded bytes\n" },
	});
}

async function verifyRefusesARunIdWithATraversingSegment(): Promise<void> {
	const app = await evidenceApp(workspace);

	const response = await app.finalEvidence({
		index: "0",
		item: "scope",
		run: "..%2Foutside",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
}
