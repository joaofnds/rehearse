import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { casesRoot, parseCaseDeclaration, readCaseDeclaration } from "./case";
import type { SessionCase } from "./case";
import type { StateCheck, StateResult } from "./session-state-check";
import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "./confirmation-record";
import type { SessionConfirmationGroupRecord } from "./confirmation-record";
import { parseComparisonReport } from "./comparison-record";
import type { MultiCaseComparisonReport } from "./comparison-record";
import { writeComparisonReport } from "./comparison-command";
import type { Immutable } from "./contracts";
import { runSessionConfirmation } from "./session-confirmation";
import type {
	SessionConfirmationRepPlan,
	SessionConfirmationRequest,
} from "./session-confirmation";
import { parseSessionAttemptRecord } from "./session-record";
import { comparisonReportPaths, confirmationGroupPaths } from "./run-layout";
import type { SessionAttempt } from "./session-attempt";
import { RefusedPreconditionError } from "./exit-codes";
import { SessionInvocationError } from "./session-invocation-error";
import { runList } from "#cli/list-command";
import { runShow } from "#cli/show-command";
import { comparisonReport } from "#server/comparisons";
import { comparisonAttemptHistoryLinks } from "#server/comparison-history-links";

function digest(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

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

const roles = ["baseline", "candidate", "control"] as const;
type Role = (typeof roles)[number];
type AttemptVariant =
	| "pass"
	| "fail"
	| "no-reply"
	| "execution-failed"
	| "missing-metrics";
type AttemptVariantSelector = (
	caseId: string,
	role: Role,
	ordinal: number,
) => AttemptVariant | undefined;

/**
 * The check results one attempt records. case-three declares two checks so a
 * rep can fail some but not all of them; every other case declares one.
 */
function attemptChecks(
	caseId: string,
	pass: boolean,
	ordinal: number,
): SessionAttempt["checks"] {
	const wordBand = {
		kind: "word-band" as const,
		status: pass ? ("PASS" as const) : ("FAIL" as const),
		detail: pass ? "1 word" : "3 words",
	};
	if (caseId !== "case-three") {
		return [wordBand];
	}

	const toolCallsPassed = pass || ordinal === 1;

	return [
		wordBand,
		{
			kind: "tool-calls",
			status: toolCallsPassed ? "PASS" : "FAIL",
			detail: toolCallsPassed ? "0 tool calls" : "3 tool calls",
		},
	];
}

/**
 * One state result per declared outcome. The scorer is not run here: this
 * harness replaces the provider, and the grades are what a scorer would have
 * reported for a session that did or did not do the work.
 */
function attemptStateResults(
	stateCheck: Immutable<StateCheck>,
	pass: boolean,
): readonly StateResult[] {
	return stateCheck.outcomes.map((name) => ({
		name,
		status: pass ? "PASS" : "FAIL",
		detail: pass ? `${name} holds` : `${name} does not hold`,
	}));
}

function sessionCase(
	caseId: string,
	role: Role,
	stateCheck?: Immutable<StateCheck>,
): SessionCase {
	const corpusFiles = role === "control" ? [] : ["output-styles/brief.md"];
	const prompt = caseId === "case-one" ? "Reply OK." : "Reply OK twice.";
	const max = caseId === "case-one" ? 1 : 2;
	const checks =
		caseId === "case-three"
			? [
					{ kind: "word-band" as const, max },
					{ kind: "tool-calls" as const, max: 0 },
				]
			: [{ kind: "word-band" as const, max }];
	const declaration = {
		id: caseId,
		kind: "session" as const,
		title: caseId,
		prompt,
		tools: [],
		corpusFiles,
		projectFiles: [],
		checks,
		model: "sonnet" as const,
		sessionBudgetUsd: 0.2,
		stateCheck,
	};

	return {
		kind: "session",
		declaration,
		fixturePath: undefined,
		transcriptPath: undefined,
		prompt,
		tools: [],
		settings: undefined,
		agents: undefined,
		corpusFiles,
		projectFiles: [],
		checks: declaration.checks,
		stateCheck,
	};
}

async function writeGroup(
	root: string,
	runsDirectory: string,
	caseId: string,
	role: Role,
	selectVariant?: AttemptVariantSelector,
	stateCheck?: Immutable<StateCheck>,
): Promise<string> {
	const corpus = join(root, "sources", `${caseId}-${role}`);
	await mkdir(join(corpus, "output-styles"), { recursive: true });
	if (role !== "control") {
		await Bun.write(
			join(corpus, "output-styles", "brief.md"),
			`${role} corpus\n`,
		);
	}

	const benchmarkCase = sessionCase(caseId, role, stateCheck);
	const request: SessionConfirmationRequest = {
		runsDirectory,
		groupId: `${caseId}-${role}`,
		reps: 2,
		projectedCost: {
			reps: 2,
			perRepMaximumUsd: 0.2,
			preflightMaximumUsd: 0.1,
			totalMaximumUsd: 0.5,
		},
		approvalMethod: "yes",
		sessionCase: benchmarkCase,
		corpus,
		model: "sonnet",
		sessionBudgetUsd: 0.2,
		preflight: { status: "COMPLETE", call: { metrics } },
	};

	const outcome = await runSessionConfirmation(
		{
			executeAttempt: async (
				plan: SessionConfirmationRepPlan,
			): Promise<SessionAttempt> => {
				const transcriptFile = join(plan.recordDirectory, "transcript.jsonl");
				await Bun.write(transcriptFile, `rep ${plan.ordinal}\n`);
				const pass =
					role === "candidate" ||
					(role === "baseline" &&
						(caseId === "case-two" || plan.ordinal === 1));
				const variant = selectVariant?.(caseId, role, plan.ordinal);
				const checkedAttempt: SessionAttempt = {
					attemptDirectory: join(plan.recordDirectory, "execution"),
					transcriptFile,
					reply: pass ? "OK" : "too many words",
					metrics,
					outcome: pass ? "SUCCESSFUL" : "UNSUCCESSFUL",
					checks: attemptChecks(caseId, pass, plan.ordinal),
					contextManifest: undefined,
					transcriptDiagnostics: unavailableTranscriptDiagnostics,
					stateResults:
						stateCheck === undefined
							? undefined
							: attemptStateResults(stateCheck, pass),
				};
				if (variant === "no-reply" || variant === "execution-failed") {
					const failedAttempt: SessionAttempt = {
						...checkedAttempt,
						reply: undefined,
						outcome: variant === "no-reply" ? "NO_REPLY" : "EXECUTION_FAILED",
						checks: [],
					};
					if (variant === "execution-failed") {
						throw new SessionInvocationError(
							"provider rejected the session",
							failedAttempt,
						);
					}

					return failedAttempt;
				}
				if (variant === "missing-metrics") {
					return { ...checkedAttempt, metrics: undefined };
				}
				if (variant === "pass") {
					return { ...checkedAttempt, outcome: "SUCCESSFUL" };
				}
				if (variant === "fail") {
					return { ...checkedAttempt, outcome: "UNSUCCESSFUL" };
				}

				return checkedAttempt;
			},
		},
		request,
	);

	return outcome.groupRecordFile;
}

async function writeManifest(
	root: string,
	runsDirectory: string,
	selectVariant?: AttemptVariantSelector,
	caseIds: readonly string[] = ["case-one", "case-two"],
	stateCheck?: Immutable<StateCheck>,
): Promise<string> {
	const cases = [];
	for (const caseId of caseIds) {
		const arms = {
			baseline: "",
			candidate: "",
			control: "",
		} satisfies Record<Role, string>;
		for (const role of roles) {
			arms[role] = await writeGroup(
				root,
				runsDirectory,
				caseId,
				role,
				selectVariant,
				stateCheck,
			);
		}
		cases.push({ caseId, arms });
	}
	const manifestPath = join(root, "comparison.json");
	await Bun.write(
		manifestPath,
		`${JSON.stringify({ schemaVersion: 1, cases })}\n`,
	);

	return manifestPath;
}

async function expectedSessionSource(
	manifestDirectory: string,
	runsDirectory: string,
	caseId: string,
	role: Role,
): Promise<{
	group: { path: string; sha256: string };
	reps: {
		repId: string;
		ordinal: number;
		path: string;
		sha256: string;
		attempt: { path: string; sha256: string };
		outcomes: {
			name: "checks";
			status: "JUDGED";
			grade: "A" | "F";
			successful: boolean;
		}[];
	}[];
}> {
	const groupPath = sessionGroupFile(runsDirectory, caseId, role);
	const groupText = await Bun.file(groupPath).text();
	const group = parseConfirmationGroupRecord(groupText);
	if (group.schemaVersion !== 2 || group.mode !== "session") {
		throw new Error("expected a session group");
	}
	const reps = await Promise.all(
		group.repRecords.map(async ({ path, repId, ordinal }) => {
			const repPath = join(dirname(groupPath), path);
			const repText = await Bun.file(repPath).text();
			const rep = parseConfirmationRepRecord(repText);
			if (rep.schemaVersion !== 2 || rep.mode !== "session") {
				throw new Error("expected a session rep");
			}
			const [stage] = rep.stages;
			if (stage === undefined) {
				throw new Error("expected a checks stage");
			}
			const attemptPath = join(dirname(repPath), stage.evidence.recordFile);
			const attemptText = await Bun.file(attemptPath).text();
			const successful =
				role === "candidate" ||
				(role === "baseline" && (caseId === "case-two" || ordinal === 1));

			return {
				repId,
				ordinal,
				path: relative(manifestDirectory, repPath),
				sha256: digest(repText),
				attempt: {
					path: relative(manifestDirectory, attemptPath),
					sha256: digest(attemptText),
				},
				outcomes: [
					{
						name: "checks",
						status: "JUDGED",
						grade: successful ? "A" : "F",
						successful,
					} as const,
				],
			};
		}),
	);

	return {
		group: {
			path: relative(manifestDirectory, groupPath),
			sha256: digest(groupText),
		},
		reps,
	};
}

async function updateFrozenCase(
	groupFile: string,
	change: (
		declaration: ReturnType<typeof parseCaseDeclaration>,
	) => ReturnType<typeof parseCaseDeclaration>,
): Promise<void> {
	const group = parseConfirmationGroupRecord(await Bun.file(groupFile).text());
	if (group.schemaVersion !== 2 || group.mode !== "session") {
		throw new Error("session fixture group has an unexpected record shape");
	}
	const frozenCase = group.inputs.files.find(({ kind }) => kind === "case");
	if (frozenCase === undefined) {
		throw new Error("session fixture group has no frozen case file");
	}
	const casePath = join(dirname(groupFile), frozenCase.path);
	const declaration = parseCaseDeclaration(
		group.caseId,
		await Bun.file(casePath).text(),
	);
	const changedDeclaration = change(declaration);
	const changedText = `${JSON.stringify(changedDeclaration, null, 2)}\n`;
	await Bun.write(casePath, changedText);
	await Bun.write(
		groupFile,
		`${JSON.stringify(
			{
				...group,
				inputs: {
					...group.inputs,
					files: group.inputs.files.map((file) =>
						file.kind === "case"
							? {
									kind: file.kind,
									path: file.path,
									sha256: digest(changedText),
								}
							: file,
					),
				},
			},
			null,
			2,
		)}\n`,
	);
}

async function updateAttemptPrompts(
	groupFile: string,
	prompt: string,
): Promise<void> {
	const group = parseConfirmationGroupRecord(await Bun.file(groupFile).text());
	if (group.schemaVersion !== 2 || group.mode !== "session") {
		throw new Error("session fixture group has an unexpected record shape");
	}

	for (const reference of group.repRecords) {
		const repPath = join(dirname(groupFile), reference.path);
		const rep = parseConfirmationRepRecord(await Bun.file(repPath).text());
		if (rep.schemaVersion !== 2 || rep.mode !== "session") {
			throw new Error("session fixture group has an unexpected rep shape");
		}
		const [stage] = rep.stages;
		if (stage === undefined) {
			throw new Error("session fixture rep has no checks stage");
		}
		const attemptPath = join(dirname(repPath), stage.evidence.recordFile);
		const attempt = parseSessionAttemptRecord(
			await Bun.file(attemptPath).text(),
		);
		await Bun.write(
			attemptPath,
			`${JSON.stringify({ ...attempt, prompt }, null, 2)}\n`,
		);
	}
}

async function updateAttemptChecks(
	groupFile: string,
	checks: readonly SessionAttempt["checks"][number][],
): Promise<void> {
	const group = parseConfirmationGroupRecord(await Bun.file(groupFile).text());
	if (group.schemaVersion !== 2 || group.mode !== "session") {
		throw new Error("session fixture group has an unexpected record shape");
	}

	for (const reference of group.repRecords) {
		const repPath = join(dirname(groupFile), reference.path);
		const rep = parseConfirmationRepRecord(await Bun.file(repPath).text());
		if (rep.schemaVersion !== 2 || rep.mode !== "session") {
			throw new Error("session fixture group has an unexpected rep shape");
		}
		const [stage] = rep.stages;
		if (stage === undefined) {
			throw new Error("session fixture rep has no checks stage");
		}
		const attemptPath = join(dirname(repPath), stage.evidence.recordFile);
		const attempt = parseSessionAttemptRecord(
			await Bun.file(attemptPath).text(),
		);
		const status = attempt.outcome === "SUCCESSFUL" ? "PASS" : "FAIL";
		await Bun.write(
			attemptPath,
			`${JSON.stringify(
				{
					...attempt,
					checks: checks.map(({ kind, detail }) => ({
						kind,
						status,
						detail,
					})),
				},
				null,
				2,
			)}\n`,
		);
	}
}

type MultiCaseArmSource =
	MultiCaseComparisonReport["cases"][number]["arms"]["baseline"]["source"];
type MultiCaseRepProvenance = Omit<
	MultiCaseArmSource["reps"][number],
	"checks" | "stateResults"
>;
interface ArmSourceProvenance {
	readonly group: MultiCaseArmSource["group"];
	readonly reps: readonly MultiCaseRepProvenance[];
}

/**
 * An arm's source without the per-check tally, which these expectations
 * describe by path and digest rather than by grade.
 */
function sourceProvenance(source: MultiCaseArmSource): ArmSourceProvenance {
	return {
		...source,
		reps: source.reps.map(({ checks: _checks, ...rep }) => rep),
	};
}

type SharedSessionCaseField =
	| "tools"
	| "settings"
	| "agents"
	| "projectFiles"
	| "checks"
	| "stateCheck";

function changedSessionCase(
	field: SharedSessionCaseField,
	declaration: ReturnType<typeof parseCaseDeclaration>,
): ReturnType<typeof parseCaseDeclaration> {
	if (declaration.kind !== "session") {
		throw new Error("expected a session case");
	}

	switch (field) {
		case "tools": {
			return { ...declaration, tools: ["Read"] };
		}
		case "settings": {
			return { ...declaration, settings: { mode: "strict" } };
		}
		case "agents": {
			return { ...declaration, agents: { reviewer: "sonnet" } };
		}
		case "projectFiles": {
			return { ...declaration, projectFiles: ["README.md"] };
		}
		case "checks": {
			return {
				...declaration,
				checks: [
					{ kind: "tool-calls", max: 0 },
					{ kind: "word-band", max: 1 },
				],
			};
		}
		case "stateCheck": {
			return {
				...declaration,
				stateCheck: {
					command: ["bun", "run", "score-state.ts"],
					outcomes: ["tree-clean"],
				},
			};
		}
		default: {
			throw new Error("Unhandled shared session case field");
		}
	}
}

async function updateSessionGroupInputs(
	groupFile: string,
	change: (
		inputs: Immutable<SessionConfirmationGroupRecord["inputs"]>,
	) => Immutable<SessionConfirmationGroupRecord["inputs"]>,
): Promise<void> {
	const group = parseConfirmationGroupRecord(await Bun.file(groupFile).text());
	if (group.schemaVersion !== 2 || group.mode !== "session") {
		throw new Error("session fixture group has an unexpected record shape");
	}

	await Bun.write(
		groupFile,
		`${JSON.stringify({ ...group, inputs: change(group.inputs) }, null, 2)}\n`,
	);
}

function sessionGroupFile(
	runsDirectory: string,
	caseId: string,
	role: Role,
): string {
	return confirmationGroupPaths(runsDirectory, `${caseId}-${role}`).groupFile;
}

async function updateCandidateCorpus(
	runsDirectory: string,
	caseId: string,
	content: string,
): Promise<void> {
	const sourceGroupFile = sessionGroupFile(runsDirectory, caseId, "candidate");
	const group = parseConfirmationGroupRecord(
		await Bun.file(sourceGroupFile).text(),
	);
	if (group.schemaVersion !== 2 || group.mode !== "session") {
		throw new Error("session fixture group has an unexpected record shape");
	}
	const corpusFile = group.inputs.files.find(({ kind }) => kind === "corpus");
	if (corpusFile === undefined) {
		throw new Error("session fixture group has no corpus file");
	}
	await Bun.write(join(dirname(sourceGroupFile), corpusFile.path), content);
	await Bun.write(
		sourceGroupFile,
		`${JSON.stringify(
			{
				...group,
				inputs: {
					...group.inputs,
					files: group.inputs.files.map((file) =>
						file.kind === "corpus"
							? {
									kind: file.kind,
									path: file.path,
									sha256: digest(content),
								}
							: file,
					),
				},
			},
			null,
			2,
		)}\n`,
	);
	for (const reference of group.repRecords) {
		const repPath = join(dirname(sourceGroupFile), reference.path);
		const rep = parseConfirmationRepRecord(await Bun.file(repPath).text());
		if (rep.schemaVersion !== 2 || rep.mode !== "session") {
			throw new Error("session fixture rep has an unexpected record shape");
		}
		const [stage] = rep.stages;
		if (stage === undefined) {
			throw new Error("session fixture rep has no checks stage");
		}
		const attemptPath = join(dirname(repPath), stage.evidence.recordFile);
		const attempt = parseSessionAttemptRecord(
			await Bun.file(attemptPath).text(),
		);
		const corpusFiles = attempt.corpusFiles.map((file) => ({
			path: file.path,
			resolvedPath: file.resolvedPath,
			sha256: digest(content),
		}));
		await Bun.write(
			attemptPath,
			`${JSON.stringify({ ...attempt, corpusFiles }, null, 2)}\n`,
		);
	}
}

async function addTranscriptInput(
	runsDirectory: string,
	caseId: string,
	content: string,
): Promise<void> {
	for (const role of roles) {
		const groupFile = sessionGroupFile(runsDirectory, caseId, role);
		const group = parseConfirmationGroupRecord(
			await Bun.file(groupFile).text(),
		);
		if (group.schemaVersion !== 2 || group.mode !== "session") {
			throw new Error("session fixture group has an unexpected record shape");
		}
		const caseFile = group.inputs.files.find(({ kind }) => kind === "case");
		if (caseFile === undefined) {
			throw new Error("session fixture group has no frozen case file");
		}
		const casePath = join(dirname(groupFile), caseFile.path);
		const declaration = parseCaseDeclaration(
			group.caseId,
			await Bun.file(casePath).text(),
		);
		if (declaration.kind !== "session") {
			throw new Error("expected a session case");
		}
		const changedDeclaration = {
			...declaration,
			transcript: {
				file: "prefix.jsonl",
				sha256: digest(content),
				sourceSession: "source-session",
				cut: 1,
			},
		};
		const changedCaseText = `${JSON.stringify(changedDeclaration, null, 2)}\n`;
		await Bun.write(casePath, changedCaseText);
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
							kind: "transcript" as const,
							path: "inputs/transcript/prefix.jsonl",
							sha256: digest(content),
						},
					],
				},
			}),
		);
		await Bun.write(groupFile, `${JSON.stringify(changedGroup, null, 2)}\n`);
	}
}

