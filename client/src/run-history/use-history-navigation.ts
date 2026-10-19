import { useNavigate } from "@tanstack/react-router";

import type { RunDiscoverySearch } from "./run-discovery";
import { useRememberRunsSearch } from "./run-discovery";

interface HistoryNavigationRequest {
	readonly invalidatedBy: string | undefined;
	readonly discovery: RunDiscoverySearch;
}

interface HistoryNavigation {
	readonly changeDiscovery: (search: RunDiscoverySearch) => void;
	readonly clearDiscovery: () => void;
}

function useHistoryNavigation({
	invalidatedBy,
	discovery,
}: HistoryNavigationRequest): HistoryNavigation {
	const navigate = useNavigate();
	useRememberRunsSearch(discovery);
	function changeDiscovery(next: RunDiscoverySearch): void {
		const leavesInvalidated =
			next.status !== undefined ||
			next.kind !== undefined ||
			next.corpus !== undefined;
		void navigate({
			replace: true,
			search: (previous: RunDiscoverySearch) => ({
				...previous,
				...next,
				invalidatedBy: leavesInvalidated ? undefined : invalidatedBy,
			}),
			to: "/",
		});
	}
	function clearDiscovery(): void {
		void navigate({ replace: true, search: {}, to: "/" });
	}
	return { changeDiscovery, clearDiscovery };
}

export { useHistoryNavigation as default };
