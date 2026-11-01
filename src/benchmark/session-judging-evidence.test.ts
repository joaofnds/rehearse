import { describe, expect, it } from "bun:test";
import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";

import { CliTestWorkspace } from "#cli/cli-test-support";

import runSessionJudge from "./session-judge";
import { selectedJudgeText, sessionJudgeInput } from "./session-judge-evidence";
import {
	sessionJudgeRequest,
	sessionJudgeResponse,
} from "./session-judge-test-fixtures";
import { preserveStateEvidence } from "./session-state-evidence";

const workspace = CliTestWorkspace.forEachTest();

describe(sessionJudgeInput.name, () => {
	it("includes only the recorded transcript region and describes an absent output file", async () => {
		const directory = await workspace.createDirectory(
			"rehearse-judge-evidence-",
		);
		const stateDirectory = join(directory, "state");
		await mkdir(stateDirectory);
		const transcriptFile = join(directory, "transcript.jsonl");
		await Bun.write(transcriptFile, "inherited\nattempt line\n");

		const input = await sessionJudgeInput({
			boundary: 1,
			files: ["answer.txt"],
			prompt: "task",
			reply: "done",
			stateDirectory,
			transcriptFile,
		});

		expect(input.unavailable).toEqual([]);
		expect(input.files).toContainEqual({
			content: "attempt line",
			path: "transcript.jsonl",
		});
		expect(input.files).toContainEqual({
			content: "state/answer.txt: absent from the preserved tree",
			path: "evidence.txt",
		});
	});

	it("withholds a grade when selected state was never retained", async () => {
		const directory = await workspace.createDirectory(
			"rehearse-judge-evidence-",
		);

		const input = await sessionJudgeInput({
			boundary: undefined,
			files: ["answer.txt"],
			prompt: "task",
			reply: "done",
			stateDirectory: join(directory, "missing"),
			transcriptFile: join(directory, "transcript.jsonl"),
		});

		expect(input.unavailable).toEqual([
			"The attempt preserved no readable final tree",
		]);
	});
});

describe("preserved Judge evidence", () => {
	it("retains a selected omitted link as unavailable rather than grading its absence", async () => {
		const source = await workspace.createDirectory("rehearse-judge-source-");
		const record = await workspace.createDirectory("rehearse-judge-record-");
		await symlink("/host/private-file", join(source, "answer.txt"));
		const stateDirectory = await preserveStateEvidence(source, record);

		const input = await sessionJudgeInput({
			boundary: undefined,
			files: ["answer.txt"],
			prompt: "task",
			reply: "done",
			stateDirectory,
			transcriptFile: join(record, "transcript.jsonl"),
		});

		expect(input.unavailable).toEqual([
			"state/answer.txt was omitted during retention because it was not a regular file or directory",
		]);
	});
	it("excludes all inherited records when the prefix includes blank lines", async () => {
		const record = await workspace.createDirectory("rehearse-judge-prefix-");
		const transcriptFile = join(record, "transcript.jsonl");
		await Bun.write(
			transcriptFile,
			"inherited one\n\ninherited two\nattempt only\n",
		);

		const input = await sessionJudgeInput({
			boundary: 2,
			files: [],
			prompt: "task",
			reply: "done",
			stateDirectory: join(record, "state"),
			transcriptFile,
		});

		expect(input.files).toContainEqual({
			content: "attempt only",
			path: "transcript.jsonl",
		});
	});
});

describe(selectedJudgeText.name, () => {
	it("refuses a selected file reached through a directory symlink", async () => {
		const directory = await workspace.createDirectory("rehearse-judge-link-");
		const outside = await workspace.createDirectory("rehearse-judge-outside-");
		await Bun.write(join(outside, "secret.txt"), "private host data");
		await symlink(outside, join(directory, "linked"));

		const selected = await selectedJudgeText(directory, "linked/secret.txt");

		expect(selected).toEqual({
			detail: "linked/secret.txt reaches a symlink",
			kind: "refused",
		});
	});
	it.each(["/etc/passwd", "../outside.txt", "a/../../outside.txt"])(
		"refuses an escaping selected path %s",
		async (path) => {
			const directory = await workspace.createDirectory("rehearse-judge-link-");

			expect(await selectedJudgeText(directory, path)).toMatchObject({
				kind: "refused",
			});
		},
	);
});

async function gradesSelectedText(): Promise<void> {
	const source = await workspace.createDirectory("rehearse-judge-source-");
	const record = await workspace.createDirectory("rehearse-judge-record-");
	await Bun.write(join(source, "answer.txt"), "answer from saved state");
	const stateDirectory = await preserveStateEvidence(source, record);
	const input = await sessionJudgeInput({
		boundary: undefined,
		files: ["answer.txt"],
		prompt: "task",
		reply: "done",
		stateDirectory,
		transcriptFile: join(record, "transcript.jsonl"),
	});
	const request = sessionJudgeRequest(
		async () =>
			await Promise.resolve(
				sessionJudgeResponse({
					path: "state/answer.txt",
					quote: "answer from saved state",
				}),
			),
	);

	const result = await runSessionJudge({ ...request, input });

	expect(result).toMatchObject({
		grade: {
			requirements: [
				{
					evidence: [
						{
							locator: { file: "state/answer.txt", kind: "lines" },
							quote: "answer from saved state",
						},
					],
				},
			],
		},
		status: "GRADED",
	});
	expect(input.files).toContainEqual({
		content: "answer from saved state",
		path: "state/answer.txt",
	});
}

describe("selected retained text", () => {
	it(
		"grades saved final-file content with a located citation",
		gradesSelectedText,
	);
});
