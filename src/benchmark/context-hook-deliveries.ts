import type { z } from "zod";

import type {
	ContextEvidence,
	ContextEvidenceSource,
} from "./context-evidence-contract";
import {
	compactionHookSchema,
	coverageRecordSchema,
	instructionLoadHookSchema,
	rawBodyRecordSchema,
	stringValue,
} from "./context-evidence-values";
import { recordNormalizationIssue } from "./context-normalization-issues";
import type { NormalizationIssues } from "./context-normalization-issues";
import type { Immutable } from "./contracts";
import type { JsonObject } from "./json-value";

const EMPTY_COLLECTION_LENGTH = 0;

function normalizedLoad(
	hook: Readonly<JsonObject>,
	issues: Readonly<NormalizationIssues>,
): ContextEvidence["projection"]["instructionLoads"] {
	if (stringValue(hook, "hook_event_name") !== "InstructionsLoaded") {
		return [];
	}
	const parsed = instructionLoadHookSchema.safeParse(hook);
	if (!parsed.success) {
		recordNormalizationIssue(issues, {
			detail: "invalid InstructionsLoaded record",
			record: hook,
			stream: "hooks",
		});
		return [];
	}
	return [instructionLoad(parsed.data)];
}
function normalizedLoads(
	files: ContextEvidenceSource["files"],
	issues: Readonly<NormalizationIssues>,
): ContextEvidence["projection"]["instructionLoads"] {
	return files.hooks.flatMap((hook) => normalizedLoad(hook, issues));
}

type InstructionHook = z.infer<typeof instructionLoadHookSchema>;
type InstructionLoad =
	ContextEvidence["projection"]["instructionLoads"][number];
interface LoadTriggers {
	readonly triggerFilePath: string | undefined;
	readonly parentFilePath: string | undefined;
	readonly globs: readonly string[];
}
function addLoadTriggers(
	load: InstructionLoad,
	{ triggerFilePath, parentFilePath, globs }: LoadTriggers,
): void {
	if (triggerFilePath !== undefined) {
		Object.assign(load, { triggerFilePath });
	}
	if (parentFilePath !== undefined) {
		Object.assign(load, { parentFilePath });
	}
	if (globs.length > EMPTY_COLLECTION_LENGTH) {
		Object.assign(load, { globs });
	}
}
function instructionLoad(data: Immutable<InstructionHook>): InstructionLoad {
	const {
		capture_ordinal: sourceOrdinal,
		file_path: filePath,
		memory_type: memoryType,
		load_reason: loadReason,
		prompt_id: promptId = null,
		trigger_file_path: triggerFilePath,
		parent_file_path: parentFilePath,
		globs = [],
	} = data;
	const agentId =
		data.agent_id ??
		(loadReason === "session_start" && promptId === null ? "main" : null);
	const load = {
		agentId,
		filePath,
		loadReason,
		memoryType,
		promptId,
		sourceOrdinal,
	};
	if (agentId === null) {
		Object.assign(load, { attributionState: "missing" as const });
	}
	addLoadTriggers(load, { globs, parentFilePath, triggerFilePath });
	return load;
}