async function changeFrozenTranscript(
	groupFile: string,
	content: string,
): Promise<void> {
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
						? {
								kind: file.kind,
								path: file.path,
								sha256: digest(content),
							}
						: file,
				),
			},
		}),
	);
	await Bun.write(groupFile, `${JSON.stringify(changedGroup, null, 2)}\n`);
}

describe("session comparison", () => {
	let root: string;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "rehearse-session-comparison-"));
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("reports checks from two existing session cases and three arms", async () => {
		const runsDirectory = join(root, "runs");
		const manifestPath = await writeManifest(root, runsDirectory);

		const reportFile = await writeComparisonReport({
			manifestPath,
			runsDirectory,
		});
		const report = parseComparisonReport(await Bun.file(reportFile).text());

		expect(report.schemaVersion).toBe(4);
		if (report.schemaVersion !== 4 || "samplingUnit" in report) {
			throw new Error("expected a multi-case version-4 session report");
		}
		expect(report.mode).toBe("session");
		expect(report.declaredStages).toEqual(["checks"]);
		expect(report.judgeAgreement.baselines).toEqual([]);
		expect(report.cases[0]?.arms.candidate.quality).toHaveLength(1);
		expect(report.cases[0]?.arms.baseline.quality[0]?.successRate).toBe(0.5);
		expect(report.cases[0]?.arms.candidate.quality[0]?.successRate).toBe(1);
		expect(report.cases[0]?.arms.control.quality[0]?.successRate).toBe(0);
		expect(
			report.cases[0]?.arms.baseline.source.reps.map(
				({ ordinal, outcomes }) => ({ ordinal, outcomes }),
			),
		).toEqual([
			{
				ordinal: 1,
				outcomes: [
					{
						name: "checks",
						status: "JUDGED",
						grade: "A",
						successful: true,
					},
				],
			},
			{
				ordinal: 2,
				outcomes: [
					{
						name: "checks",
						status: "JUDGED",
						grade: "F",
						successful: false,
					},
				],
			},
		]);
		expect(
			report.contrasts.candidateMinusBaseline.quality[0]?.successRate.meanDelta,
		).toBe(0.25);
		expect(
			report.contrasts.candidateMinusBaseline.quality[0]?.successRate
				.standardError,
		).toBe(0.25);
		expect(
			report.contrasts.candidateMinusControl.quality[0]?.successRate.meanDelta,
		).toBe(1);
		expect(
			report.contrasts.baselineMinusControl.quality[0]?.successRate.meanDelta,
		).toBe(0.75);
		expect(
			report.contrasts.candidateMinusBaseline.quality[0]?.successRate
				.caseDeltas,
		).toEqual([
			{ caseId: "case-one", value: 0.5 },
			{ caseId: "case-two", value: 0 },
		]);
		expect(
			report.contrasts.candidateMinusBaseline.quality[0]?.passK,
		).toMatchObject({
			caseDeltas: [
				{ caseId: "case-one", value: 0.75 },
				{ caseId: "case-two", value: 0 },
			],
			meanDelta: 0.375,
			standardError: 0.375,
		});
		expect(
			report.contrasts.candidateMinusControl.quality[0]?.successRate,
		).toMatchObject({
			caseDeltas: [
				{ caseId: "case-one", value: 1 },
				{ caseId: "case-two", value: 1 },
			],
			meanDelta: 1,
			standardError: 0,
		});
		expect(
			report.contrasts.baselineMinusControl.quality[0]?.successRate,
		).toMatchObject({
			caseDeltas: [
				{ caseId: "case-one", value: 0.5 },
				{ caseId: "case-two", value: 1 },
			],
			meanDelta: 0.75,
			standardError: 0.25,
		});
		const expectedSources = [
			{
				caseId: "case-one",
				arms: {
					baseline: await expectedSessionSource(
						dirname(manifestPath),
						runsDirectory,
						"case-one",
						"baseline",
					),
					candidate: await expectedSessionSource(
						dirname(manifestPath),
						runsDirectory,
						"case-one",
						"candidate",
					),
					control: await expectedSessionSource(
						dirname(manifestPath),
						runsDirectory,
						"case-one",
						"control",
					),
				},
			},
			{
				caseId: "case-two",
				arms: {
					baseline: await expectedSessionSource(
						dirname(manifestPath),
						runsDirectory,
						"case-two",
						"baseline",
					),
					candidate: await expectedSessionSource(
						dirname(manifestPath),
						runsDirectory,
						"case-two",
						"candidate",
					),
					control: await expectedSessionSource(
						dirname(manifestPath),
						runsDirectory,
						"case-two",
						"control",
					),
				},
			},
		];
		expect(
			report.cases.map(({ caseId, arms }) => ({
				caseId,
				arms: {
					baseline: sourceProvenance(arms.baseline.source),
					candidate: sourceProvenance(arms.candidate.source),
					control: sourceProvenance(arms.control.source),
				},
			})),
		).toEqual(expectedSources);
		const digestValue = digest(await Bun.file(manifestPath).text());
		const listed: string[] = [];
		await runList(
			{ kind: "comparisons", runsDirectory },
			{
				stdout: (text) => {
					listed.push(text);
				},
				stderr: () => undefined,
			},
		);
		expect(listed.join("")).toContain(`comparison:${digestValue}`);
		const shown: string[] = [];
		await runShow(
			{
				id: `comparison:${digestValue}`,
				json: false,
				runsDirectory,
			},
			{
				stdout: (text) => {
					shown.push(text);
				},
				stderr: () => undefined,
			},
		);
		expect(shown.join("")).toContain("2 cases, session mode, 2 reps.");
		const shownJson: string[] = [];
		await runShow(
			{
				id: `comparison:${digestValue}`,
				json: true,
				runsDirectory,
			},
			{
				stdout: (text) => {
					shownJson.push(text);
				},
				stderr: () => undefined,
			},
		);
		expect(parseComparisonReport(shownJson.join("")).schemaVersion).toBe(4);
		expect(() =>
			parseComparisonReport(JSON.stringify({ ...report, mode: "pipeline" })),
		).toThrow();
		expect(() =>
			parseComparisonReport(
				JSON.stringify({ ...report, declaredStages: ["final"] }),
			),
		).toThrow();
		expect(() =>
			parseComparisonReport(
				JSON.stringify({
					...report,
					judgeAgreement: {
						skippedCalibrations: 0,
						baselines: [
							{
								judgeModel: "sonnet",
								stage: "checks",
								rubricSha256: "a".repeat(64),
								criteria: [
									{
										rubricId: "checks",
										sampleSize: 1,
										judgePassHumanPass: 1,
										judgeFailHumanFail: 0,
										judgePassHumanFail: 0,
										judgeFailHumanPass: 0,
										observedAgreement: 1,
										cohensKappa: null,
									},
								],
							},
						],
					},
				}),
			),
		).toThrow();
	});

	it("reports one session case across three arms without a second case", async () => {
		const runsDirectory = join(root, "runs");
		const manifestPath = await writeManifest(root, runsDirectory, undefined, [
			"case-one",
		]);

		const reportFile = await writeComparisonReport({
			manifestPath,
			runsDirectory,
		});
		const report = parseComparisonReport(await Bun.file(reportFile).text());

		expect(report.cases).toHaveLength(1);
		expect(report.mode).toBe("session");
		expect(report.declaredStages).toEqual(["checks"]);
		if (report.schemaVersion !== 4 || !("samplingUnit" in report)) {
			throw new Error("expected a single-case version-4 session report");
		}
		expect(report.samplingUnit).toBe("rep");

		const digestValue = digest(await Bun.file(manifestPath).text());
		const shown: string[] = [];
		await runShow(
			{ id: `comparison:${digestValue}`, json: false, runsDirectory },
			{
				stdout: (text) => {
					shown.push(text);
				},
				stderr: () => undefined,
			},
		);
		const summary = shown.join("");

		expect(summary).toContain("1 case, session mode, 2 reps.");
		expect(summary).toContain("Sampling unit: rep");
		expect(summary).not.toContain("final");
		expect(summary).toContain("| candidate | 2/2 | 1.000 | 0.342-1.000 |");
		expect(summary).toContain("| control | 0/2 | 0.000 | 0.000-0.658 |");
		expect(summary).toContain("no observed spread");

		const attemptHistories = await comparisonAttemptHistoryLinks(
			report,
			runsDirectory,
		);
		const served = comparisonReport(report, attemptHistories);

		expect(Object.keys(served.attribution)).toEqual(["case-one"]);
		expect(Object.keys(served.qualityReadings)).toEqual(["case-one"]);
		expect(Object.keys(served.attemptHistories)).toEqual(["case-one"]);
	});

	it("distinguishes partial scores and names each failing check", async () => {
		const runsDirectory = join(root, "runs");
		const manifestPath = await writeManifest(root, runsDirectory, undefined, [
			"case-three",
		]);
		const reportFile = await writeComparisonReport({
			manifestPath,
			runsDirectory,
		});
		const report = parseComparisonReport(await Bun.file(reportFile).text());
		if (report.schemaVersion !== 4 || !("samplingUnit" in report)) {
			throw new Error("expected a single-case version-4 session report");
		}
		const reps = report.cases[0]?.arms.baseline.source.reps ?? [];

		expect(reps.map((rep) => rep.checks)).toEqual([
			{ passed: 2, declared: 2, failing: [] },
			{
				passed: 0,
				declared: 2,
				failing: [
					{ index: 0, kind: "word-band", detail: "3 words" },
					{ index: 1, kind: "tool-calls", detail: "3 tool calls" },
				],
			},
		]);
	});

	it("compares a committed state-scored case across three arms end to end", async () => {
		const declaration = await readCaseDeclaration("state-probe");
		if (declaration.kind !== "session") {
			throw new Error("state-probe is expected to be a session case");
		}
		const { stateCheck } = declaration;
		if (stateCheck === undefined) {
			throw new Error("state-probe is expected to declare a state check");
		}

		const runsDirectory = join(root, "runs");
		const manifestPath = await writeManifest(
			root,
			runsDirectory,
			undefined,
			["case-one"],
			stateCheck,
		);

		const reportFile = await writeComparisonReport({
			manifestPath,
			runsDirectory,
		});
		const report = parseComparisonReport(await Bun.file(reportFile).text());
		if (report.schemaVersion !== 4 || !("samplingUnit" in report)) {
			throw new Error("expected a single-case version-4 session report");
		}
		const reps = report.cases[0]?.arms.candidate.source.reps ?? [];

		expect(report.cases).toHaveLength(1);
		expect(reps.map((rep) => rep.stateResults)).toEqual([
			{ passed: 3, declared: 3, failing: [] },
			{ passed: 3, declared: 3, failing: [] },
		]);
		expect(
			report.cases[0]?.arms.control.source.reps.map((rep) => rep.stateResults),
		).toEqual([
			{
				passed: 0,
				declared: 3,
				failing: stateCheck.outcomes.map((name) => ({
					name,
					detail: `${name} does not hold`,
				})),
			},
			{
				passed: 0,
				declared: 3,
				failing: stateCheck.outcomes.map((name) => ({
					name,
					detail: `${name} does not hold`,
				})),
			},
		]);
		expect(casesRoot()).toContain("cases");
	});

	it("retains no replies, execution failures, and missing metrics", async () => {
		const runsDirectory = join(root, "runs");
		const manifestPath = await writeManifest(
			root,
			runsDirectory,
			(caseId, role, ordinal) => {
				if (caseId !== "case-one") {
					return undefined;
				}
				if (role === "candidate") {
					return ordinal === 1 ? "no-reply" : "execution-failed";
				}
				if (role === "baseline" && ordinal === 2) {
					return "missing-metrics";
				}

				return undefined;
			},
		);
		const report = parseComparisonReport(
			await Bun.file(
				await writeComparisonReport({ manifestPath, runsDirectory }),
			).text(),
		);
		if (report.schemaVersion !== 4 || report.mode !== "session") {
			throw new Error("expected a version-4 session comparison report");
		}
		const [benchmarkCase] = report.cases;
		if (benchmarkCase === undefined) {
			throw new Error("expected the first comparison case");
		}
		const [candidate] = benchmarkCase.arms.candidate.quality;
		const [baseline] = benchmarkCase.arms.baseline.quality;
		if (candidate === undefined || baseline === undefined) {
			throw new Error("expected checks quality summaries");
		}
		expect(candidate).toMatchObject({
			requested: 2,
			attempted: 1,
			notReached: 1,
			failed: 1,
			successful: 0,
		});
		expect(baseline).toMatchObject({
			requested: 2,
			attempted: 2,
			notReached: 0,
			failed: 1,
			successful: 1,
		});
		expect(
			benchmarkCase.arms.candidate.source.reps.map(({ outcomes }) => outcomes),
		).toEqual([
			[
				{
					name: "checks",
					status: "NOT_REACHED",
					successful: false,
				},
			],
			[
				{
					name: "checks",
					status: "EXECUTION_FAILED",
					successful: false,
				},
			],
		]);
		expect(benchmarkCase.arms.baseline.source.reps[1]?.outcomes).toEqual([
			{
				name: "checks",
				status: "METRICS_MISSING",
				successful: false,
			},
		]);
		expect(benchmarkCase.arms.baseline.resources.status).toBe("UNAVAILABLE");
	});

	it.each([
		[
			"B",
			Object.fromEntries([
				["B", 1],
				["F", 1],
			]),
		],
		["F", Object.fromEntries([["F", 2]])],
	] as const)(
		"rejects a session outcome graded %s while marked successful",
		async (grade, gradeDistribution) => {
			const runsDirectory = join(root, "runs");
			const manifestPath = await writeManifest(root, runsDirectory);
			const report = parseComparisonReport(
				await Bun.file(
					await writeComparisonReport({ manifestPath, runsDirectory }),
				).text(),
			);
			if (report.schemaVersion !== 4 || report.mode !== "session") {
				throw new Error("expected a version-4 session comparison report");
			}
			const candidate = {
				...report,
				cases: Array.from(report.cases, (benchmarkCase, caseIndex) =>
					caseIndex === 0
						? {
								...benchmarkCase,
								arms: {
									...benchmarkCase.arms,
									baseline: {
										...benchmarkCase.arms.baseline,
										quality: Array.from(
											benchmarkCase.arms.baseline.quality,
											(summary) => ({ ...summary, gradeDistribution }),
										),
										source: {
											...benchmarkCase.arms.baseline.source,
											reps: Array.from(
												benchmarkCase.arms.baseline.source.reps,
												(rep, repIndex) =>
													repIndex === 0
														? {
																...rep,
																outcomes: Array.from(
																	rep.outcomes,
																	(outcome) => ({
																		...outcome,
																		grade,
																		successful: true,
																	}),
																),
															}
														: rep,
											),
										},
									},
								},
							}
						: benchmarkCase,
				),
			};

			expect(() => parseComparisonReport(JSON.stringify(candidate))).toThrow();
		},
	);

	it("refuses a changed shared prompt with its case and arms named", async () => {
		const runsDirectory = join(root, "runs");
		const manifestPath = await writeManifest(root, runsDirectory);
		await updateFrozenCase(
			sessionGroupFile(runsDirectory, "case-one", "candidate"),
			(declaration) => {
				if (declaration.kind !== "session") {
					throw new Error("expected a session case");
				}

				return { ...declaration, prompt: "A different prompt." };
			},
		);
		await updateAttemptPrompts(
			sessionGroupFile(runsDirectory, "case-one", "candidate"),
			"A different prompt.",
		);

		expect(
			writeComparisonReport({ manifestPath, runsDirectory }),
		).rejects.toThrow(
			"case case-one arms baseline and candidate field inputs.files.case.prompt",
		);
	});

	function addSharedCaseFieldTest(field: SharedSessionCaseField): void {
		it(`refuses a changed shared case ${field}`, async () => {
			const runsDirectory = join(root, "runs");
			const manifestPath = await writeManifest(root, runsDirectory);
			await updateFrozenCase(
				sessionGroupFile(runsDirectory, "case-one", "candidate"),
				(declaration) => changedSessionCase(field, declaration),
			);
			if (field === "checks") {
				await updateAttemptChecks(
					sessionGroupFile(runsDirectory, "case-one", "candidate"),
					[
						{ kind: "tool-calls", status: "PASS", detail: "0 tool calls" },
						{ kind: "word-band", status: "PASS", detail: "1 word" },
					],
				);
			}

			expect(
				writeComparisonReport({ manifestPath, runsDirectory }),
			).rejects.toThrow(
				`case case-one arms baseline and candidate field inputs.files.case.${field}`,
			);
		});
	}
	for (const field of [
		"tools",
		"settings",
		"agents",
		"projectFiles",
		"checks",
		"stateCheck",
	] as const) {
		addSharedCaseFieldTest(field);
	}

	it("refuses a changed fixture declaration by naming the input", async () => {
		const runsDirectory = join(root, "runs");
		const manifestPath = await writeManifest(root, runsDirectory);
		await updateFrozenCase(
			sessionGroupFile(runsDirectory, "case-one", "candidate"),
			(declaration) => {
				if (declaration.kind !== "session") {
					throw new Error("expected a session case");
				}

				return { ...declaration, fixture: "fixture" };
			},
		);

		expect(
			writeComparisonReport({ manifestPath, runsDirectory }),
		).rejects.toThrow(
			"case case-one arms baseline and candidate field inputs.files.case.fixture",
		);
	});

	function addSessionScalarTest(
		field: "model" | "effort" | "sessionBudgetUsd",
		value: string | number,
		expected: string,
	): void {
		it(`refuses a changed session ${field}`, async () => {
			const runsDirectory = join(root, "runs");
			const manifestPath = await writeManifest(root, runsDirectory);
			await updateSessionGroupInputs(
				sessionGroupFile(runsDirectory, "case-one", "candidate"),
				(inputs) => ({ ...inputs, [field]: value }),
			);

			expect(
				writeComparisonReport({ manifestPath, runsDirectory }),
			).rejects.toThrow(`case case-one arm candidate field ${expected}`);
		});
	}
	for (const [field, value, expected] of [
		["model", "haiku", "inputs.model"],
		["effort", "high", "repRecords[0].effort"],
		["sessionBudgetUsd", 0.3, "inputs.sessionBudgetUsd"],
	] as const) {
		addSessionScalarTest(field, value, expected);
	}

	it("refuses frozen transcript bytes whose digest disagrees with the case", async () => {
		const runsDirectory = join(root, "runs");
		const manifestPath = await writeManifest(root, runsDirectory);
		await addTranscriptInput(runsDirectory, "case-one", "original prefix\n");
		await changeFrozenTranscript(
			sessionGroupFile(runsDirectory, "case-one", "candidate"),
			"changed prefix\n",
		);

		expect(
			writeComparisonReport({ manifestPath, runsDirectory }),
		).rejects.toThrow(
			"case case-one arm candidate field inputs.files.transcript.sha256",
		);
	});

	it("refuses a check result whose kind disagrees with the frozen case", async () => {
		const runsDirectory = join(root, "runs");
		const manifestPath = await writeManifest(root, runsDirectory);
		const candidateGroupFile = sessionGroupFile(
			runsDirectory,
			"case-one",
			"candidate",
		);
		const group = parseConfirmationGroupRecord(
			await Bun.file(candidateGroupFile).text(),
		);
		if (group.schemaVersion !== 2 || group.mode !== "session") {
			throw new Error("expected a session group");
		}
		const [reference] = group.repRecords;
		if (reference === undefined) {
			throw new Error("expected a rep reference");
		}
		const repPath = join(dirname(candidateGroupFile), reference.path);
		const rep = parseConfirmationRepRecord(await Bun.file(repPath).text());
		if (rep.schemaVersion !== 2 || rep.mode !== "session") {
			throw new Error("expected a session rep");
		}
		const [stage] = rep.stages;
		if (stage === undefined) {
			throw new Error("session fixture rep has no checks stage");
		}
		const attemptPath = join(dirname(repPath), stage.evidence.recordFile);
		const attempt = parseSessionAttemptRecord(
			await Bun.file(attemptPath).text(),
		);
		const [check] = attempt.checks;
		if (check === undefined) {
			throw new Error("expected a checked attempt");
		}
		await Bun.write(
			attemptPath,
			`${JSON.stringify(
				{
					...attempt,
					checks: [{ ...check, kind: "forbidden-text" }],
				},
				null,
				2,
			)}\n`,
		);

		expect(
			writeComparisonReport({ manifestPath, runsDirectory }),
		).rejects.toThrow(
			"case case-one arm candidate field repRecords[0].checks[0].kind",
		);
	});

	it("refuses an attempt whose elapsed time disagrees with its rep", async () => {
		const runsDirectory = join(root, "runs");
		const manifestPath = await writeManifest(root, runsDirectory);
		const candidateGroupFile = sessionGroupFile(
			runsDirectory,
			"case-one",
			"candidate",
		);
		const group = parseConfirmationGroupRecord(
			await Bun.file(candidateGroupFile).text(),
		);
		if (group.schemaVersion !== 2 || group.mode !== "session") {
			throw new Error("expected a session group");
		}
		const [reference] = group.repRecords;
		if (reference === undefined) {
			throw new Error("expected a rep reference");
		}
		const repPath = join(dirname(candidateGroupFile), reference.path);
		const rep = parseConfirmationRepRecord(await Bun.file(repPath).text());
		if (rep.schemaVersion !== 2 || rep.mode !== "session") {
			throw new Error("expected a session rep");
		}
		const [stage] = rep.stages;
		if (stage === undefined) {
			throw new Error("expected a checks stage");
		}
		const attemptPath = join(dirname(repPath), stage.evidence.recordFile);
		const attempt = parseSessionAttemptRecord(
			await Bun.file(attemptPath).text(),
		);
		await Bun.write(
			attemptPath,
			`${JSON.stringify({ ...attempt, elapsedMs: attempt.elapsedMs + 1 }, null, 2)}\n`,
		);

		expect(
			writeComparisonReport({ manifestPath, runsDirectory }),
		).rejects.toThrow(
			"case case-one arm candidate field repRecords[0].elapsedMs",
		);
	});

	it("refuses a session rep that names another attempt path", async () => {
		const runsDirectory = join(root, "runs");
		const manifestPath = await writeManifest(root, runsDirectory);
		const candidateGroupFile = sessionGroupFile(
			runsDirectory,
			"case-one",
			"candidate",
		);
		const group = parseConfirmationGroupRecord(
			await Bun.file(candidateGroupFile).text(),
		);
		if (group.schemaVersion !== 2 || group.mode !== "session") {
			throw new Error("expected a session group");
		}
		const [reference] = group.repRecords;
		if (reference === undefined) {
			throw new Error("expected a rep reference");
		}
		const repPath = join(dirname(candidateGroupFile), reference.path);
		const rep = parseConfirmationRepRecord(await Bun.file(repPath).text());
		if (rep.schemaVersion !== 2 || rep.mode !== "session") {
			throw new Error("expected a session rep");
		}
		const [stage] = rep.stages;
		if (stage === undefined) {
			throw new Error("expected a checks stage");
		}
		await Bun.write(
			repPath,
			`${JSON.stringify(
				{
					...rep,
					stages: [
						{
							...stage,
							evidence: { recordFile: "/dev/zero" },
						},
					],
				},
				null,
				2,
			)}\n`,
		);

		expect(
			writeComparisonReport({ manifestPath, runsDirectory }),
		).rejects.toThrow(
			"case case-one arm candidate field repRecords[0].attempt.path",
		);
	});

	it("refuses a session frozen input outside its kind directory", async () => {
		const runsDirectory = join(root, "runs");
		const manifestPath = await writeManifest(root, runsDirectory);
		const candidateGroupFile = sessionGroupFile(
			runsDirectory,
			"case-one",
			"candidate",
		);
		const group = parseConfirmationGroupRecord(
			await Bun.file(candidateGroupFile).text(),
		);
		if (group.schemaVersion !== 2 || group.mode !== "session") {
			throw new Error("expected a session group");
		}
		const corpusFile = group.inputs.files.find(({ kind }) => kind === "corpus");
		if (corpusFile === undefined) {
			throw new Error("expected a frozen corpus file");
		}
		await Bun.write(
			candidateGroupFile,
			`${JSON.stringify(
				{
					...group,
					inputs: {
						...group.inputs,
						files: group.inputs.files.map((file) =>
							file === corpusFile
								? {
										kind: "fixture" as const,
										path: "inputs/corpus/missing-fixture.md",
										sha256: file.sha256,
									}
								: file,
						),
					},
				},
				null,
				2,
			)}\n`,
		);

		const comparison = writeComparisonReport({ manifestPath, runsDirectory });
		expect(comparison).rejects.toThrow(
			"case case-one arm candidate field inputs.files[fixture:inputs/corpus/missing-fixture.md]: session fixture input must be under inputs/fixture/",
		);
		await comparison.catch(() => undefined);
		const manifestSha = digest(await Bun.file(manifestPath).text());
		expect(
			await Bun.file(
				comparisonReportPaths(runsDirectory, manifestSha).reportFile,
			).exists(),
		).toBe(false);
	});

	it("refuses malformed session attempt evidence without writing a report", async () => {
		const runsDirectory = join(root, "runs");
		const manifestPath = await writeManifest(root, runsDirectory);
		const candidateGroupFile = sessionGroupFile(
			runsDirectory,
			"case-one",
			"candidate",
		);
		const group = parseConfirmationGroupRecord(
			await Bun.file(candidateGroupFile).text(),
		);
		if (group.schemaVersion !== 2 || group.mode !== "session") {
			throw new Error("expected a session group");
		}
		const [reference] = group.repRecords;
		if (reference === undefined) {
			throw new Error("expected a rep reference");
		}
		const repPath = join(dirname(candidateGroupFile), reference.path);
		const rep = parseConfirmationRepRecord(await Bun.file(repPath).text());
		if (rep.schemaVersion !== 2 || rep.mode !== "session") {
			throw new Error("expected a session rep");
		}
		const [stage] = rep.stages;
		if (stage === undefined) {
			throw new Error("expected a checks stage");
		}
		const attemptPath = join(dirname(repPath), stage.evidence.recordFile);
		await Bun.write(attemptPath, "{\n");

		const comparison = writeComparisonReport({ manifestPath, runsDirectory });
		expect(comparison).rejects.toThrow(
			"case case-one arm candidate field repRecords[0].attempt.record",
		);
		await comparison.catch(() => undefined);
		const manifestSha = digest(await Bun.file(manifestPath).text());
		expect(
			await Bun.file(
				comparisonReportPaths(runsDirectory, manifestSha).reportFile,
			).exists(),
		).toBe(false);
	});

	it("refuses same-role corpus drift across cases", async () => {
		const runsDirectory = join(root, "runs");
		const manifestPath = await writeManifest(root, runsDirectory);
		await updateCandidateCorpus(
			runsDirectory,
			"case-two",
			"candidate corpus changed\n",
		);

		expect(
			writeComparisonReport({ manifestPath, runsDirectory }),
		).rejects.toThrow(
			"case case-two arm candidate field inputs.files.corpus differs from case case-one",
		);
	});

	it("does not replace a session attempt when the report destination overlaps it", async () => {
		const runsDirectory = join(root, "runs");
		const manifestPath = await writeManifest(root, runsDirectory);
		const manifestSha = digest(await Bun.file(manifestPath).text());
		const reportPath = join(
			runsDirectory,
			"comparisons",
			manifestSha,
			"report.json",
		);
		const candidateGroupFile = sessionGroupFile(
			runsDirectory,
			"case-one",
			"candidate",
		);
		const candidateGroup = parseConfirmationGroupRecord(
			await Bun.file(candidateGroupFile).text(),
		);
		const [reference] = candidateGroup.repRecords;
		if (reference === undefined) {
			throw new Error("expected a candidate rep");
		}
		const repPath = join(dirname(candidateGroupFile), reference.path);
		const rep = parseConfirmationRepRecord(await Bun.file(repPath).text());
		if (rep.schemaVersion !== 2 || rep.mode !== "session") {
			throw new Error("expected a session rep");
		}
		const [stage] = rep.stages;
		if (stage === undefined) {
			throw new Error("expected a candidate checks stage");
		}
		const attemptPath = join(dirname(repPath), stage.evidence.recordFile);
		const attemptText = await Bun.file(attemptPath).text();
		await mkdir(dirname(reportPath), { recursive: true });
		await symlink(attemptPath, reportPath);

		expect(
			writeComparisonReport({ manifestPath, runsDirectory }),
		).rejects.toBeInstanceOf(RefusedPreconditionError);
		expect(await Bun.file(attemptPath).text()).toBe(attemptText);
		expect(await Bun.file(reportPath).text()).toBe(attemptText);
	});
});
