import { randomUUID } from "node:crypto";
import { lstat, mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { SessionCase, TranscriptPrefix } from "./case";
import { fileLines, terminatedFileLines } from "./file-lines";
import SessionInputError from "./session-attempt-preparation-contract";
import type { SessionNaming } from "./session-attempt-preparation-contract";

interface TranscriptForkPaths {
	readonly sourcePath: string;
	readonly destinationPath: string;
}

/**
 * A transcript prefix is a session file, which runs to several megabytes, and
 * a session id never spans two records, so the rewrite goes line by line rather
 * than over one string holding the whole file. Each line keeps the terminator
 * it had, so the fork differs from its source in the session id and nothing
 * else.
 */
async function forkTranscript(
	{ sourcePath, destinationPath }: TranscriptForkPaths,
	sourceSession: string,
	freshSession: string,
): Promise<void> {
	const writer = Bun.file(destinationPath).writer();

	for await (const line of terminatedFileLines(sourcePath)) {
		const rewritten = line.text.replaceAll(sourceSession, freshSession);
		await writer.write(line.terminated ? `${rewritten}\n` : rewritten);
	}

	await writer.end();
}

/**
 * The declaration names the file, so the bytes on disk can be any file the
 * machine has and the declared digest is the only claim about which bytes this
 * case resumes. Hashing before the fork is what turns that claim into a
 * precondition: an attempt either resumes the bytes the case was captured from
 * or it refuses, before the provider is paid to read them.
 *
 * A prefix that is absent is the same refusal, not a filesystem error. A case
 * whose prefix is withheld from publication reaches a clone as a declaration
 * with no bytes beside it, so absence is an ordinary state there, and the
 * message says how to get the bytes back.
 *
 * A symlink is refused rather than followed, for the reason `seedFixture`
 * refuses one: the case directory now travels with the repository, so a link
 * committed into it would name a file on the machine that runs the case and
 * send those bytes to the provider.
 */
async function verifiedPrefix(
	sessionCase: SessionCase,
	transcriptPath: string,
	declared: TranscriptPrefix,
): Promise<void> {
	if (!(await Bun.file(transcriptPath).exists())) {
		throw new SessionInputError(
			`Case ${sessionCase.declaration.id} declares transcript ${declared.file}, but no file is at ${transcriptPath}. Add the bytes to that case directory, or recapture them with \`rehearse case capture\`.`,
		);
	}

	const entry = await lstat(transcriptPath);
	if (entry.isSymbolicLink()) {
		throw new SessionInputError(
			`Case ${sessionCase.declaration.id} declares transcript ${declared.file} at ${transcriptPath}, which is a symlink; a prefix is read as the bytes the case directory holds`,
		);
	}

	const found = await transcriptDigest(transcriptPath);
	if (found !== declared.sha256) {
		throw new SessionInputError(
			`Case ${sessionCase.declaration.id} declares transcript ${declared.file} at ${declared.sha256}, but ${transcriptPath} hashes ${found}`,
		);
	}

	if (!(await carriesSession(transcriptPath, declared.sourceSession))) {
		throw new SessionInputError(
			`Case ${sessionCase.declaration.id} declares transcript ${declared.file} from session ${declared.sourceSession}, which appears nowhere in ${transcriptPath}; a fork rewrites that id where it occurs, so an absent one would leave the source session's id in the attempt`,
		);
	}
}

/**
 * `forkTranscript` rewrites identity by replacing the source session's id where
 * it occurs, so a prefix that does not carry that id is forked into a copy still
 * naming the session it was cut from, and the attempt resumes under a name the
 * harness never minted. The check matches how the fork reads the bytes, a
 * substring over each line, rather than parsing records, because that is the
 * occurrence the rewrite acts on.
 */
async function carriesSession(
	transcriptPath: string,
	sourceSession: string,
): Promise<boolean> {
	for await (const line of fileLines(transcriptPath)) {
		if (line.includes(sourceSession)) {
			return true;
		}
	}

	return false;
}

/**
 * A resumed session is the fork the harness wrote under a fresh uuid; a session
 * with no transcript is named by that uuid through `--session-id`. Either way
 * the attempt owns exactly `<sessionId>.jsonl` under its slug.
 */
async function prepareSession(
	sessionCase: SessionCase,
	slug: string,
): Promise<SessionNaming> {
	const sessionId = randomUUID();
	const { transcriptPath, declaration } = sessionCase;
	if (transcriptPath === undefined || declaration.transcript === undefined) {
		return { resumed: false, sessionId };
	}

	await verifiedPrefix(sessionCase, transcriptPath, declaration.transcript);

	await mkdir(slug, { recursive: true });
	await forkTranscript(
		{
			destinationPath: join(slug, `${sessionId}.jsonl`),
			sourcePath: transcriptPath,
		},
		declaration.transcript.sourceSession,
		sessionId,
	);

	return { resumed: true, sessionId };
}
async function transcriptDigest(path: string): Promise<string> {
	const hasher = new Bun.CryptoHasher("sha256");
	for await (const chunk of Bun.file(path).stream()) {
		hasher.update(chunk);
	}

	return hasher.digest("hex");
}
export { forkTranscript, prepareSession };
