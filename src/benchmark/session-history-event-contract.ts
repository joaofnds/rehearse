import type { z } from "zod";

import type { Immutable } from "./contracts";
import type { JsonValue } from "./json-value";
import type {
	HistoryEventKind,
	HistoryEventState,
	HistoryRegion,
	HistorySourceKind,
	SessionHistoryReportInput,
	TextMeasurement,
} from "./session-history-contract";
import type {
	HistoryBlockInput,
	HistoryRecord,
	ParsedRow,
	historyToolCallSchema,
	historyToolResultSchema,
} from "./session-history-message";
import type { SourceSnapshotRange } from "./session-history-snapshots";
import type { TranscriptLocation } from "./transcript";

interface SourceIdentity {
	readonly id: string;
	readonly kind: HistorySourceKind;
	readonly name: string;
	readonly path?: string | undefined;
}

interface MutableEvent {
	readonly id: string;
	readonly locator: TranscriptLocation;
	readonly region: HistoryRegion;
	readonly kind: HistoryEventKind;
	readonly state: HistoryEventState;
	readonly label: string;
	readonly timestamp: string | undefined;
	readonly toolUseId?: string | undefined;
	readonly toolName?: string | undefined;
	readonly sourceId?: string | undefined;
	readonly measurement: TextMeasurement;
	readonly relatedEventIds: readonly string[];
	readonly deliveryOrdinal?: number | undefined;
	readonly content?: string | undefined;
	readonly snapshot?: string | undefined;
	readonly snapshotMeasurement?: TextMeasurement | undefined;
	readonly snapshotRange?: SourceSnapshotRange | undefined;
	readonly source: SourceIdentity | undefined;
	readonly isDelivery: boolean;
	readonly input?: HistoryBlockInput | undefined;
}

interface ProjectionState {
	readonly events: readonly MutableEvent[];
	readonly issues: readonly string[];
}

type CommonEvent = Pick<
	MutableEvent,
	"id" | "locator" | "region" | "timestamp" | "relatedEventIds"
>;

interface HistoryContentBlock {
	readonly value: JsonValue | undefined;
	readonly row: Immutable<HistoryRecord> | undefined;
}

interface JoinIndices {
	readonly calls: ReadonlyMap<string, readonly MutableEvent[]>;
	readonly results: ReadonlyMap<string, readonly MutableEvent[]>;
	readonly deliveries: ReadonlyMap<string, readonly MutableEvent[]>;
}

interface JoinedEvent {
	readonly event: MutableEvent;
	readonly issues: readonly string[];
}

interface RowEventProjectionRequest {
	readonly input: Immutable<SessionHistoryReportInput>;
	readonly row: Immutable<ParsedRow>;
	readonly retainBodies: boolean;
}

interface HistoryRowBlock {
	readonly block: number;
	readonly value: JsonValue;
}

interface ProjectedCall {
	readonly common: Immutable<CommonEvent>;
	readonly location: Readonly<TranscriptLocation>;
	readonly call: Immutable<z.infer<typeof historyToolCallSchema>>;
}

interface ProjectedResult {
	readonly common: Immutable<CommonEvent>;
	readonly result: Immutable<z.infer<typeof historyToolResultSchema>>;
}

export type {
	ProjectionState,
	MutableEvent,
	SourceIdentity,
	CommonEvent,
	HistoryContentBlock,
	JoinIndices,
	JoinedEvent,
	RowEventProjectionRequest,
	HistoryRowBlock,
	ProjectedCall,
	ProjectedResult,
};
