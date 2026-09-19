import { randomUUID } from "node:crypto";
import {
	cp,
	lstat,
	mkdir,
	mkdtemp,
	readdir,
	realpath,
	rename,
	rm,
	rmdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { SessionCase, TranscriptPrefix } from "./case";
import { readClaudeCallMetrics } from "./claude";
import type { SessionSettings } from "./claude";
import { CommandError, runCommand } from "./command";
import type { ClaudeCallMetrics, Immutable } from "./contracts";
import { claudeEnvelopeSchema } from "./contracts";
import { fileLines, terminatedFileLines } from "./file-lines";
import { projectSlug } from "./session-capture";
import type { CheckResult } from "./session-check";
import type { SessionCorpusSnapshot } from "./session-corpus";
import {
	installSessionCorpusSnapshot,
	snapshotStyleName,
} from "./session-corpus";
import { evaluateChecks } from "./session-check";
import type { ContextManifest } from "./context-manifest";
import { observedManifest } from "./context-manifest";
import type { TranscriptDiagnostics, TranscriptLine } from "./transcript";
import {
	outputStyles,
	parseTranscriptFile,
	transcriptDiagnostics,
	toolUses,
} from "./transcript";
import { SessionInvocationError } from "./session-invocation-error";
import { normalizeContextEvidence } from "./context-evidence";
import { STORED_GIT_DIRECTORY } from "./git-directory-name";
import { preserveStateEvidence } from "./session-state-evidence";
import type { StateResult } from "./session-state-check";
import { gradeStateEvidence } from "./session-state-check";
import type {
	ContextEvidence,
	ContextEvidenceSource,
	ContextRateCatalog,
} from "./context-evidence";

export type ClaudeRunner = (
	command: readonly string[],
	cwd: string,
) => Promise<string>;

export interface SessionAttemptRequest {
	readonly sessionCase: SessionCase;
	readonly settings: SessionSettings;
	readonly projectsDirectory: string;
	readonly recordDirectory: string;
	readonly runClaude: ClaudeRunner;
	readonly corpusSnapshot?: SessionCorpusSnapshot | undefined;
	readonly contextEvidenceSource?: ContextEvidenceSource | undefined;
	readonly contextRateCatalog?: ContextRateCatalog | undefined;
}

/**
 * A session that terminated without producing a reply (max turns, an exhausted
 * budget) has no reply to check, which is a different fact from a reply that
 * failed one. `reply` is absent exactly when the outcome is `NO_REPLY`, so no
 * value of this type says a check passed over a reply that never arrived.
 */
export interface SessionAttempt {
	readonly attemptDirectory: string;
	readonly reply: string | undefined;
	readonly transcriptFile: string;
	readonly metrics: ClaudeCallMetrics | undefined;
	readonly outcome:
		| "SUCCESSFUL"
		| "UNSUCCESSFUL"
		| "NO_REPLY"
		| "EXECUTION_FAILED";
	readonly checks: readonly CheckResult[];
	readonly contextManifest: ContextManifest | undefined;
	readonly transcriptDiagnostics: Immutable<TranscriptDiagnostics>;
	readonly contextEvidence?: ContextEvidence | undefined;
	readonly stateEvidenceDirectory?: string | undefined;
	readonly stateResults?: readonly StateResult[] | undefined;
	readonly stateGradingError?: string | undefined;
}

/**
 * A transcript prefix is a session file, which runs to several megabytes, and
 * a session id never spans two records, so the rewrite goes line by line rather
 * than over one string holding the whole file. Each line keeps the terminator
 * it had, so the fork differs from its source in the session id and nothing
 * else.
 */
export async function forkTranscript(
	sourcePath: string,
	destinationPath: string,
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

export interface SessionNaming {
	readonly sessionId: string;
	readonly resumed: boolean;
}

/**
 * The overlaid style is selected rather than replacing the case's settings: a
 * case declares its own overlay, and dropping it to name a style would silently
 * change what the attempt measures.
 */
function selectedSettings(
	sessionCase: SessionCase,
	styleName: string | undefined,
): string | undefined {
	if (styleName === undefined) {
		return sessionCase.settings === undefined
			? undefined
			: JSON.stringify(sessionCase.settings);
	}

	return JSON.stringify({ ...sessionCase.settings, outputStyle: styleName });
}

/**
 * The attempt names its own session so that the session file it will own is
 * known before the call rather than inferred from the directory afterwards: a
 * resumed session is named by the uuid the fork rewrote, a fresh one by
 * `--session-id`. Without a name of its own, a failed call leaves a transcript
 * the harness cannot identify and therefore must not delete.
 *
 * `--setting-sources project` is what makes the corpus overlay authoritative:
 * the attempt directory is the session's project directory, so excluding the
 * user source leaves the harness's own `.claude` as the only one, and the
 * operator's installed skills and settings cannot decide what the case measures.
 */
export function sessionCaseArgs(
	sessionCase: SessionCase,
	settings: SessionSettings,
	session: SessionNaming,
	styleName?: string,
): string[] {
	const declaredSettings = selectedSettings(sessionCase, styleName);

	return [
		"claude",
		"-p",
		sessionCase.prompt,
		"--model",
		settings.model,
		...(settings.effort === undefined ? [] : ["--effort", settings.effort]),
		"--max-budget-usd",
		String(settings.budgetUsd),
		"--output-format",
		"json",
		"--setting-sources",
		"project",
		"--tools",
		sessionCase.tools.join(","),
		...(declaredSettings === undefined ? [] : ["--settings", declaredSettings]),
		...(sessionCase.agents === undefined
			? []
			: ["--agents", JSON.stringify(sessionCase.agents)]),
		...(session.resumed
			? ["--system-prompt-snapshot", "off", "--resume", session.sessionId]
			: ["--session-id", session.sessionId]),
	];
}

/**
 * A fixture tree and a transcript prefix are both declared inputs the attempt
 * reads before it calls the provider, and a caller does the same thing with
 * either refusal: report it and pay for nothing. One type keeps that response
 * in one place rather than growing a class per input the harness can refuse.
 */
export class SessionInputError extends Error {
	public override name = "SessionInputError";
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

	const hasher = new Bun.CryptoHasher("sha256");
	for await (const chunk of Bun.file(transcriptPath).stream()) {
		hasher.update(chunk);
	}

	const found = hasher.digest("hex");
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
		return { sessionId, resumed: false };
	}

	await verifiedPrefix(sessionCase, transcriptPath, declaration.transcript);

	await mkdir(slug, { recursive: true });
	await forkTranscript(
		transcriptPath,
		join(slug, `${sessionId}.jsonl`),
		declaration.transcript.sourceSession,
		sessionId,
	);

	return { sessionId, resumed: true };
}

const FIXTURE_HOOKS_DIRECTORY = join(STORED_GIT_DIRECTORY, "hooks");

/**
 * A recursive copy preserves symlinks, so a fixture holding one would give the
 * session a live path out of the attempt directory the harness promised it
 * owns. The tree is data a case declares, so the refusal comes before the copy
 * and before any provider call, and it names the entry.
 *
 * Git refuses to commit a nested `.git`, so a case that carries history stores
 * it under `dot-git` and the copy opens it. Hooks inside it are refused the
 * same way and for the same reason: `git status`, which this runs before any
 * provider call, fires `post-index-change`, so a hook a case carries is code
 * the harness executes here, outside the tools and permissions the case
 * declares. No case needs one.
 */
async function seedFixture(
	fixturePath: string,
	attemptDirectory: string,
): Promise<void> {
	const entries = await readdir(fixturePath, {
		recursive: true,
		withFileTypes: true,
	});

	let carriesHistory = false;
	for (const entry of entries) {
		const entryPath = relative(fixturePath, join(entry.parentPath, entry.name));
		if (entry.isSymbolicLink()) {
			throw new SessionInputError(
				`Fixture entry ${entryPath} is a symlink, which would lead out of the attempt directory`,
			);
		}

		if (entryPath === FIXTURE_HOOKS_DIRECTORY) {
			throw new SessionInputError(
				`Fixture entry ${entryPath} holds git hooks, which the harness would run on this machine outside the case's declared tools`,
			);
		}

		if (entryPath === STORED_GIT_DIRECTORY) {
			if (!entry.isDirectory()) {
				throw new SessionInputError(
					`Fixture entry ${entryPath} is not a directory; a case's history is the bytes it carries, not a pointer to a git directory elsewhere on this machine`,
				);
			}

			carriesHistory = true;
		}
	}

	await cp(fixturePath, attemptDirectory, { recursive: true });

	if (carriesHistory) {
		await openFixtureHistory(fixturePath, attemptDirectory);
	}
}

/**
 * Only a `dot-git` at the fixture's root is its history. One further down is
 * an ordinary directory the case carries.
 *
 * Renaming the directory back is not enough: the commit dropped the empty
 * `refs/heads` and `refs/tags`, and without them git walks out of the attempt
 * directory and answers from whatever repository encloses it.
 */
async function openFixtureHistory(
	fixturePath: string,
	attemptDirectory: string,
): Promise<void> {
	const gitDirectory = join(attemptDirectory, ".git");

	await rename(join(attemptDirectory, STORED_GIT_DIRECTORY), gitDirectory);
	await mkdir(join(gitDirectory, "refs", "heads"), { recursive: true });
	await mkdir(join(gitDirectory, "refs", "tags"), { recursive: true });

	await checkFixtureHistory(fixturePath, attemptDirectory);
}

/**
 * These are the commands a session's own first look at its history runs, and
 * each catches a broken shape the other two admit: a directory git will not
 * read as a repository, a history whose objects do not reach back, an index
 * that cannot be parsed. A fixture that fails any of them would spend a
 * provider call on a tree the case does not describe.
 *
 * `--show-toplevel` resolves symlinks, so the comparison is against the
 * already-resolved attempt directory: on macOS `/tmp` is a symlink to
 * `/private/tmp`, and comparing an unresolved path would reject every good
 * fixture.
 */
async function checkFixtureHistory(
	fixturePath: string,
	attemptDirectory: string,
): Promise<void> {
	const toplevel = await fixtureHistoryOutput(fixturePath, attemptDirectory, [
		"git",
		"rev-parse",
		"--show-toplevel",
	]);
	if (toplevel.trim() !== attemptDirectory) {
		throw new SessionInputError(
			`Fixture ${fixturePath} seeds a git directory that resolves to ${toplevel.trim()} rather than the attempt directory`,
		);
	}

	await fixtureHistoryOutput(fixturePath, attemptDirectory, [
		"git",
		"log",
		"--format=%H",
	]);
	await fixtureHistoryOutput(fixturePath, attemptDirectory, [
		"git",
		"status",
		"--short",
	]);
}

async function fixtureHistoryOutput(
	fixturePath: string,
	attemptDirectory: string,
	command: readonly string[],
): Promise<string> {
	try {
		return await runCommand(command, attemptDirectory);
	} catch (error) {
		if (error instanceof CommandError) {
			throw new SessionInputError(
				`Fixture ${fixturePath} seeds a git directory that ${command.join(" ")} rejects: ${error.stderr.trim()}`,
			);
		}

		throw error;
	}
}

interface CorpusOverlay {
	readonly styleName: string | undefined;
}

/**
 * The corpus variant reaches the session as project-level files under the
 * attempt directory the harness owns, which shadow the same-named user-level
 * ones. A live corpus needs no overlay: the session already reads it.
 */
async function installCorpusOverlay(
	snapshot: SessionCorpusSnapshot | undefined,
	attemptDirectory: string,
): Promise<CorpusOverlay> {
	if (snapshot === undefined) {
		return { styleName: undefined };
	}

	await installSessionCorpusSnapshot(snapshot, attemptDirectory);

	return { styleName: snapshotStyleName(snapshot) };
}

export async function runSessionAttempt(
	request: SessionAttemptRequest,
): Promise<SessionAttempt> {
	const { sessionCase, settings } = request;
	const attemptDirectory = await realpath(
		await mkdtemp(join(tmpdir(), "rehearse-attempt-")),
	);
	try {
		if (sessionCase.fixturePath !== undefined) {
			await seedFixture(sessionCase.fixturePath, attemptDirectory);
		}

		const overlay = await installCorpusOverlay(
			request.corpusSnapshot,
			attemptDirectory,
		);

		const slug = join(request.projectsDirectory, projectSlug(attemptDirectory));
		const session = await prepareSession(sessionCase, slug);
		const transcriptPath = join(slug, `${session.sessionId}.jsonl`);
		const contextEvidence =
			request.contextEvidenceSource === undefined
				? undefined
				: normalizeContextEvidence(
						request.contextEvidenceSource,
						request.contextRateCatalog,
					);

		try {
			let output: string;
			try {
				output = await request.runClaude(
					sessionCaseArgs(sessionCase, settings, session, overlay.styleName),
					attemptDirectory,
				);
			} catch (error) {
				const failure =
					error instanceof Error ? error : new Error(String(error));
				throw await failedInvocation(
					request,
					attemptDirectory,
					transcriptPath,
					failure,
					contextEvidence,
				);
			}

			return await recordAttempt(request, attemptDirectory, {
				output,
				writtenTranscript: transcriptPath,
				contextEvidence,
			});
		} finally {
			await removeAttemptFiles(attemptDirectory, slug, transcriptPath);
		}
	} catch (error) {
		await rm(attemptDirectory, { force: true, recursive: true });
		throw error;
	}
}

interface AttemptOutput {
	readonly output: string;
	readonly writtenTranscript: string;
	readonly contextEvidence?: ContextEvidence | undefined;
}

interface PreservedTranscript {
	readonly file: string;
	readonly sourceAvailable: boolean;
	readonly lines: Immutable<readonly TranscriptLine[]>;
}

async function preservedTranscript(
	recordDirectory: string,
	writtenTranscript: string,
): Promise<PreservedTranscript> {
	const written = Bun.file(writtenTranscript);
	const sourceAvailable = await written.exists();
	const transcriptFile = join(recordDirectory, "transcript.jsonl");
	await mkdir(recordDirectory, { recursive: true });
	await Bun.write(transcriptFile, sourceAvailable ? written : "");

	return {
		file: transcriptFile,
		sourceAvailable,
		lines: await parseTranscriptFile(transcriptFile),
	};
}

function diagnosticsFor(
	prefixLinesExcluded: number,
	transcript: Readonly<PreservedTranscript>,
): TranscriptDiagnostics {
	return transcriptDiagnostics({
		lines: transcript.lines,
		prefixLinesExcluded,
		sourceAvailable: transcript.sourceAvailable,
	});
}

async function failedInvocation(
	request: SessionAttemptRequest,
	attemptDirectory: string,
	writtenTranscript: string,
	error: Readonly<Error>,
	contextEvidence: ContextEvidence | undefined,
): Promise<SessionInvocationError> {
	const transcript = await preservedTranscript(
		request.recordDirectory,
		writtenTranscript,
	);
	const diagnostics = diagnosticsFor(
		request.sessionCase.declaration.transcript?.cut ?? 0,
		transcript,
	);

	if (error instanceof CommandError && error.stdout !== "") {
		let document: unknown;
		try {
			document = JSON.parse(error.stdout);
		} catch {
			document = undefined;
		}
		const parsed = claudeEnvelopeSchema.safeParse(document);
		if (parsed.success) {
			return invocationError(
				providerFailureMessage(parsed.data.result, error.message),
				attemptDirectory,
				transcript.file,
				diagnostics,
				readClaudeCallMetrics(parsed.data),
				contextEvidence,
			);
		}
	}

	return invocationError(
		error.message,
		attemptDirectory,
		transcript.file,
		diagnostics,
		undefined,
		contextEvidence,
	);
}

function providerFailureMessage(
	result: string | undefined,
	fallback: string,
): string {
	return result === undefined || result.length === 0 ? fallback : result;
}

function invocationError(
	message: string,
	attemptDirectory: string,
	transcriptFile: string,
	diagnostics: Immutable<TranscriptDiagnostics>,
	metrics?: ClaudeCallMetrics,
	contextEvidence?: ContextEvidence,
): SessionInvocationError {
	return new SessionInvocationError(
		message,
		preserveContextEvidence(
			{
				attemptDirectory,
				reply: undefined,
				transcriptFile,
				metrics,
				outcome: "EXECUTION_FAILED",
				checks: [],
				contextManifest: undefined,
				transcriptDiagnostics: diagnostics,
			},
			contextEvidence,
		),
	);
}

function preserveContextEvidence(
	attempt: SessionAttempt,
	contextEvidence: ContextEvidence | undefined,
): SessionAttempt {
	if (contextEvidence === undefined) {
		return attempt;
	}

	return { ...attempt, contextEvidence };
}

interface StateGrade {
	readonly stateResults?: readonly StateResult[] | undefined;
	readonly stateGradingError?: string | undefined;
}

/**
 * The grade runs against a restore rather than the attempt directory, so it
 * reads the same bytes a later regrade will and a scorer that writes cannot
 * change what the record says the session left. A case declaring no scorer
 * grades no state, which is a different fact from a scorer that failed.
 */
async function gradeAttemptState(
	sessionCase: SessionCase,
	evidenceDirectory: string,
): Promise<StateGrade> {
	const { stateCheck } = sessionCase;
	if (stateCheck === undefined) {
		return {};
	}

	const restoreDirectory = await mkdtemp(join(tmpdir(), "rehearse-grade-"));
	try {
		const graded = await gradeStateEvidence({
			evidenceDirectory,
			restoreDirectory,
			command: stateCheck.command,
			outcomes: stateCheck.outcomes,
		});

		return graded.kind === "results"
			? { stateResults: graded.results }
			: { stateGradingError: graded.detail };
	} finally {
		await rm(restoreDirectory, { force: true, recursive: true });
	}
}

async function recordAttempt(
	request: SessionAttemptRequest,
	attemptDirectory: string,
	attempt: AttemptOutput,
): Promise<SessionAttempt> {
	const transcript = await preservedTranscript(
		request.recordDirectory,
		attempt.writtenTranscript,
	);
	const diagnostics = diagnosticsFor(
		request.sessionCase.declaration.transcript?.cut ?? 0,
		transcript,
	);

	const envelope = claudeEnvelopeSchema.parse(JSON.parse(attempt.output));
	const metrics = readClaudeCallMetrics(envelope);
	if (envelope.is_error === true) {
		throw invocationError(
			providerFailureMessage(envelope.result, "Claude session failed"),
			attemptDirectory,
			transcript.file,
			diagnostics,
			metrics,
			attempt.contextEvidence,
		);
	}
	const stateEvidenceDirectory = await preserveStateEvidence(
		attemptDirectory,
		request.recordDirectory,
	);
	const stateGrade = await gradeAttemptState(
		request.sessionCase,
		stateEvidenceDirectory,
	);

	const reply = envelope.result;
	if (reply === undefined) {
		return preserveContextEvidence(
			{
				attemptDirectory,
				reply,
				transcriptFile: transcript.file,
				metrics,
				outcome: "NO_REPLY",
				checks: [],
				contextManifest: undefined,
				transcriptDiagnostics: diagnostics,
				stateEvidenceDirectory,
				...stateGrade,
			},
			attempt.contextEvidence,
		);
	}

	const cut = request.sessionCase.declaration.transcript?.cut ?? 0;
	const turn = transcript.lines.slice(cut);
	const result = evaluateChecks(request.sessionCase.checks, {
		reply,
		toolUses: toolUses(turn),
	});

	return preserveContextEvidence(
		{
			attemptDirectory,
			reply,
			transcriptFile: transcript.file,
			metrics,
			outcome: result.outcome,
			checks: result.results,
			contextManifest: observedManifest(
				toolUses(turn),
				outputStyles(turn),
				request.sessionCase.projectFiles,
			),
			transcriptDiagnostics: diagnostics,
			stateEvidenceDirectory,
			...stateGrade,
		},
		attempt.contextEvidence,
	);
}

/**
 * The projects directory holds live sessions of João's, and one has appeared in
 * a slug directory mid-run, so the only entry removed is the one the attempt
 * named itself. The slug goes with `rmdir`, which removes it only when it is
 * empty: a file the attempt cannot account for keeps its directory rather than
 * being deleted with it. Cleanup runs whether the call returned or threw, so a
 * provider that wrote its transcript and then failed leaves nothing behind.
 */
async function removeAttemptFiles(
	attemptDirectory: string,
	slug: string,
	transcriptPath: string,
): Promise<void> {
	await rm(transcriptPath, { force: true });
	await rmdir(slug).catch(() => undefined);

	await rm(attemptDirectory, { force: true, recursive: true });
}
