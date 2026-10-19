import type { UseMutationResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import type { CorpusResponse } from "#client/corpus/corpus-query";
import { corpusQuery } from "#client/corpus/corpus-query";
import type { SettingsReading } from "#client/launch/settings-query";
import {
	SettingsRefusedError,
	launchSettingsQuery,
} from "#client/launch/settings-query";
import {
	enteredCeilingUsd,
	putSpendCeiling,
} from "#client/launch/spend-ceiling-entry";

import { isSatisfied } from "./setup-corpus";
import linkSetupCorpus from "./setup-requests";

function useSetupScan(
	setScanned: (report: CorpusResponse | undefined) => void,
): UseMutationResult<CorpusResponse, Error, string> {
	const queryClient = useQueryClient();
	const scan = useMutation({
		mutationFn: async (path: string): Promise<CorpusResponse> => {
			const reading = await linkSetupCorpus(path);
			await queryClient.cancelQueries(launchSettingsQuery);
			queryClient.setQueryData(launchSettingsQuery.queryKey, reading);
			// A read already in flight began before the link changed.
			await queryClient.cancelQueries(corpusQuery);

			return await queryClient.query({ ...corpusQuery, staleTime: 0 });
		},
		onError: (error) => {
			// A refused link leaves the earlier one stored, still listed.
			if (!(error instanceof SettingsRefusedError)) {
				setScanned(undefined);
			}
		},
		onSuccess: setScanned,
	});
	return scan;
}

function useSetupFinish(): UseMutationResult<SettingsReading, Error, number> {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const finish = useMutation({
		mutationFn: putSpendCeiling,
		onSuccess: async (reading) => {
			await queryClient.cancelQueries(launchSettingsQuery);
			await navigate({ to: "/" });
			queryClient.setQueryData(launchSettingsQuery.queryKey, reading);
		},
	});
	return finish;
}

interface SetupProgress {
	readonly limit: string;
	readonly setLimit: (limit: string) => void;
	readonly directory: string;
	readonly setDirectory: (directory: string) => void;
	readonly scanned: CorpusResponse | undefined;
	readonly declaredPath: string | undefined;
	readonly setDeclaredPath: (path: string) => void;
	readonly usd: number | undefined;
	readonly limitEntered: boolean;
	readonly linked: boolean;
	readonly livePlaceholder: string;
	readonly scanning: boolean;
	readonly pending: boolean;
	readonly scanFailure: string | undefined;
	readonly finishFailure: string | undefined;
	readonly settingsFailure: string | undefined;
	readonly onScan: () => void;
	readonly onFinish: (usd: number) => void;
}

function useSetupProgress(): SetupProgress {
	const settings = useQuery(launchSettingsQuery);
	const [limit, setLimit] = useState("");
	const [directory, setDirectory] = useState("");
	const [scanned, setScanned] = useState<CorpusResponse>();
	const [declaredPath, setDeclaredPath] = useState<string>();
	const scan = useSetupScan(setScanned);
	const finish = useSetupFinish();
	const usd = enteredCeilingUsd(limit);
	const linked = isSatisfied(scanned);

	return {
		declaredPath,
		directory,
		finishFailure: finish.error?.message,
		limit,
		limitEntered: usd !== undefined,
		linked,
		livePlaceholder: settings.data?.liveCorpusRoot ?? "",
		onFinish: (value) => {
			finish.mutate(value);
		},
		onScan: () => {
			scan.mutate(directory);
		},
		pending: finish.isPending,
		scanFailure: scan.error?.message,
		scanned,
		scanning: scan.isPending || finish.isPending,
		setDeclaredPath,
		setDirectory,
		setLimit,
		settingsFailure: settings.error?.message,
		usd,
	};
}

export { useSetupProgress as default };