type CompactionHook = z.infer<typeof compactionHookSchema>;
function compactionEvent(
	hook: Readonly<JsonObject>,
	data: Immutable<CompactionHook>,
	event: "PreCompact" | "PostCompact",
): ContextEvidence["projection"]["compactions"][number] {
	const {
		capture_ordinal: sourceOrdinal,
		agent_id: agentId = null,
		prompt_id: promptId = null,
		trigger,
	} = data;
	const compaction = {
		agentId,
		phase: event === "PreCompact" ? ("pre" as const) : ("post" as const),
		promptId,
		sourceOrdinal,
		trigger,
	};
	if (agentId === null) {
		Object.assign(compaction, { attributionState: "missing" as const });
	}
	if (event === "PostCompact") {
		Object.assign(compaction, {
			summaryAvailable: stringValue(hook, "compact_summary") !== undefined,
		});
	}

	return compaction;
}
function normalizedCompaction(
	hook: Readonly<JsonObject>,
	issues: Readonly<NormalizationIssues>,
): ContextEvidence["projection"]["compactions"] {
	const event = stringValue(hook, "hook_event_name");
	if (event !== "PreCompact" && event !== "PostCompact") {
		return [];
	}
	const parsed = compactionHookSchema.safeParse(hook);
	if (!parsed.success) {
		recordNormalizationIssue(issues, {
			detail: "invalid compaction record",
			record: hook,
			stream: "hooks",
		});
		return [];
	}
	return [compactionEvent(hook, parsed.data, event)];
}
function normalizedCompactions(
	files: ContextEvidenceSource["files"],
	issues: Readonly<NormalizationIssues>,
): ContextEvidence["projection"]["compactions"] {
	return files.hooks.flatMap((hook) => normalizedCompaction(hook, issues));
}

function normalizedRawBody(
	record: Readonly<JsonObject>,
	issues: Readonly<NormalizationIssues>,
): ContextEvidence["projection"]["rawApiBodies"] {
	const parsed = rawBodyRecordSchema.safeParse(record);
	if (!parsed.success) {
		recordNormalizationIssue(issues, {
			detail: "invalid raw API body reference",
			record,
			stream: "rawApiBodies",
		});
		return [];
	}

	return [
		{
			bodyRef: parsed.data.body_ref,
			requestId: null,
			sourceOrdinal: parsed.data.capture_ordinal,
			state: "unassigned-no-documented-key",
		},
	];
}

function normalizedCoverage(
	records: readonly Readonly<JsonObject>[],
	issues: Readonly<NormalizationIssues>,
): ContextEvidence["projection"]["coverage"] {
	const coverage = new Map<
		string,
		ContextEvidence["projection"]["coverage"][number]
	>();
	for (const record of records) {
		recordCoverageClaim(record, coverage, issues);
	}

	for (const issue of issues.values) {
		const current = coverage.get(issue.stream);
		coverage.set(issue.stream, {
			reason:
				current?.reason === undefined
					? "normalization-issue"
					: `${current.reason}; normalization-issue`,
			state: "partial",
			stream: issue.stream,
		});
	}

	return [...coverage.values()].toSorted((left, right) =>
		left.stream.localeCompare(right.stream),
	);
}

function recordCoverageClaim(
	record: Readonly<JsonObject>,
	coverage: Map<string, ContextEvidence["projection"]["coverage"][number]>,
	issues: Readonly<NormalizationIssues>,
): void {
	const parsed = coverageRecordSchema.safeParse(record);
	if (parsed.success) {
		const current = coverage.get(parsed.data.stream);
		if (
			current !== undefined &&
			(current.state !== parsed.data.state ||
				current.reason !== parsed.data.reason)
		) {
			coverage.set(parsed.data.stream, {
				reason: "coverage-claim-conflict",
				state: "partial",
				stream: parsed.data.stream,
			});
		} else {
			coverage.set(parsed.data.stream, parsed.data);
		}
	} else {
		recordNormalizationIssue(issues, {
			detail: "invalid coverage record",
			record,
			stream: "coverage",
		});
	}
}

function normalizedHookEvidence(
	files: ContextEvidenceSource["files"],
	issues: Readonly<NormalizationIssues>,
): Pick<
	ContextEvidence["projection"],
	"instructionLoads" | "compactions" | "rawApiBodies" | "coverage"
> {
	const instructionLoads = normalizedLoads(files, issues);
	const compactions = normalizedCompactions(files, issues);
	const rawApiBodies = files.rawApiBodies.flatMap((record) =>
		normalizedRawBody(record, issues),
	);
	const coverage = normalizedCoverage(files.coverage, issues);
	return { compactions, coverage, instructionLoads, rawApiBodies };
}

export {
	normalizedHookEvidence,
	normalizedLoads,
	normalizedCompactions,
	normalizedRawBody,
	normalizedCoverage,
};
