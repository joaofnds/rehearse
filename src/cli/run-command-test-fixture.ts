import type { BenchmarkCase, SessionCase } from "#benchmark/case";
import type { Immutable } from "#benchmark/contracts";
import type { PipelineDefinition } from "#benchmark/pipeline";
import type { RunCommandDependencies } from "#cli/run-command";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

import { SessionCaseBuilder } from "./session-case-test-fixture";

const STORED_SPEND_CEILING_USD = 0.75;

const DEBUG_EXECUTION_EVENT_COUNT = 4;

const FIRST_STOP_REQUEST_INDEX = 0;

const PREFIX_START_INDEX = 0;

const COMMAND_SPEND_CEILING_USD = 100;

const args = [
	"--target",
	"/nonexistent-target",
	"--model",
	"sonnet",
	"--judge-model",
	"opus",
	"--session-budget-usd",
	"1",
];

const neverASession: RunCommandDependencies["executeSession"] = async () =>
	await Promise.reject(new Error("a session attempt must not start"));

const loadedStageSettings = {
	hashed: {
		path: "stage-settings.json",
		sha256: "b".repeat(SHA256_HEX_DIGITS),
	},
	json: '{"disableAllHooks":true}',
};

const passingPreflight: RunCommandDependencies["assertPreflight"] = async () =>
	await Promise.resolve(loadedStageSettings);

const missingPreflight = {
	missing: "preflight call metrics",
	status: "MISSING",
} as const;

const storedCeiling = async (): Promise<number> =>
	await Promise.resolve(COMMAND_SPEND_CEILING_USD);

const passingProbe: RunCommandDependencies["probeModel"] = async () =>
	await Promise.resolve(missingPreflight);

const smokeCase: SessionCase = new SessionCaseBuilder().build();

const resumedSmokeCase: SessionCase = new SessionCaseBuilder({
	declaration: {
		...smokeCase.declaration,
		transcript: {
			cut: 1,
			file: "prefix.jsonl",
			sha256: "a".repeat(SHA256_HEX_DIGITS),
			sourceSession: "source-session",
		},
	},
	transcriptPath: "/cases/smoke/prefix.jsonl",
}).build();

const sessionMetrics = {
	cacheReadTokens: 3,
	cacheWriteTokens: 4,
	costUsd: 0.02,
	inputTokens: 10,
	outputTokens: 2,
	turns: 1,
};

const unavailableTranscriptDiagnostics = {
	prefixLinesExcluded: 0,
	state: "unavailable",
} as const;

const pipeline: PipelineDefinition = {
	stages: [{ kind: "delivery", name: "build", rubric: "b", skill: "build" }],
	statuses: ["To Do", "Build", "Done"],
	target: { checks: [], integrityFiles: [] },
};

class BenchmarkCaseBuilder {
	public constructor(
		private readonly overrides: Immutable<Partial<BenchmarkCase>> = {},
	) {}
	public build(): BenchmarkCase {
		return {
			declaration: {
				finalRubric: "rubric.md",
				id: "audit-log",
				kind: "pipeline",
				pipeline: "pipelines/default.json",
				productBrief: "product-brief.md",
				rubrics: "rubrics",
				target: { path: "/declared/target" },
				task: "backlog-seed.md",
				title: "Audit log",
			},
			finalRubric: "Rubric",
			finalRubricPath: "/control/cases/audit-log/rubric.md",
			kind: "pipeline",
			pipeline,
			pipelinePath: "cases/audit-log/pipelines/default.json",
			productBrief: "Brief",
			rubricsDirectory: "/control/cases/audit-log/rubrics",
			settingsFilePath: "/control/stage-settings.json",
			stageRubrics: {},
			targetPath: "/declared/target",
			task: "Task",
			...this.overrides,
		};
	}
}

const auditLogCase: BenchmarkCase = new BenchmarkCaseBuilder().build();

interface CaseLoader {
	readonly loaded: readonly string[];
	readonly requireCase: (id: string) => Promise<BenchmarkCase>;
}

function loadsAuditLog(): CaseLoader {
	const loaded: string[] = [];

	return {
		loaded,
		requireCase: async (id) => {
			loaded.push(id);

			return await Promise.resolve(auditLogCase);
		},
	};
}

export {
	BenchmarkCaseBuilder,
	args,
	auditLogCase,
	DEBUG_EXECUTION_EVENT_COUNT,
	FIRST_STOP_REQUEST_INDEX,
	loadedStageSettings,
	loadsAuditLog,
	missingPreflight,
	neverASession,
	passingPreflight,
	passingProbe,
	pipeline,
	PREFIX_START_INDEX,
	resumedSmokeCase,
	sessionMetrics,
	smokeCase,
	STORED_SPEND_CEILING_USD,
	storedCeiling,
	unavailableTranscriptDiagnostics,
};

export { SessionCaseBuilder } from "./session-case-test-fixture";
