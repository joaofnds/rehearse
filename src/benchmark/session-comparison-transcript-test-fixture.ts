import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { COMPARISON_ARMS } from "./comparison-record";
import { parseConfirmationGroupRecord } from "./confirmation-record";
import {
	readFrozenSessionCase,
	readSessionGroup,
} from "./session-comparison-record-reader-fixture";
import {
	digest,
	sessionGroupFile,
} from "./session-comparison-record-test-fixture";
import { JSON_INDENTATION_SPACES } from "./session-comparison-test-contract";

interface TranscriptInput {
	readonly runsDirectory: string;
	readonly caseId: string;
	readonly content: string;
}

interface FrozenTranscriptChange {
	readonly groupFile: string;
	readonly content: string;
}

async function addTranscriptInput({
	runsDirectory,
	caseId,
	content,
}: TranscriptInput): Promise<void> {
	await Array.fromAsync(COMPARISON_ARMS, async (role) => {
		const groupFile = sessionGroupFile({ caseId, role, runsDirectory });

		await addGroupTranscript({ content, groupFile });
	});
}

async function addGroupTranscript({
	groupFile,
	content,
}: FrozenTranscriptChange): Promise<void> {
	const group = await readSessionGroup(groupFile);
	const changedCaseText = await addCaseTranscript({ content, groupFile });
	const transcriptPath = join(
		dirname(groupFile),
		"inputs/transcript/prefix.jsonl",
	);

	await mkdir(dirname(transcriptPath), { recursive: true });

	await Bun.write(transcriptPath, content);

	const changedGroup = parseConfirmationGroupRecord(
		JSON.stringify({
			...group,
			inputs: {
				...group.inputs,
				files: [
					...group.inputs.files.map((file) =>
						file.kind === "case"
							? {
									kind: file.kind,
									path: file.path,
									sha256: digest(changedCaseText),
								}
							: file,
					),
					{
						kind: "transcript",
						path: "inputs/transcript/prefix.jsonl",
						sha256: digest(content),
					},
				],
			},
		}),
	);

	await Bun.write(
		groupFile,
		`${JSON.stringify(changedGroup, null, JSON_INDENTATION_SPACES)}\n`,
	);
}

async function addCaseTranscript({
	groupFile,
	content,
}: FrozenTranscriptChange): Promise<string> {
	const { casePath, declaration } = await readFrozenSessionCase(groupFile);

	const changedDeclaration = {
		...declaration,
		transcript: {
			cut: 1,
			file: "prefix.jsonl",
			sha256: digest(content),
			sourceSession: "source-session",
		},
	};
	const changedCaseText = `${JSON.stringify(changedDeclaration, null, JSON_INDENTATION_SPACES)}\n`;

	await Bun.write(casePath, changedCaseText);

	return changedCaseText;
}

async function changeFrozenTranscript({
	groupFile,
	content,
}: FrozenTranscriptChange): Promise<void> {
	const group = parseConfirmationGroupRecord(await Bun.file(groupFile).text());
	const transcript = group.inputs.files.find(
		({ kind }) => kind === "transcript",
	);
	if (transcript === undefined) {
		throw new Error("session fixture group has no frozen transcript");
	}

	await Bun.write(join(dirname(groupFile), transcript.path), content);

	const changedGroup = parseConfirmationGroupRecord(
		JSON.stringify({
			...group,
			inputs: {
				...group.inputs,
				files: group.inputs.files.map((file) =>
					file.kind === "transcript"
						? { kind: file.kind, path: file.path, sha256: digest(content) }
						: file,
				),
			},
		}),
	);

	await Bun.write(
		groupFile,
		`${JSON.stringify(changedGroup, null, JSON_INDENTATION_SPACES)}\n`,
	);
}

export { addTranscriptInput, changeFrozenTranscript };
