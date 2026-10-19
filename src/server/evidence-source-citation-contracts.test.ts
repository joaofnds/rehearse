import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import type { RecordedStageEvidence } from "#benchmark/contracts";
import StageEvidenceRecordBuilder from "#server/api-evidence-record-builder";
import { ApiTestWorkspace } from "#server/api-test-workspace";
import type { StageEvidenceRecord } from "#server/evidence-judged-items";
import type { SourceView } from "#server/evidence-source-contract";
import {
	RUN,
	RecordedEvidenceBuilder,
} from "#server/evidence-source-records-test-fixture";

const workspace = new ApiTestWorkspace();
const DEFAULT_INPUT = new StageEvidenceRecordBuilder().build().input;
interface MissingCitation {
	readonly name: string;
	readonly evidence: RecordedStageEvidence;
	readonly props?: Partial<StageEvidenceRecord>;
	readonly message: string;
}
const MISSING_CITATIONS: readonly MissingCitation[] = [
	{
		evidence: new RecordedEvidenceBuilder({
			locator: {
				endLine: 1,
				file: "missing.md",
				kind: "lines",
				occurrences: 1,
				startLine: 1,
			},
		}).build(),
		message: "The record holds no missing.md for artifact",
		name: "the cited file is absent",
	},
	{
		evidence: new RecordedEvidenceBuilder({
			locator: {
				end: 1,
				exchange: 0,
				field: "message",
				kind: "exchange",
				start: 0,
			},
			source: "transcript",
		}).build(),
		message: "The record holds no message in exchange 1",
		name: "the cited exchange is absent",
	},
	{
		evidence: new RecordedEvidenceBuilder({
			locator: {
				end: 1,
				exchange: 0,
				field: "productOwnerAnswer",
				kind: "exchange",
				start: 0,
			},
			source: "transcript",
		}).build(),
		message: "The record holds no productOwnerAnswer in exchange 1",
		name: "the cited exchange has no answer",
		props: {
			input: {
				...DEFAULT_INPUT,
				transcript: {
					...DEFAULT_INPUT.transcript,
					exchanges: [
						{ agent: { message: "Which table?", status: "QUESTION" } },
					],
				},
			},
		},
	},
	{
		evidence: new RecordedEvidenceBuilder({
			locator: { index: 0, kind: "commit-subject" },
			source: "commit-subjects",
		}).build(),
		message: "The record holds no commit subject 1",
		name: "the record has no commit subjects",
	},
	{
		evidence: new RecordedEvidenceBuilder({
			locator: { index: 1, kind: "commit-subject" },
			source: "commit-subjects",
		}).build(),
		message: "The record holds no commit subject 2",
		name: "the subject index is outside the recorded subjects",
		props: { input: { ...DEFAULT_INPUT, commitSubjects: ["present"] } },
	},
];
interface PresentCitation {
	readonly name: string;
	readonly evidence: RecordedStageEvidence;
	readonly props?: Partial<StageEvidenceRecord>;
	readonly view: SourceView;
}
const PRESENT_CITATIONS: readonly PresentCitation[] = [
	{
		evidence: new RecordedEvidenceBuilder({
			locator: {
				endLine: 1,
				file: "empty.txt",
				kind: "lines",
				occurrences: 1,
				startLine: 1,
			},
			source: "baseline-context",
		}).build(),
		name: "a recorded file is empty",
		props: {
			input: {
				...DEFAULT_INPUT,
				baselineContext: [{ content: "", path: "empty.txt" }],
			},
		},
		view: { kind: "text", label: "empty.txt", text: "" },
	},
	{
		evidence: new RecordedEvidenceBuilder({
			locator: {
				end: 1,
				exchange: 0,
				field: "productOwnerAnswer",
				kind: "exchange",
				start: 0,
			},
			source: "transcript",
		}).build(),
		name: "a recorded answer is empty",
		props: {
			input: {
				...DEFAULT_INPUT,
				transcript: {
					...DEFAULT_INPUT.transcript,
					exchanges: [
						{
							agent: { message: "Which table?", status: "QUESTION" },
							productOwnerAnswer: "",
						},
					],
				},
			},
		},
		view: {
			kind: "text",
			label: "exchange 1 productOwnerAnswer",
			span: { end: 1, start: 0 },
			text: "",
		},
	},
	{
		evidence: new RecordedEvidenceBuilder({
			locator: { index: 0, kind: "commit-subject" },
			source: "commit-subjects",
		}).build(),
		name: "a recorded subject is empty",
		props: { input: { ...DEFAULT_INPUT, commitSubjects: [""] } },
		view: { kind: "text", label: "commit subject 1", text: "" },
	},
	{
		evidence: new RecordedEvidenceBuilder({
			locator: { kind: "harness", recorded: false, result: "harnessFailure" },
			source: "local-checks",
		}).build(),
		name: "a harness value is absent",
		view: { kind: "harness", recorded: false, result: "harnessFailure" },
	},
];
afterEach(async () => {
	await workspace.dispose();
});
describe("/api/runs/:run/stages/:stage/evidence/:section/:item/:index", () => {
	describe("GET", () => {
		describe("when cited content is absent", () => {
			it.each([...MISSING_CITATIONS])(
				"retains the source lookup refusal when $name",
				missingCitation,
			);
		});
		describe("when recorded values are empty or optional", () => {
			it.each([...PRESENT_CITATIONS])(
				"preserves the recorded view when $name",
				presentCitation,
			);
		});
	});
});
async function missingCitation({
	evidence,
	props,
	message,
}: MissingCitation): Promise<void> {
	const runsDirectory = await workspace.emptyDirectory(
		"rehearse-citation-contract-",
	);
	const record = new StageEvidenceRecordBuilder(props).citing(evidence).build();
	await Bun.write(
		join(runsDirectory, `${RUN}.build.json`),
		JSON.stringify(record),
	);
	const app = await workspace.start({ runsDirectory });

	const response = await app.stageEvidence({
		index: "0",
		item: "scope",
		run: RUN,
		section: "requirements",
		stage: "build",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	expect(await response.json()).toEqual({ error: message });
}
async function presentCitation({
	evidence,
	props,
	view,
}: PresentCitation): Promise<void> {
	const runsDirectory = await workspace.emptyDirectory(
		"rehearse-citation-contract-",
	);
	const record = new StageEvidenceRecordBuilder(props).citing(evidence).build();
	await Bun.write(
		join(runsDirectory, `${RUN}.build.json`),
		JSON.stringify(record),
	);
	const app = await workspace.start({ runsDirectory });

	const response = await app.stageEvidence({
		index: "0",
		item: "scope",
		run: RUN,
		section: "requirements",
		stage: "build",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toHaveProperty("view", view);
}
