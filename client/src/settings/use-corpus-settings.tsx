import type { UseMutationResult } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { corpusQuery } from "#client/corpus/corpus-query";
import type { SettingsReading } from "#client/launch/settings-query";
import { launchSettingsQuery } from "#client/launch/settings-query";
import { runHistoryQuery } from "#client/run-history/run-history-query";

import {
	linkCorpusDirectory,
	rehashCorpus,
	unlinkCorpusDirectory,
} from "./settings-requests";

type Outcome =
	| { readonly kind: "none" }
	| { readonly kind: "rehashed"; readonly label: string }
	| { readonly kind: "refused"; readonly reason: string };

interface CorpusSettingsModel {
	readonly directory: string;
	readonly setDirectory: (directory: string) => void;
	readonly outcome: Outcome;
	readonly writing: boolean;
	readonly link: UseMutationResult<SettingsReading, Error, string>;
	readonly unlink: UseMutationResult<SettingsReading, Error, void>;
	readonly rehash: UseMutationResult<string, Error, void>;
}

function useCorpusSettings(): CorpusSettingsModel {
	const [directory, setDirectory] = useState("");
	const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });

	const showLinkedCorpus = useLinkedCorpusCache(setOutcome);

	function refused(error: Readonly<Error>): void {
		setOutcome({ kind: "refused", reason: error.message });
	}

	const link = useMutation({
		mutationFn: linkCorpusDirectory,
		onError: refused,
		onSuccess: async (reading) => {
			setDirectory("");
			await showLinkedCorpus(reading);
		},
	});
	const unlink = useMutation({
		mutationFn: unlinkCorpusDirectory,
		onError: refused,
		onSuccess: showLinkedCorpus,
	});
	const rehash = useCorpusRehash(setOutcome);
	const writing = link.isPending || unlink.isPending || rehash.isPending;

	return { directory, link, outcome, rehash, setDirectory, unlink, writing };
}

function useCorpusRehash(
	setOutcome: (outcome: Outcome) => void,
): UseMutationResult<string, Error, void> {
	const queryClient = useQueryClient();
	const rehash = useMutation({
		mutationFn: rehashCorpus,
		onError: (error) => {
			setOutcome({ kind: "refused", reason: error.message });
		},
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey: corpusQuery.queryKey });
		},
		onSuccess: (label) => {
			setOutcome({ kind: "rehashed", label });
		},
	});
	return rehash;
}

function useLinkedCorpusCache(
	setOutcome: (outcome: Outcome) => void,
): (reading: SettingsReading) => Promise<void> {
	const queryClient = useQueryClient();
	/** The run history reads each run's staleness against the linked corpus. */
	async function showLinkedCorpus(reading: SettingsReading): Promise<void> {
		queryClient.setQueryData(launchSettingsQuery.queryKey, reading);
		setOutcome({ kind: "none" });
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: corpusQuery.queryKey }),
			queryClient.invalidateQueries({ queryKey: runHistoryQuery.queryKey }),
		]);
	}

	return showLinkedCorpus;
}

export { useCorpusSettings as default };
export type { Outcome };
