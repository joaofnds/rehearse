import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { SessionCase } from "./case";
import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "./confirmation-record";
import { parseSessionAttemptRecord } from "./session-record";
import {
	runSessionConfirmation,
	SessionInvocationError,
} from "./session-confirmation";
import { parseGroupReportSummaryRecord } from "./record-summary";
import { failureOf } from "#cli/cli-test-support";
import { readShortIds } from "./short-id";
import { runList } from "#cli/list-command";
import { runShow } from "#cli/show-command";
import { historyFixture } from "./test-support";

const metrics = {
	costUsd: 0.02,
	inputTokens: 10,
	outputTokens: 2,
	cacheReadTokens: 3,
	cacheWriteTokens: 4,
	turns: 1,
};

const unavailableTranscriptDiagnostics = {
	state: "unavailable",
	prefixLinesExcluded: 0,
} as const;

async function historyFilePaths(
	fixturePath: string,
): Promise<readonly string[]> {
	const history = join(fixturePath, "dot-git");
	const entries = await readdir(history, {
		recursive: true,
		withFileTypes: true,
	});

	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => join(relative(history, entry.parentPath), entry.name));
}

function requiredPath(path: string | undefined): string {
	if (path === undefined) {
		throw new Error("Expected a frozen session path");
	}

	return path;
}

function simpleSessionCase(id = "outcomes"): SessionCase {
	return {
		kind: "session",
		declaration: {
			id,
			kind: "session",
			title: "Outcomes",
			prompt: "Reply.",
			tools: [],
			corpusFiles: [],
			projectFiles: [],
			checks: [{ kind: "word-band", max: 1 }],
		},
		fixturePath: undefined,
		transcriptPath: undefined,
		prompt: "Reply.",
		tools: [],
		settings: undefined,
		agents: undefined,
		corpusFiles: [],
		projectFiles: [],
		checks: [{ kind: "word-band", max: 1 }],
	};
}

