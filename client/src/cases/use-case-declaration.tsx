import type { UseMutationResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { LAUNCH_CASES_QUERY_KEY } from "#client/launch/launch-dialog";
import pipelinesQuery from "#client/tasks/pipelines-query";

import {
	postDeclaration,
	postPipelineDeclaration,
} from "./case-declaration-api";
import type { Draft, DraftEdit } from "./case-declaration-draft";
import {
	EMPTY_DRAFT,
	declarationRequest,
	pipelineRequest,
} from "./case-declaration-draft";
import type { DeclareFormProps } from "./case-declaration-form";
import casesQuery from "./cases-query";

const FIRST_PIPELINE_SOURCE_INDEX = 0;

interface CaseDeclarationModel {
	readonly draft: Draft;
	readonly from: string;
	readonly sources: readonly string[];
	readonly edit: DraftEdit;
	readonly failure: string | undefined;
	readonly pending: boolean;
	readonly submit: () => void;
}

function useDeclarationDraft(
	onDeclared: DeclareFormProps["onDeclared"],
): CaseDeclarationModel {
	const cases = useQuery(casesQuery);
	const sources = (cases.data?.cases ?? [])
		.filter((listed) => listed.kind === "pipeline")
		.map(({ id }) => id);
	const [draft, setDraft] = useState(EMPTY_DRAFT);
	const from = sources.includes(draft.from)
		? draft.from
		: (sources[FIRST_PIPELINE_SOURCE_INDEX] ?? "");
	const declare = useCaseDeclaration(from, onDeclared);
	const edit: DraftEdit = (change) => {
		setDraft((current) => ({ ...current, ...change }));
	};
	return {
		draft,
		edit,
		failure: declare.error?.message,
		from,
		pending: declare.isPending,
		sources,
		submit: () => {
			declare.mutate(draft);
		},
	};
}

function useCaseDeclaration(
	from: string,
	onDeclared: DeclareFormProps["onDeclared"],
): UseMutationResult<string, Error, Draft> {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (declared: Draft) =>
			await (declared.kind === "session"
				? postDeclaration(declarationRequest(declared))
				: postPipelineDeclaration(pipelineRequest(declared, from))),
		onSuccess: async (path) => {
			onDeclared(path);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: casesQuery.queryKey }),
				queryClient.invalidateQueries({ queryKey: LAUNCH_CASES_QUERY_KEY }),
				queryClient.invalidateQueries({ queryKey: pipelinesQuery.queryKey }),
			]);
		},
	});
}

export { useDeclarationDraft as default };
export type { CaseDeclarationModel };
