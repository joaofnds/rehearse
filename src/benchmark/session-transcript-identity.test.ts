import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	resolveSessionFile,
	transcriptsUnder,
} from "#benchmark/session-capture";
import { TestResources } from "#benchmark/test-support";
import { failureOf } from "#cli/cli-test-support";

import SessionProjectsBuilder from "./session-projects-test-builder";

const FIRST_SESSION_ID = "11111111-1111-1111-1111-111111111111";
const SECOND_SESSION_ID = "11111111-2222-2222-2222-222222222222";
const testResources = TestResources.forEachTest();
const identifiesASessionByTheIdItsRecordsCarryNot = async (): Promise<void> => {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-attempt-"));
	testResources.track(directory);
	await writeFile(
		join(directory, "transcript.jsonl"),
		`${JSON.stringify({ sessionId: FIRST_SESSION_ID, type: "queue-operation" })}\n`,
	);

	const resolved = await resolveSessionFile(
		await transcriptsUnder(directory),
		FIRST_SESSION_ID,
	);

	expect(resolved).toEqual({
		path: join(directory, "transcript.jsonl"),
		sessionId: FIRST_SESSION_ID,
	});
};
const refusesATranscriptWhoseRecordsCarryNoSessionIdNaming =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-attempt-"));
		testResources.track(directory);
		const path = join(directory, "transcript.jsonl");
		await writeFile(path, '{"type":"queue-operation"}\n');

		const failure = await failureOf(
			resolveSessionFile(await transcriptsUnder(directory), "1111"),
		);

		expect(failure.message).toBe(
			`No record in ${path} carries a session id, so it names no session to capture`,
		);
	};
const resolvesTheSessionsOwnFileWhenASubagentTranscriptCarries =
	async (): Promise<void> => {
		const directory = await new SessionProjectsBuilder({
			names: [FIRST_SESSION_ID],
		}).build(testResources);
		const subagents = join(
			directory,
			"-private-tmp-project-0",
			FIRST_SESSION_ID,
			"subagents",
		);
		await mkdir(subagents, { recursive: true });
		await writeFile(
			join(subagents, "agent-a1b2c3.jsonl"),
			`${JSON.stringify({ sessionId: FIRST_SESSION_ID })}\n`,
		);

		const resolved = await resolveSessionFile(
			await transcriptsUnder(directory),
			FIRST_SESSION_ID,
		);

		expect(resolved.path).toBe(
			join(directory, "-private-tmp-project-0", `${FIRST_SESSION_ID}.jsonl`),
		);
	};
const refusesNamingTheFilesWhenSeveralTranscriptsClaimOneSession =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-attempt-"));
		testResources.track(directory);
		const record = `${JSON.stringify({ sessionId: FIRST_SESSION_ID })}\n`;
		await writeFile(join(directory, "transcript.jsonl"), record);
		await writeFile(join(directory, "another.jsonl"), record);

		const failure = await failureOf(
			resolveSessionFile(await transcriptsUnder(directory), FIRST_SESSION_ID),
		);

		expect(failure.message).toBe(
			`Session ${FIRST_SESSION_ID} is claimed by 2 transcripts and named by none of them: ${join(directory, "another.jsonl")}, ${join(directory, "transcript.jsonl")}`,
		);
	};
const refusesATranscriptWhoseRecordsCarryMoreThanOneSession =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-attempt-"));
		testResources.track(directory);
		const path = join(directory, "transcript.jsonl");
		await writeFile(
			path,
			`${JSON.stringify({ sessionId: FIRST_SESSION_ID })}\n${JSON.stringify({
				sessionId: SECOND_SESSION_ID,
			})}\n`,
		);

		const failure = await failureOf(
			resolveSessionFile(await transcriptsUnder(directory), "1111"),
		);

		expect(failure.message).toBe(
			`Records in ${path} carry 2 session ids: ${FIRST_SESSION_ID}, ${SECOND_SESSION_ID}, so it names no single session to capture`,
		);
	};
const resolvesATranscriptCarryingSeveralIdsWhenItsFileName =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-projects-"));
		testResources.track(directory);
		const path = join(directory, `${SECOND_SESSION_ID}.jsonl`);
		await writeFile(
			path,
			`${JSON.stringify({ sessionId: FIRST_SESSION_ID })}\n${JSON.stringify({
				sessionId: SECOND_SESSION_ID,
			})}\n`,
		);

		const resolved = await resolveSessionFile(
			await transcriptsUnder(directory),
			SECOND_SESSION_ID,
		);

		expect(resolved).toEqual({ path, sessionId: SECOND_SESSION_ID });
	};
describe(resolveSessionFile.name, () => {
	it(
		"identifies a session by the id its records carry, not by its file name",
		identifiesASessionByTheIdItsRecordsCarryNot,
	);
	it(
		"refuses a transcript whose records carry no session id, naming the file",
		refusesATranscriptWhoseRecordsCarryNoSessionIdNaming,
	);
	it(
		"resolves the session's own file when a subagent transcript carries the same id",
		resolvesTheSessionsOwnFileWhenASubagentTranscriptCarries,
	);
	it(
		"refuses, naming the files, when several transcripts claim one session and none is the session's own",
		refusesNamingTheFilesWhenSeveralTranscriptsClaimOneSession,
	);
	it(
		"refuses a transcript whose records carry more than one session id, naming them",
		refusesATranscriptWhoseRecordsCarryMoreThanOneSession,
	);
	it(
		"resolves a transcript carrying several ids when its file name is one of them",
		resolvesATranscriptCarryingSeveralIdsWhenItsFileName,
	);
});