describe(runSessionConfirmation.name, () => {
	const temporaryDirectories: string[] = [];

	afterEach(async () => {
		await Promise.all(
			temporaryDirectories
				.splice(0)
				.map((directory) => rm(directory, { force: true, recursive: true })),
		);
	});

	it("claims no short id when its corpus is refused", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-session-live-"));
		temporaryDirectories.push(root);
		const liveRoot = join(root, "install");
		const backingRoot = join(root, "backing");
		const outside = join(root, "outside");
		await mkdir(join(liveRoot, "output-styles"), { recursive: true });
		await mkdir(backingRoot, { recursive: true });
		await mkdir(outside, { recursive: true });
		await Bun.write(join(outside, "foreign.md"), "FOREIGN STYLE\n");
		await symlink(
			join(outside, "foreign.md"),
			join(liveRoot, "output-styles", "foreign.md"),
		);
		const declared = simpleSessionCase("hostile-live");
		const sessionCase: SessionCase = {
			...declared,
			declaration: {
				...declared.declaration,
				corpusFiles: ["output-styles/foreign.md"],
			},
			corpusFiles: ["output-styles/foreign.md"],
		};
		await failureOf(
			runSessionConfirmation(
				{
					resolveCorpus: () =>
						Promise.resolve({ kind: "live", root: liveRoot, backingRoot }),
					executeAttempt: () =>
						Promise.reject(new Error("a provider call must not happen")),
				},
				{
					runsDirectory: join(root, "runs"),
					groupId: "hostile-live-group",
					reps: 2,
					projectedCost: {
						reps: 2,
						perRepMaximumUsd: 0.2,
						preflightMaximumUsd: 0.1,
						totalMaximumUsd: 0.5,
					},
					approvalMethod: "yes",
					sessionCase,
					model: "sonnet",
					sessionBudgetUsd: 0.2,
					preflight: { status: "MISSING", missing: "metrics" },
				},
			),
		);

		expect(await readShortIds(join(root, "runs"), "hostile-live")).toEqual([]);
	});

	it("refuses an out-of-extent live corpus file before starting a rep", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-session-live-"));
		temporaryDirectories.push(root);
		const liveRoot = join(root, "install");
		const backingRoot = join(root, "backing");
		const outside = join(root, "outside");
		await mkdir(join(liveRoot, "output-styles"), { recursive: true });
		await mkdir(backingRoot, { recursive: true });
		await mkdir(outside, { recursive: true });
		await Bun.write(join(outside, "foreign.md"), "FOREIGN STYLE\n");
		await symlink(
			join(outside, "foreign.md"),
			join(liveRoot, "output-styles", "foreign.md"),
		);
		const declared = simpleSessionCase("hostile-live");
		const sessionCase: SessionCase = {
			...declared,
			declaration: {
				...declared.declaration,
				corpusFiles: ["output-styles/foreign.md"],
			},
			corpusFiles: ["output-styles/foreign.md"],
		};
		let providerCalls = 0;

		const failure = await failureOf(
			runSessionConfirmation(
				{
					resolveCorpus: () =>
						Promise.resolve({ kind: "live", root: liveRoot, backingRoot }),
					executeAttempt: () => {
						providerCalls += 1;
						return Promise.reject(new Error("a provider call must not happen"));
					},
				},
				{
					runsDirectory: join(root, "runs"),
					groupId: "hostile-live-group",
					reps: 2,
					projectedCost: {
						reps: 2,
						perRepMaximumUsd: 0.2,
						preflightMaximumUsd: 0.1,
						totalMaximumUsd: 0.5,
					},
					approvalMethod: "yes",
					sessionCase,
					model: "sonnet",
					sessionBudgetUsd: 0.2,
					preflight: { status: "MISSING", missing: "metrics" },
				},
			),
		);

		expect(failure.message).toContain("output-styles/foreign.md");
		expect(providerCalls).toBe(0);
	});

	/**
	 * A skill and a global instruction file were refused here until the session
	 * path could isolate them. Now every rep reads the bytes frozen before the
	 * first provider call, so editing the source between reps cannot change what
	 * the group measures.
	 */
	it("freezes a declared skill and CLAUDE.md so a source edit cannot reach a later rep", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-session-skill-"));
		temporaryDirectories.push(root);
		const corpusRoot = join(root, "source-corpus");
		await mkdir(join(corpusRoot, "skills", "verify"), { recursive: true });
		await Bun.write(
			join(corpusRoot, "skills", "verify", "SKILL.md"),
			"original skill\n",
		);
		await Bun.write(join(corpusRoot, "CLAUDE.md"), "original instructions\n");
		const declared = simpleSessionCase("skill-group");
		const corpusFiles = ["skills/verify/SKILL.md", "CLAUDE.md"];
		const sessionCase: SessionCase = {
			...declared,
			declaration: { ...declared.declaration, corpusFiles },
			corpusFiles,
		};
		const observed: string[] = [];

		await runSessionConfirmation(
			{
				executeAttempt: async (plan) => {
					observed.push(
						[
							await Bun.file(
								join(plan.corpusSnapshot.root, "skills", "verify", "SKILL.md"),
							).text(),
							await Bun.file(
								join(plan.corpusSnapshot.root, "CLAUDE.md"),
							).text(),
						].join("|"),
					);
					if (plan.ordinal === 1) {
						await Bun.write(
							join(corpusRoot, "skills", "verify", "SKILL.md"),
							"mutated skill\n",
						);
						await Bun.write(
							join(corpusRoot, "CLAUDE.md"),
							"mutated instructions\n",
						);
					}

					const transcriptFile = join(plan.recordDirectory, "transcript.jsonl");
					await Bun.write(transcriptFile, `rep ${plan.ordinal}\n`);

					return {
						attemptDirectory: join(plan.recordDirectory, "execution"),
						reply: "OK",
						transcriptFile,
						metrics,
						outcome: "SUCCESSFUL" as const,
						checks: [
							{
								kind: "word-band" as const,
								status: "PASS" as const,
								detail: "1 word",
							},
						],
						contextManifest: undefined,
						transcriptDiagnostics: unavailableTranscriptDiagnostics,
					};
				},
			},
			{
				runsDirectory: join(root, "runs"),
				groupId: "skill-group",
				reps: 2,
				projectedCost: {
					reps: 2,
					perRepMaximumUsd: 0.2,
					preflightMaximumUsd: 0.1,
					totalMaximumUsd: 0.5,
				},
				approvalMethod: "yes",
				sessionCase,
				corpus: corpusRoot,
				model: "sonnet",
				sessionBudgetUsd: 0.2,
				preflight: { status: "COMPLETE", call: { metrics } },
			},
		);

		expect(observed).toEqual([
			"original skill\n|original instructions\n",
			"original skill\n|original instructions\n",
		]);
	});

	it("runs every rep from one frozen input set and records a provider failure", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-session-group-"));
		temporaryDirectories.push(root);
		const fixturePath = join(root, "source-fixture");
		const transcriptPath = join(root, "source-transcript.jsonl");
		const corpusRoot = join(root, "source-corpus");
		await mkdir(join(corpusRoot, "output-styles"), { recursive: true });
		await mkdir(fixturePath, { recursive: true });
		await Bun.write(join(fixturePath, "fixture.txt"), "original fixture\n");
		await Bun.write(transcriptPath, "original transcript\n");
		await Bun.write(
			join(corpusRoot, "output-styles", "brief.md"),
			"original corpus\n",
		);
		const transcriptSha = new Bun.CryptoHasher("sha256")
			.update("original transcript\n")
			.digest("hex");
		const sessionCase: SessionCase = {
			kind: "session",
			declaration: {
				id: "smoke",
				kind: "session",
				title: "Smoke",
				fixture: "fixture",
				prompt: "Reply with OK.",
				transcript: {
					file: "prefix.jsonl",
					sha256: transcriptSha,
					sourceSession: "source-session",
					cut: 1,
				},
				tools: [],
				corpusFiles: ["output-styles/brief.md"],
				projectFiles: ["fixture.txt"],
				checks: [{ kind: "word-band", max: 1 }],
			},
			fixturePath,
			transcriptPath,
			prompt: "Reply with OK.",
			tools: [],
			settings: undefined,
			agents: undefined,
			corpusFiles: ["output-styles/brief.md"],
			projectFiles: ["fixture.txt"],
			checks: [{ kind: "word-band", max: 1 }],
		};
		const observedInputs: string[] = [];
		const completed: number[] = [];

		const outcome = await runSessionConfirmation(
			{
				executeAttempt: async (plan) => {
					const observed = [
						await Bun.file(
							join(requiredPath(plan.sessionCase.fixturePath), "fixture.txt"),
						).text(),
						await Bun.file(
							requiredPath(plan.sessionCase.transcriptPath),
						).text(),
						await Bun.file(
							join(plan.corpusSnapshot.root, "output-styles", "brief.md"),
						).text(),
					].join("|");
					observedInputs.push(`${plan.lineage}:${observed}`);
					if (plan.ordinal === 1) {
						await Bun.write(
							join(fixturePath, "fixture.txt"),
							"mutated fixture\n",
						);
						await Bun.write(transcriptPath, "mutated transcript\n");
						await Bun.write(
							join(corpusRoot, "output-styles", "brief.md"),
							"mutated corpus\n",
						);
					}

					const transcriptFile = join(plan.recordDirectory, "transcript.jsonl");
					await Bun.write(transcriptFile, `rep ${plan.ordinal}\n`);
					const attempt = {
						attemptDirectory: join(plan.recordDirectory, "execution"),
						reply: "OK",
						transcriptFile,
						metrics,
						outcome: "SUCCESSFUL" as const,
						checks: [
							{
								kind: "word-band" as const,
								status: "PASS" as const,
								detail: "1 word",
							},
						],
						contextManifest: undefined,
						transcriptDiagnostics: unavailableTranscriptDiagnostics,
					};
					if (plan.ordinal === 2) {
						throw new SessionInvocationError("provider rejected rep 2", {
							...attempt,
							reply: undefined,
							outcome: "EXECUTION_FAILED",
							checks: [],
						});
					}

					completed.push(plan.ordinal);

					return attempt;
				},
			},
			{
				runsDirectory: join(root, "runs"),
				groupId: "session-group",
				reps: 3,
				projectedCost: {
					reps: 3,
					perRepMaximumUsd: 0.2,
					preflightMaximumUsd: 0.1,
					totalMaximumUsd: 0.7,
				},
				approvalMethod: "yes",
				sessionCase,
				corpus: corpusRoot,
				model: "sonnet",
				sessionBudgetUsd: 0.2,
				preflight: { status: "COMPLETE", call: { metrics } },
			},
		);

		const group = parseConfirmationGroupRecord(
			await Bun.file(outcome.groupRecordFile).text(),
		);
		const reps = await Promise.all(
			outcome.repRecordFiles.map(async (path) =>
				parseConfirmationRepRecord(await Bun.file(path).text()),
			),
		);
		const failedAttempt = parseSessionAttemptRecord(
			await Bun.file(
				join(
					root,
					"runs",
					"confirmations",
					"session-group",
					"reps",
					"session-group-rep-2",
					"attempt.json",
				),
			).text(),
		);
		const report = parseGroupReportSummaryRecord(
			await Bun.file(outcome.reportFile).text(),
		);

		expect(observedInputs).toHaveLength(3);
		expect(new Set(observedInputs)).toHaveLength(1);
		expect(observedInputs[0]).toContain(
			"original fixture\n|original transcript\n|original corpus\n",
		);
		expect(completed.toSorted((left, right) => left - right)).toEqual([1, 3]);
		expect(group.repRecords.map(({ ordinal }) => ordinal)).toEqual([1, 2, 3]);
		expect(reps.map(({ outcome: repOutcome }) => repOutcome)).toEqual([
			"SUCCESSFUL",
			"UNSUCCESSFUL",
			"SUCCESSFUL",
		]);
		expect(reps[1]?.stages[0]?.status).toBe("EXECUTION_FAILED");
		expect(reps[0]).not.toHaveProperty("attemptDirectory");
		expect(reps[0]).not.toHaveProperty("worktreePath");
		expect(failedAttempt).toMatchObject({
			outcome: "EXECUTION_FAILED",
			error: "provider rejected rep 2",
		});
		expect(report.resources.commandTotal).toEqual({
			status: "COMPLETE",
			metrics: {
				costUsd: 0.08,
				inputTokens: 40,
				outputTokens: 8,
				cacheReadTokens: 12,
				cacheWriteTokens: 16,
			},
		});

		const listed: string[] = [];
		await runList(
			{ kind: "groups", runsDirectory: join(root, "runs") },
			{
				stdout: (text) => {
					listed.push(text);
				},
				stderr: () => undefined,
			},
		);
		expect(listed.join("")).toContain("group:session-group\tsmoke/g1\t");

		const shown: string[] = [];
		await runShow(
			{
				id: "group:session-group",
				json: false,
				runsDirectory: join(root, "runs"),
			},
			{
				stdout: (text) => {
					shown.push(text);
				},
				stderr: () => undefined,
			},
		);
		expect(shown.join("")).toContain("Case smoke, session mode, 3 reps.");
		expect(shown.join("")).toContain("Cost $0.08 for the confirmed command.");

		const shownJson: string[] = [];
		await runShow(
			{
				id: "group:session-group",
				json: true,
				runsDirectory: join(root, "runs"),
			},
			{
				stdout: (text) => {
					shownJson.push(text);
				},
				stderr: () => undefined,
			},
		);
		expect(JSON.parse(shownJson.join(""))).toMatchObject({
			schemaVersion: 2,
			mode: "session",
		});
	});

	it("maps pass, failed checks, no reply, and provider failure without dropping named evidence", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-session-outcomes-"));
		temporaryDirectories.push(root);
		const corpusRoot = join(root, "corpus");
		await mkdir(join(corpusRoot, "output-styles"), { recursive: true });
		const sessionCase = simpleSessionCase();
		const outcome = await runSessionConfirmation(
			{
				executeAttempt: async (plan) => {
					const transcriptFile = join(plan.recordDirectory, "transcript.jsonl");
					await Bun.write(transcriptFile, "transcript\n");
					const common = {
						attemptDirectory: join(plan.recordDirectory, "execution"),
						transcriptFile,
						metrics: plan.ordinal === 4 ? undefined : metrics,
						contextManifest: undefined,
						transcriptDiagnostics: unavailableTranscriptDiagnostics,
					};
					if (plan.ordinal === 1) {
						return {
							...common,
							reply: "OK",
							outcome: "SUCCESSFUL",
							checks: [
								{ kind: "word-band", status: "PASS", detail: "named pass" },
							],
						};
					}
					if (plan.ordinal === 2) {
						return {
							...common,
							reply: "too many words",
							outcome: "UNSUCCESSFUL",
							checks: [
								{ kind: "word-band", status: "FAIL", detail: "named failure" },
							],
						};
					}
					if (plan.ordinal === 3) {
						return {
							...common,
							reply: undefined,
							outcome: "NO_REPLY",
							checks: [],
						};
					}
					if (plan.ordinal === 4) {
						return {
							...common,
							reply: "too many words",
							outcome: "UNSUCCESSFUL",
							checks: [
								{
									kind: "word-band",
									status: "FAIL",
									detail: "missing metrics",
								},
							],
						};
					}

					throw new SessionInvocationError("provider failure", {
						...common,
						reply: undefined,
						outcome: "EXECUTION_FAILED",
						checks: [],
					});
				},
			},
			{
				runsDirectory: join(root, "runs"),
				groupId: "outcomes-group",
				reps: 5,
				projectedCost: {
					reps: 5,
					perRepMaximumUsd: 0.2,
					preflightMaximumUsd: 0.1,
					totalMaximumUsd: 1.1,
				},
				approvalMethod: "yes",
				sessionCase,
				corpus: corpusRoot,
				model: "sonnet",
				sessionBudgetUsd: 0.2,
				preflight: { status: "MISSING", missing: "preflight call metrics" },
			},
		);

		const reps = await Promise.all(
			outcome.repRecordFiles.map(async (path) =>
				parseConfirmationRepRecord(await Bun.file(path).text()),
			),
		);
		expect(reps.map((rep) => rep.stages[0]?.status)).toEqual([
			"JUDGED",
			"JUDGED",
			"NOT_REACHED",
			"METRICS_MISSING",
			"EXECUTION_FAILED",
		]);
		expect(reps.slice(0, 2).map((rep) => rep.stages[0])).toMatchObject([
			{ grade: "A", verdict: "CONTINUE" },
			{ grade: "F", verdict: "STOP" },
		]);
		const attempts = await Promise.all(
			outcome.repRecordFiles.map(async (path) =>
				parseSessionAttemptRecord(
					await Bun.file(join(path, "..", "attempt.json")).text(),
				),
			),
		);
		expect(attempts[0]?.checks[0]?.detail).toBe("named pass");
		expect(attempts[1]?.checks[0]?.detail).toBe("named failure");
		const report = parseGroupReportSummaryRecord(
			await Bun.file(outcome.reportFile).text(),
		);
		expect(report.resources.commandTotal).toEqual({
			status: "MISSING",
			missing: ["preflight call metrics", "1 rep call metrics"],
		});
	});

	it("freezes every file of a fixture's committed history as a named input", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-session-history-"));
		temporaryDirectories.push(root);
		const corpusRoot = join(root, "corpus");
		await mkdir(join(corpusRoot, "output-styles"), { recursive: true });
		const fixture = await historyFixture(["first"]);
		temporaryDirectories.push(fixture.path);
		const sessionCase: SessionCase = {
			...simpleSessionCase("history"),
			fixturePath: fixture.path,
		};

		const outcome = await runSessionConfirmation(
			{
				executeAttempt: async (plan) => {
					const transcriptFile = join(plan.recordDirectory, "transcript.jsonl");
					await Bun.write(transcriptFile, "transcript\n");

					return {
						attemptDirectory: join(plan.recordDirectory, "execution"),
						reply: "OK",
						transcriptFile,
						metrics,
						outcome: "SUCCESSFUL",
						checks: [{ kind: "word-band", status: "PASS", detail: "1 word" }],
						contextManifest: undefined,
						transcriptDiagnostics: unavailableTranscriptDiagnostics,
					};
				},
			},
			{
				runsDirectory: join(root, "runs"),
				groupId: "history-group",
				reps: 2,
				projectedCost: {
					reps: 2,
					perRepMaximumUsd: 0.2,
					preflightMaximumUsd: 0.1,
					totalMaximumUsd: 0.5,
				},
				approvalMethod: "yes",
				sessionCase,
				corpus: corpusRoot,
				model: "sonnet",
				sessionBudgetUsd: 0.2,
				preflight: { status: "COMPLETE", call: { metrics } },
			},
		);

		const group = parseConfirmationGroupRecord(
			await Bun.file(outcome.groupRecordFile).text(),
		);
		const frozen = group.inputs.files
			.filter((file) => file.kind === "fixture")
			.map((file) => file.path);
		const history = frozen.filter((path) => path.includes("dot-git/"));
		expect(history.length).toBeGreaterThan(0);
		expect(new Set(history.map((path) => path.split("dot-git/")[1]))).toEqual(
			new Set(await historyFilePaths(fixture.path)),
		);
	});

	it("waits for peers but aborts group persistence after an untyped rep failure", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-session-abort-"));
		temporaryDirectories.push(root);
		const corpusRoot = join(root, "corpus");
		await mkdir(join(corpusRoot, "output-styles"), { recursive: true });
		const started: number[] = [];

		const failure = runSessionConfirmation(
			{
				executeAttempt: (plan) => {
					started.push(plan.ordinal);
					return Promise.reject(new Error(`unexpected rep ${plan.ordinal}`));
				},
			},
			{
				runsDirectory: join(root, "runs"),
				groupId: "aborted-group",
				reps: 2,
				projectedCost: {
					reps: 2,
					perRepMaximumUsd: 0.2,
					preflightMaximumUsd: 0.1,
					totalMaximumUsd: 0.5,
				},
				approvalMethod: "yes",
				sessionCase: simpleSessionCase("abort"),
				corpus: corpusRoot,
				model: "sonnet",
				sessionBudgetUsd: 0.2,
				preflight: { status: "MISSING", missing: "metrics" },
			},
		);

		expect(failure).rejects.toThrow("unexpected rep 1");
		expect(started.toSorted((left, right) => left - right)).toEqual([1, 2]);
		expect(
			await Bun.file(
				join(root, "runs", "confirmations", "aborted-group", "group.json"),
			).exists(),
		).toBe(false);
	});

	it("does not finalize a group when a rep record cannot be persisted", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-session-persist-"));
		temporaryDirectories.push(root);
		const corpusRoot = join(root, "corpus");
		await mkdir(join(corpusRoot, "output-styles"), { recursive: true });

		const failure = runSessionConfirmation(
			{
				executeAttempt: async (plan) => {
					if (plan.ordinal === 1) {
						await Bun.write(plan.recordDirectory, "directory collision\n");
					}

					return {
						attemptDirectory: join(plan.recordDirectory, "execution"),
						reply: "OK",
						transcriptFile: join(plan.recordDirectory, "transcript.jsonl"),
						metrics,
						outcome: "SUCCESSFUL",
						checks: [
							{ kind: "word-band", status: "PASS", detail: "named pass" },
						],
						contextManifest: undefined,
						transcriptDiagnostics: unavailableTranscriptDiagnostics,
					};
				},
			},
			{
				runsDirectory: join(root, "runs"),
				groupId: "persistence-group",
				reps: 2,
				projectedCost: {
					reps: 2,
					perRepMaximumUsd: 0.2,
					preflightMaximumUsd: 0.1,
					totalMaximumUsd: 0.5,
				},
				approvalMethod: "yes",
				sessionCase: simpleSessionCase("persist"),
				corpus: corpusRoot,
				model: "sonnet",
				sessionBudgetUsd: 0.2,
				preflight: { status: "MISSING", missing: "metrics" },
			},
		);

		expect(failure).rejects.toBeInstanceOf(Error);
		expect(
			await Bun.file(
				join(root, "runs", "confirmations", "persistence-group", "group.json"),
			).exists(),
		).toBe(false);
	});
});
