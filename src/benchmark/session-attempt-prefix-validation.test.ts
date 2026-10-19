import { describe, expect, it } from "bun:test";
import { rm, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
	SessionInputError,
	runSessionAttempt,
} from "#benchmark/session-attempt";
import { failureOf } from "#cli/cli-test-support";

import {
	SHA256_HEX_CHARACTERS,
	SOURCE_SESSION,
	request,
} from "./session-attempt-case-test-fixtures";
import { transcriptLine } from "./session-attempt-transcript-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
	resumingCase,
	writtenPrefix,
} from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

async function refusesATranscriptPrefixWhoseBytesDoNotMatchTheDeclaredDigestNamingTheCaseAndBothDigests(): Promise<void> {
	const prefix = await writtenPrefix(
		`${transcriptLine(SOURCE_SESSION, "bytes the declaration never hashed")}\n`,
	);
	const declared = "a".repeat(SHA256_HEX_CHARACTERS);

	const attemptRequest = request({
		projectsDirectory: await projectsRoot(),
		recordDirectory: await recordDirectory(),
		runClaude: async () =>
			await Promise.reject(new Error("a provider call must not happen")),
		sessionCase: resumingCase(prefix.path, declared),
	});

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure).toBeInstanceOf(SessionInputError);
	expect(failure.message).toBe(
		`Case probe declares transcript prefix.jsonl at ${declared}, but ${prefix.path} hashes ${prefix.sha256}`,
	);
}

async function refusesADeclaredTranscriptPrefixThatIsNotOnDiskNamingTheCaseAndTheFileBeforeAnyProviderCall(): Promise<void> {
	const prefix = await writtenPrefix(
		`${transcriptLine(SOURCE_SESSION, "bytes that will not be there")}\n`,
	);
	await rm(prefix.path);

	const attemptRequest = request({
		projectsDirectory: await projectsRoot(),
		recordDirectory: await recordDirectory(),
		runClaude: async () =>
			await Promise.reject(new Error("a provider call must not happen")),
		sessionCase: resumingCase(prefix.path, prefix.sha256),
	});

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure).toBeInstanceOf(SessionInputError);
	expect(failure.message).toBe(
		`Case probe declares transcript prefix.jsonl, but no file is at ${prefix.path}. Add the bytes to that case directory, or recapture them with \`rehearse case capture\`.`,
	);
}

async function refusesAPrefixWhoseDeclaredSourceSessionAppearsNowhereInItsBytesBeforeAnyProviderCall(): Promise<void> {
	const prefix = await writtenPrefix(
		`${transcriptLine("22222222-2222-2222-2222-222222222222", "bytes another session wrote")}\n`,
	);

	const attemptRequest = request({
		projectsDirectory: await projectsRoot(),
		recordDirectory: await recordDirectory(),
		runClaude: async () =>
			await Promise.reject(new Error("a provider call must not happen")),
		sessionCase: resumingCase(prefix.path, prefix.sha256),
	});

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure).toBeInstanceOf(SessionInputError);
	expect(failure.message).toBe(
		`Case probe declares transcript prefix.jsonl from session ${SOURCE_SESSION}, which appears nowhere in ${prefix.path}; a fork rewrites that id where it occurs, so an absent one would leave the source session's id in the attempt`,
	);
}

async function refusesADeclaredTranscriptPrefixThatIsASymlinkBeforeAnyProviderCall(): Promise<void> {
	const prefix = await writtenPrefix(
		`${transcriptLine(SOURCE_SESSION, "bytes behind the link")}\n`,
	);
	const link = join(dirname(prefix.path), "linked.jsonl");
	await symlink(prefix.path, link);

	const attemptRequest = request({
		projectsDirectory: await projectsRoot(),
		recordDirectory: await recordDirectory(),
		runClaude: async () =>
			await Promise.reject(new Error("a provider call must not happen")),
		sessionCase: resumingCase(link, prefix.sha256),
	});

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure).toBeInstanceOf(SessionInputError);
	expect(failure.message).toBe(
		`Case probe declares transcript prefix.jsonl at ${link}, which is a symlink; a prefix is read as the bytes the case directory holds`,
	);
}
describe(runSessionAttempt.name, () => {
	it(
		"refuses a transcript prefix whose bytes do not match the declared digest, naming the case and both digests",
		refusesATranscriptPrefixWhoseBytesDoNotMatchTheDeclaredDigestNamingTheCaseAndBothDigests,
	);
	it(
		"refuses a declared transcript prefix that is not on disk, naming the case and the file, before any provider call",
		refusesADeclaredTranscriptPrefixThatIsNotOnDiskNamingTheCaseAndTheFileBeforeAnyProviderCall,
	);
	it(
		"refuses a prefix whose declared source session appears nowhere in its bytes, before any provider call",
		refusesAPrefixWhoseDeclaredSourceSessionAppearsNowhereInItsBytesBeforeAnyProviderCall,
	);
	it(
		"refuses a declared transcript prefix that is a symlink, before any provider call",
		refusesADeclaredTranscriptPrefixThatIsASymlinkBeforeAnyProviderCall,
	);
});
