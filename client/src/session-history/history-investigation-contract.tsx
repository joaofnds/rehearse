import type { UseQueryResult } from "@tanstack/react-query";

import type {
	SessionHistoryDetail,
	SessionHistoryEvent,
	SessionHistoryReport,
	SessionHistoryRequestEntry,
} from "#benchmark/session-history";

import type { EventFilter } from "./evidence-discovery";
import type { StageCorpusResponse } from "./history-evidence-queries";
import type { RecordNames } from "./history-record-names";
import type { RequestSeriesResponse } from "./history-report-query";

type SessionHistoryIdentity =
	| {
			readonly kind: "standalone";
			readonly caseId: string;
			readonly uuid: string;
	  }
	| {
			readonly kind: "confirmation";
			readonly groupId: string;
			readonly repId: string;
	  }
	| {
			readonly kind: "stage";
			readonly run: string;
			readonly stage: string;
	  }
	| {
			readonly kind: "replay";
			readonly lineage: string;
			readonly timestamp: string;
	  };

type SourceSort = "Delivered size" | "Most repeated";

const EVIDENCE_VIEWS = ["Evidence", "Requests", "Agents"] as const;

type EvidenceView = (typeof EVIDENCE_VIEWS)[number];

interface InvestigationSelection {
	readonly sourceId: string | undefined;
	readonly eventId: string | undefined;
	readonly requestId: string | undefined;
	readonly sourceSort: SourceSort;
	readonly view: EvidenceView;
	readonly sourceQuery: string;
	readonly eventQuery: string;
	readonly eventFilter: EventFilter;
}

interface InvestigationControls {
	readonly sourceId: string | undefined;
	readonly setSourceId: (value: string | undefined) => void;
	readonly selectedEventId: string | undefined;
	readonly setSelectedEventId: (value: string | undefined) => void;
	readonly selectedRequestId: string | undefined;
	readonly setSelectedRequestId: (value: string | undefined) => void;
	readonly view: InvestigationSelection["view"];
	readonly setView: (value: InvestigationSelection["view"]) => void;
	readonly sourceSort: SourceSort;
	readonly setSourceSort: (value: SourceSort) => void;
	readonly sourceQuery: string;
	readonly setSourceQuery: (value: string) => void;
	readonly eventQuery: string;
	readonly setEventQuery: (value: string) => void;
	readonly eventFilter: EventFilter;
	readonly setEventFilter: (value: EventFilter) => void;
}

interface HistoryReads {
	readonly summary: HistoryQueryReading<SessionHistoryReport>;
	readonly names: RecordNames;
	readonly recordsRequestSeries: boolean;
	readonly servesEventDetail: boolean;
	readonly stageCorpus: HistoryQueryReading<StageCorpusResponse>;
	readonly requests: HistoryQueryReading<RequestSeriesResponse>;
}

type HistoryQueryReading<Value> = Readonly<
	Pick<UseQueryResult<Value>, "data" | "isLoading" | "isError">
>;

interface SelectedEvidence {
	readonly events: readonly SessionHistoryEvent[];
	readonly activeEventId: string | undefined;
	readonly detail: HistoryQueryReading<SessionHistoryDetail>;
	readonly timelineEntries: readonly SessionHistoryRequestEntry[];
	readonly selectedRequestRow: string | undefined;
	readonly visibleEntries: readonly SessionHistoryRequestEntry[];
}

export { EVIDENCE_VIEWS as default };
export type {
	EvidenceView,
	HistoryReads,
	InvestigationControls,
	InvestigationSelection,
	SelectedEvidence,
	SessionHistoryIdentity,
	SourceSort,
};
