import type { UseQueryResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { LaunchAttempts } from "#benchmark/launch-attempts";
import { runHistoryQuery } from "#client/run-history/run-history-query";

import type { StartedGroups } from "./launch-budget";
import { holdsUnstoredCeiling, startedGroupsOf } from "./launch-budget";
import { LAUNCH_CASES_QUERY_KEY, fetchCases } from "./launch-case-list";
import { launchRequest, openingChoice } from "./launch-request";
import type {
	CaseListing,
	CasesResponse,
	SettledTarget,
} from "./launch-target-contract";
import { postLaunch } from "./post-launch";
import type { SettingsReading } from "./settings-query";
import { launchSettingsQuery } from "./settings-query";

interface LaunchInputs {
	readonly attempts: LaunchAttempts;
	readonly setAttempts: (attempts: LaunchAttempts) => void;
	readonly setPickedCase: (caseId: string) => void;
	readonly ceilingDraft: string | undefined;
	readonly setCeilingDraft: (draft?: string) => void;
	readonly settings: Readonly<
		Pick<UseQueryResult<SettingsReading>, "data" | "isPending" | "isError">
	>;
	readonly cases: Readonly<Pick<UseQueryResult<CasesResponse>, "data">>;
	readonly availableCases: readonly CaseListing[];
	readonly caseId: string | undefined;
	readonly casesFailure: string | undefined;
	readonly settingsFailure: string | undefined;
}

function useLaunchInputs(target: SettledTarget): LaunchInputs {
	const opening = openingChoice(target);
	const [attempts, setAttempts] = useState(opening.attempts);
	const [pickedCase, setPickedCase] = useState(opening.caseId);
	const [ceilingDraft, setCeilingDraft] = useState<string>();
	const settings = useQuery(launchSettingsQuery);
	const cases = useQuery({
		enabled: target.kind === "case",
		queryFn: fetchCases,
		queryKey: LAUNCH_CASES_QUERY_KEY,
	});
	const availableCases = cases.data?.cases ?? [];
	const caseId =
		pickedCase ?? availableCases.find((listed) => listed.model !== null)?.id;
	return {
		attempts,
		availableCases,
		caseId,
		cases,
		casesFailure: cases.error?.message,
		ceilingDraft,
		setAttempts,
		setCeilingDraft,
		setPickedCase,
		settings,
		settingsFailure: settings.error?.message,
	};
}

interface LaunchFormModel extends LaunchInputs {
	readonly started: StartedGroups;
	readonly ceilingUsd: number | undefined;
	readonly startable: boolean;
	readonly start: () => void;
	readonly launchFailure: string | undefined;
}

function useLaunchForm(
	target: SettledTarget,
	onLaunched: () => void,
): LaunchFormModel {
	const queryClient = useQueryClient();
	const inputs = useLaunchInputs(target);
	const { attempts, caseId, settings, ceilingDraft } = inputs;
	const launch = useMutation({
		mutationFn: postLaunch,
		onSuccess: async () => {
			onLaunched();
			await queryClient.invalidateQueries({
				queryKey: runHistoryQuery.queryKey,
			});
		},
	});

	const request = launchRequest(target, caseId, attempts);
	const started = startedGroupsOf(target, attempts);
	const ceilingUsd = settings.data?.spendCeilingUsd ?? undefined;
	const startable =
		ceilingUsd !== undefined &&
		!holdsUnstoredCeiling(ceilingDraft, ceilingUsd) &&
		request !== undefined &&
		!launch.isPending;
	return {
		...inputs,
		ceilingUsd,
		launchFailure: launch.error?.message,
		start: () => {
			if (request !== undefined) {
				launch.mutate(request);
			}
		},
		startable,
		started,
	};
}

export { useLaunchForm as default };
export type { LaunchFormModel };
