import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { RUN_RECORDS_KEY } from "#client/monitor/run-record-query";

import type { CorpusDraft } from "./corpus-draft";
import { useCorpusDraft } from "./corpus-draft";
import type { CorpusEditorProps } from "./corpus-edit";
import type {
	AppliedCorpusEdit,
	ApplyCorpusEditProps,
	CorpusEditReview,
	OpenedCorpusFile,
	ReviewCorpusEditProps,
} from "./corpus-edit-requests";
import {
	applyCorpusEdit,
	corpusEditingFile,
	reviewCorpusEdit,
} from "./corpus-edit-requests";
import { corpusQuery } from "./corpus-query";
import type { CorpusExperimentSource } from "./experiment-source";

interface Reviewed {
	readonly text: string;
	readonly review: CorpusEditReview;
}

interface CorpusEditMutations {
	readonly review: UseMutationResult<
		CorpusEditReview,
		Error,
		ReviewCorpusEditProps
	>;
	readonly apply: UseMutationResult<
		AppliedCorpusEdit,
		Error,
		ApplyCorpusEditProps
	>;
}

function useCorpusEditMutations(
	reopen: () => void,
	discardDraft: () => void,
	onApplied: CorpusEditorProps["onApplied"],
): CorpusEditMutations {
	const queryClient = useQueryClient();
	const review = useMutation({
		mutationFn: reviewCorpusEdit,
		onError: reopen,
	});
	const apply = useMutation({
		mutationFn: applyCorpusEdit,
		onError: reopen,
		onSuccess: async (applied) => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: corpusQuery.queryKey }),
				// Each run record judges its reads against the corpus the edit changed.
				queryClient.invalidateQueries({ queryKey: RUN_RECORDS_KEY }),
			]);
			discardDraft();
			onApplied(applied);
		},
	});
	return { apply, review };
}

interface CorpusEditingInput {
	readonly path: string;
	readonly root: string;
	readonly source: CorpusExperimentSource | undefined;
	readonly onApplied: CorpusEditorProps["onApplied"];
	readonly onDiscard: () => void;
}

interface CorpusEditingActions {
	readonly review: Pick<
		CorpusEditMutations["review"],
		"mutate" | "isPending" | "reset"
	>;
	readonly apply: Pick<
		CorpusEditMutations["apply"],
		"mutate" | "isPending" | "reset"
	>;
	readonly reviewFailure: string | undefined;
	readonly applyFailure: string | undefined;

	readonly draft: CorpusDraft | null;
	readonly recovered: boolean;
	readonly text: string;
	readonly current: CorpusEditReview | undefined;
	readonly saveDraft: (text: string, version: string) => void;
	readonly discardDraft: () => void;
	readonly setReviewed: (reviewed: Reviewed | undefined) => void;
	readonly onDiscard: () => void;
}

interface CorpusEditingModel extends CorpusEditingActions {
	readonly file: UseQueryResult<OpenedCorpusFile>;
}

function useCorpusEditing({
	path,
	root,
	source,
	onApplied,
	onDiscard,
}: CorpusEditingInput): CorpusEditingModel {
	const file = useQuery(corpusEditingFile(root, path));
	const {
		draft,
		save: saveDraft,
		discard: discardDraft,
		recovered,
	} = useCorpusDraft(root, path, source);

	const [reviewed, setReviewed] = useState<Reviewed>();
	/**
	 * A refusal can mean the file changed since it was opened, so it is read
	 * again, the diff shows the edit against what the directory now holds, and
	 * the edit waits for a new review.
	 */
	const reopen = (): void => {
		setReviewed(undefined);
		void file.refetch();
	};
	const { review, apply } = useCorpusEditMutations(
		reopen,
		discardDraft,
		onApplied,
	);
	const text = draft?.text ?? file.data?.text ?? "";
	const current = reviewed?.text === text ? reviewed.review : undefined;

	return {
		apply,
		applyFailure: apply.error?.message,
		current,
		discardDraft,
		draft,
		file,
		onDiscard,
		recovered,
		review,
		reviewFailure: review.error?.message,
		saveDraft,
		setReviewed,
		text,
	};
}

export { useCorpusEditing as default };
export type { CorpusEditingActions, CorpusEditingModel };
