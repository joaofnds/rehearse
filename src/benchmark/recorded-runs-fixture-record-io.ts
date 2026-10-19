import { z } from "zod";

import type { HashedFile } from "./checkpoint";
import type { ClaudeCallMetrics, Immutable } from "./contracts";
import type { CorpusMeasurement } from "./corpus-measurement";
import type { ReadManifestEntry } from "./read-manifest";
import { FIXTURE_JSON_INDENT_SPACES } from "./recorded-runs-fixture-readings";
import type { WrittenRecord } from "./recorded-runs-fixture-record-data";

interface RecordedAttemptInputs {
	readonly corpusRoot: string;
	readonly caseId: string;
	readonly layoutPaths: readonly string[];
	readonly corpusVersion?: CorpusMeasurement | undefined;
}

interface RunningStageMetrics {
	readonly spentUsd?: number | undefined;
	readonly elapsedMs?: number | undefined;
}

interface SessionGroupRepIdentity {
	readonly groupId: string;
	readonly repId: string;
}

interface SessionRepCorpus {
	readonly corpusRoot: string;
	readonly layoutPaths: readonly string[];
	readonly readManifest: readonly ReadManifestEntry[];
}

interface NewerRecordFields {
	readonly costUsd?: number;
	readonly dimensions?: readonly never[];
	readonly requirements?: readonly never[];
	readonly summary?: string;
	readonly grade?: { readonly grade: string; readonly verdict: string };
	readonly hardBlockers?: readonly {
		readonly id: string;
		readonly status: "PASS" | "FAIL";
	}[];
	readonly attempts?: readonly unknown[];
	readonly minimumGrade?: string;
	readonly elapsedMs?: number;
	readonly runElapsedMs?: number;
	readonly productOwnerCostUsd?: number;
	readonly productOwnerProviderCalls?: readonly {
		readonly metrics: Immutable<ClaudeCallMetrics>;
	}[];
	readonly readManifest?: readonly ReadManifestEntry[];
	readonly corpusFiles?: readonly HashedFile[];
	readonly corpusVersion?: CorpusMeasurement;
	readonly model?: string;
}

async function mergeIntoRecord(
	file: string,
	fields: NewerRecordFields,
): Promise<void> {
	const recorded: unknown = JSON.parse(await Bun.file(file).text());
	await Bun.write(
		file,
		`${JSON.stringify({ ...z.object({}).loose().parse(recorded), ...fields }, null, FIXTURE_JSON_INDENT_SPACES)}\n`,
	);
}

function serialize(record: Immutable<WrittenRecord>): string {
	return `${JSON.stringify(record, null, FIXTURE_JSON_INDENT_SPACES)}\n`;
}

export { mergeIntoRecord, serialize };
export type {
	NewerRecordFields,
	RecordedAttemptInputs,
	RunningStageMetrics,
	SessionGroupRepIdentity,
	SessionRepCorpus,
};
