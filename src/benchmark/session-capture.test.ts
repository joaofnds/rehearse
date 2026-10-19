import { describe, expect, it } from "bun:test";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
	projectSlug,
	resolveSessionFile,
	transcriptsUnder,
} from "#benchmark/session-capture";
import { TestResources } from "#benchmark/test-support";
import { failureOf } from "#cli/cli-test-support";

import SessionProjectsBuilder from "./session-projects-test-builder";

const FIRST_SESSION_ID = "11111111-1111-1111-1111-111111111111";
const SECOND_SESSION_ID = "11111111-2222-2222-2222-222222222222";
const testResources = TestResources.forEachTest();
const resolvesAPrefixThatMatchesExactlyOneSessionFile =
	async (): Promise<void> => {
		const directory = await new SessionProjectsBuilder({
			names: [FIRST_SESSION_ID, SECOND_SESSION_ID],
		}).build(testResources);

		const resolved = await resolveSessionFile(
			await transcriptsUnder(directory),
			"11111111-1",
		);

		expect(resolved).toEqual({
			path: join(
				directory,
				"-private-tmp-project-0",
				`${FIRST_SESSION_ID}.jsonl`,
			),
			sessionId: FIRST_SESSION_ID,
		});
	};
const resolvesAFullSessionId = async (): Promise<void> => {
	const directory = await new SessionProjectsBuilder({
		names: [FIRST_SESSION_ID, SECOND_SESSION_ID],
	}).build(testResources);

	const resolved = await resolveSessionFile(
		await transcriptsUnder(directory),
		SECOND_SESSION_ID,
	);

	expect(resolved.sessionId).toBe(SECOND_SESSION_ID);
};
const refusesAPrefixThatMatchesMoreThanOneFileNaming =
	async (): Promise<void> => {
		const directory = await new SessionProjectsBuilder({
			names: [FIRST_SESSION_ID, SECOND_SESSION_ID],
		}).build(testResources);

		expect(
			resolveSessionFile(await transcriptsUnder(directory), "11111111"),
		).rejects.toThrow(
			`Session prefix 11111111 matches 2 session files: ${FIRST_SESSION_ID}, ${SECOND_SESSION_ID}`,
		);
	};
const namesAReadableSampleAndTheCountWhenAPrefix = async (): Promise<void> => {
	const many = Array.from(
		{ length: 12 },
		(_value, index) => `2222222${index}-0000-0000-0000-000000000000`,
	);
	const directory = await new SessionProjectsBuilder({
		names: [...many],
	}).build(testResources);

	const failure = await failureOf(
		resolveSessionFile(await transcriptsUnder(directory), "2"),
	);

	expect(failure.message).toStartWith(
		"Session prefix 2 matches 12 session files: ",
	);
	expect(failure.message).toEndWith(" and 7 more; give more of the session id");
};
const namesThePrefixNotAnUnrelatedUnidentifiableTranscriptWhenNothing =
	async (): Promise<void> => {
		const directory = await new SessionProjectsBuilder({
			names: [FIRST_SESSION_ID],
		}).build(testResources);
		const nameless = join(directory, "-private-tmp-project-9");
		await mkdir(nameless, { recursive: true });
		await writeFile(
			join(nameless, "transcript.jsonl"),
			'{"type":"queue-operation"}\n',
		);

		const failure = await failureOf(
			resolveSessionFile(await transcriptsUnder(directory), "deadbeef"),
		);

		expect(failure.message).toBe(
			"Session prefix deadbeef matches no session file",
		);
	};
const refusesAPrefixThatMatchesNoFileNamingThePrefix =
	async (): Promise<void> => {
		const directory = await new SessionProjectsBuilder({
			names: [FIRST_SESSION_ID],
		}).build(testResources);

		expect(
			resolveSessionFile(await transcriptsUnder(directory), "deadbeef"),
		).rejects.toThrow("Session prefix deadbeef matches no session file");
	};
const readsADirectoryThatIsNotThereAsHoldingNo = async (): Promise<void> => {
	expect(await transcriptsUnder("/no/such/projects")).toEqual([]);
};
const replacesEveryPathSeparatorWithADash = (): void => {
	expect(projectSlug("/private/tmp/x")).toBe("-private-tmp-x");
};
const namesAPathThroughTheTmpSymlinkDifferentlyFromIts =
	async (): Promise<void> => {
		const real = await realpath("/tmp");

		expect(projectSlug(real)).not.toBe(projectSlug("/tmp"));
		expect(projectSlug(`${real}/x`)).toBe(`${real.replaceAll("/", "-")}-x`);
	};
describe(resolveSessionFile.name, () => {
	it(
		"resolves a prefix that matches exactly one session file",
		resolvesAPrefixThatMatchesExactlyOneSessionFile,
	);
	it("resolves a full session id", resolvesAFullSessionId);
	it(
		"refuses a prefix that matches more than one file, naming both",
		refusesAPrefixThatMatchesMoreThanOneFileNaming,
	);
	it(
		"names a readable sample and the count when a prefix matches many",
		namesAReadableSampleAndTheCountWhenAPrefix,
	);
	it(
		"names the prefix, not an unrelated unidentifiable transcript, when nothing matches",
		namesThePrefixNotAnUnrelatedUnidentifiableTranscriptWhenNothing,
	);
	it(
		"refuses a prefix that matches no file, naming the prefix",
		refusesAPrefixThatMatchesNoFileNamingThePrefix,
	);
});
describe(transcriptsUnder.name, () => {
	it(
		"reads a directory that is not there as holding no sessions",
		readsADirectoryThatIsNotThereAsHoldingNo,
	);
});
describe(projectSlug.name, () => {
	it(
		"replaces every path separator with a dash",
		replacesEveryPathSeparatorWithADash,
	);
	it(
		"names a path through the /tmp symlink differently from its real path",
		namesAPathThroughTheTmpSymlinkDifferentlyFromIts,
	);
});
