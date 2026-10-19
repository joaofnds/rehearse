import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { captureBaselineContext } from "./checks";
import { runCommand } from "./command";
import { MAX_CONTEXT_FILE_BYTES } from "./config";
import { captureBuildCandidate } from "./target";
import { TestResources, commitAll } from "./test-support";

const BINARY_IMAGE_CONTENT_HEX = "89504e47000d0a1a";

const ONE_BYTE_OVERFLOW = 1;

const testResources = TestResources.forEachTest();

const captureBuildCandidateFreezesUntrackedBuildFiles =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		await Bun.write(
			join(source.directory, "uncommitted.ts"),
			"export const uncommitted = true;\n",
		);

		const candidate = await captureBuildCandidate(source.directory, source.sha);

		expect(candidate.changedPaths).toContain("uncommitted.ts");
		expect(candidate.diff).toContain("export const uncommitted = true;");
	};

const captureBuildCandidateOmitsUntrackedContentBeyondTheCaptureLimit =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		await Bun.write(
			join(source.directory, "huge.log"),
			"y".repeat(MAX_CONTEXT_FILE_BYTES + ONE_BYTE_OVERFLOW),
		);

		const candidate = await captureBuildCandidate(source.directory, source.sha);

		expect(candidate.changedPaths).toContain("huge.log");
		expect(candidate.diff).toContain("bytes omitted");
		expect(candidate.diff).not.toContain("yyyy");
	};

const captureBuildCandidateSummarizesCommittedBinaryChangesInsteadOfEmbeddingThem =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		await Bun.write(
			join(source.directory, "asset.bin"),
			new Uint8Array(Buffer.from(BINARY_IMAGE_CONTENT_HEX, "hex")),
		);
		await commitAll(source.directory, "feat: add binary asset");

		const candidate = await captureBuildCandidate(source.directory, source.sha);

		expect(candidate.diff).toContain("Binary files");
		expect(candidate.diff).not.toContain("GIT binary patch");
	};

const captureBaselineContextCapturesEveryTrackedFileExceptTheLockfile =
	async (): Promise<void> => {
		const source = await testResources.createRepository();

		const tracked = await runCommand(["git", "ls-files"], source.directory);

		const context = await captureBaselineContext(source.directory);

		expect(tracked).toContain("bun.lock");
		expect(context.map(({ path }) => path).toSorted()).toEqual([
			".gitignore",
			"base.txt",
			"package.json",
		]);
	};

const captureBaselineContextReplacesFilesBeyondThePerfileCaptureLimitWithAnOmissionMarker =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		await Bun.write(
			join(source.directory, "huge.txt"),
			"x".repeat(MAX_CONTEXT_FILE_BYTES + ONE_BYTE_OVERFLOW),
		);
		await commitAll(source.directory, "chore: huge file");

		const context = await captureBaselineContext(source.directory);
		const huge = context.find(({ path }) => path === "huge.txt");

		expect(huge?.content).toContain("bytes omitted");
		expect(huge?.content).not.toContain("xxxx");
	};

const captureBaselineContextReplacesBinaryFilesWithABinaryMarker =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		await Bun.write(
			join(source.directory, "image.bin"),
			new Uint8Array(Buffer.from(BINARY_IMAGE_CONTENT_HEX, "hex")),
		);
		await commitAll(source.directory, "chore: binary file");

		const context = await captureBaselineContext(source.directory);
		const binary = context.find(({ path }) => path === "image.bin");

		expect(binary?.content).toBe("[binary file omitted]");
	};

describe(captureBuildCandidate.name, () => {
	it(
		"freezes untracked Build files",
		captureBuildCandidateFreezesUntrackedBuildFiles,
	);

	it(
		"omits untracked content beyond the capture limit",
		captureBuildCandidateOmitsUntrackedContentBeyondTheCaptureLimit,
	);

	it(
		"summarizes committed binary changes instead of embedding them",
		captureBuildCandidateSummarizesCommittedBinaryChangesInsteadOfEmbeddingThem,
	);
});

describe(captureBaselineContext.name, () => {
	it(
		"captures every tracked file except the lockfile",
		captureBaselineContextCapturesEveryTrackedFileExceptTheLockfile,
	);

	it(
		"replaces files beyond the per-file capture limit with an omission marker",
		captureBaselineContextReplacesFilesBeyondThePerfileCaptureLimitWithAnOmissionMarker,
	);

	it(
		"replaces binary files with a binary marker",
		captureBaselineContextReplacesBinaryFilesWithABinaryMarker,
	);
});
