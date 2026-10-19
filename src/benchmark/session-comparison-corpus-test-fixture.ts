import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { updateAttempts } from "./session-comparison-attempt-record-fixture";
import { readSessionGroup } from "./session-comparison-record-reader-fixture";
import {
	digest,
	sessionGroupFile,
	updateSessionGroupInputs,
} from "./session-comparison-record-test-fixture";
import type {
	ComparisonDirectories,
	ComparisonGroupIdentity,
} from "./session-comparison-test-contract";
import { PROBE_NOTES, PROBE_SKILL } from "./session-comparison-test-contract";

interface FrozenCorpusFile {
	readonly groupFile: string;
	readonly path: string;
}

async function addFrozenCorpusFile({
	groupFile,
	path,
}: FrozenCorpusFile): Promise<void> {
	await Bun.write(join(dirname(groupFile), path), "added\n");
	await updateSessionGroupInputs(groupFile, (inputs) => ({
		...inputs,
		files: [
			...inputs.files,
			{ kind: "corpus", path, sha256: digest("added\n") },
		],
	}));
}

async function removeFrozenCorpusFile({
	groupFile,
	path,
}: FrozenCorpusFile): Promise<void> {
	await updateSessionGroupInputs(groupFile, (inputs) => ({
		...inputs,
		files: inputs.files.filter(
			(file) => file.kind !== "corpus" || file.path !== path,
		),
	}));
}

interface CandidateCorpusChange {
	readonly runsDirectory: string;
	readonly caseId: string;
	readonly content: string;
}

async function updateCandidateCorpus({
	runsDirectory,
	caseId,
	content,
}: CandidateCorpusChange): Promise<void> {
	const sourceGroupFile = sessionGroupFile({
		caseId,
		role: "candidate",
		runsDirectory,
	});
	const group = await readSessionGroup(sourceGroupFile);
	const corpusFile = group.inputs.files.find(({ kind }) => kind === "corpus");
	if (corpusFile === undefined) {
		throw new Error("session fixture group has no corpus file");
	}

	await Bun.write(join(dirname(sourceGroupFile), corpusFile.path), content);

	await updateSessionGroupInputs(sourceGroupFile, (inputs) => ({
		...inputs,
		files: inputs.files.map((file) =>
			file.kind === "corpus"
				? { kind: file.kind, path: file.path, sha256: digest(content) }
				: file,
		),
	}));

	await updateAttempts(sourceGroupFile, (attempt) => ({
		...attempt,
		corpusFiles: attempt.corpusFiles.map((file) => ({
			path: file.path,
			resolvedPath: file.resolvedPath,
			sha256: digest(content),
		})),
	}));
}

async function writeComparisonCorpus(
	{ root }: ComparisonDirectories,
	{ caseId, role }: ComparisonGroupIdentity,
): Promise<string> {
	const corpus = join(root, "sources", `${caseId}-${role}`);

	await mkdir(join(corpus, "output-styles"), { recursive: true });

	if (role !== "control") {
		await Bun.write(
			join(corpus, "output-styles", "brief.md"),
			`${role} corpus\n`,
		);
	}
	if (role !== "control" && caseId === "case-skill") {
		await Bun.write(join(corpus, PROBE_SKILL), "probe\n");
		await Bun.write(join(corpus, PROBE_NOTES), "notes\n");
	}

	return corpus;
}

export {
	writeComparisonCorpus,
	addFrozenCorpusFile,
	removeFrozenCorpusFile,
	updateCandidateCorpus,
};
