import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { EventFilter } from "./evidence-discovery";
import type {
	EvidenceView,
	InvestigationControls,
	InvestigationSelection,
	SourceSort,
} from "./history-investigation-contract";

function useInvestigationSelection(
	path: string,
	initialEventId: string | undefined,
): InvestigationControls {
	const cached = useQuery({
		enabled: false,
		gcTime: Infinity,
		initialData: null,
		queryFn: (): InvestigationSelection | null => null,
		queryKey: ["session-history-selection", path],
	});
	const savedSelection = initialEventId === undefined ? cached.data : null;
	const active = useActiveInvestigation(savedSelection, initialEventId);
	const filters = useInvestigationFilters(
		cached.data,
		savedSelection,
		initialEventId,
	);
	const controls = { ...active, ...filters };
	useRememberInvestigation(path, controls);
	return controls;
}

function selectEvidenceEvent(
	controls: InvestigationControls,
	id: string,
): void {
	controls.setSelectedEventId(id);
	controls.setSelectedRequestId(undefined);
}

type ActiveInvestigationControls = Pick<
	InvestigationControls,
	| "sourceId"
	| "setSourceId"
	| "selectedEventId"
	| "setSelectedEventId"
	| "selectedRequestId"
	| "setSelectedRequestId"
	| "view"
	| "setView"
>;

type InvestigationFilterControls = Pick<
	InvestigationControls,
	| "sourceSort"
	| "setSourceSort"
	| "sourceQuery"
	| "setSourceQuery"
	| "eventQuery"
	| "setEventQuery"
	| "eventFilter"
	| "setEventFilter"
>;

function useActiveInvestigation(
	savedSelection: InvestigationSelection | null,
	initialEventId: string | undefined,
): ActiveInvestigationControls {
	const [sourceId, setSourceId] = useState<string | undefined>(
		savedSelection?.sourceId,
	);
	const [selectedEventId, setSelectedEventId] = useState<string | undefined>(
		initialEventId ?? savedSelection?.eventId,
	);
	const [selectedRequestId, setSelectedRequestId] = useState<
		string | undefined
	>(savedSelection?.requestId);
	const [view, setView] = useState<EvidenceView>(
		savedSelection?.view ?? "Evidence",
	);
	return {
		selectedEventId,
		selectedRequestId,
		setSelectedEventId,
		setSelectedRequestId,
		setSourceId,
		setView,
		sourceId,
		view,
	};
}

function useInvestigationFilters(
	cached: InvestigationSelection | null,
	savedSelection: InvestigationSelection | null,
	initialEventId: string | undefined,
): InvestigationFilterControls {
	const [sourceSort, setSourceSort] = useState<SourceSort>(
		cached?.sourceSort ?? "Delivered size",
	);
	const [sourceQuery, setSourceQuery] = useState(
		savedSelection?.sourceQuery ?? "",
	);
	const [eventQuery, setEventQuery] = useState(
		savedSelection?.eventQuery ?? "",
	);
	const [eventFilter, setEventFilter] = useState<EventFilter>(
		savedSelection?.eventFilter ??
			(initialEventId === undefined ? "Activity" : "All records"),
	);
	return {
		eventFilter,
		eventQuery,
		setEventFilter,
		setEventQuery,
		setSourceQuery,
		setSourceSort,
		sourceQuery,
		sourceSort,
	};
}

function useRememberInvestigation(
	path: string,
	controls: InvestigationControls,
): void {
	const queryClient = useQueryClient();
	const {
		sourceId,
		selectedEventId,
		selectedRequestId,
		view,
		sourceSort,
		sourceQuery,
		eventQuery,
		eventFilter,
	} = controls;
	useEffect(() => {
		queryClient.setQueryData<InvestigationSelection>(
			["session-history-selection", path],
			{
				eventFilter,
				eventId: selectedEventId,
				eventQuery,
				requestId: selectedRequestId,
				sourceId,
				sourceQuery,
				sourceSort,
				view,
			},
		);
	}, [
		queryClient,
		path,
		sourceId,
		selectedEventId,
		selectedRequestId,
		sourceSort,
		view,
		sourceQuery,
		eventQuery,
		eventFilter,
	]);
}

export { selectEvidenceEvent, useInvestigationSelection };
