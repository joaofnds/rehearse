import type { UseMutationResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { corpusQuery } from "#client/corpus/corpus-query";

import type { DeclaredSteps, PutStepsProps } from "./case-steps-api";
import { putSteps, stepsQuery } from "./case-steps-api";
import type { StepDraft } from "./case-steps-draft";
import { corpusSkills, draftOf } from "./case-steps-draft";
import type { StepsFormProps } from "./case-steps-form";
import pipelinesQuery from "./pipelines-query";

interface StepEditingModel {
	readonly skillsId: string;
	readonly steps: readonly StepDraft[];
	readonly setSteps: React.Dispatch<React.SetStateAction<readonly StepDraft[]>>;
	readonly save: UseMutationResult<DeclaredSteps, Error, PutStepsProps>;
	readonly skills: readonly string[];
}

function useStepEditing(
	declared: DeclaredSteps,
	onSaved: StepsFormProps["onSaved"],
): StepEditingModel {
	const queryClient = useQueryClient();
	const corpus = useQuery(corpusQuery);
	const skillsId = useId();
	const [steps, setSteps] = useState<readonly StepDraft[]>(() =>
		declared.stages.map(draftOf),
	);
	const save = useMutation({
		mutationFn: putSteps,
		onSuccess: async () => {
			onSaved();
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: pipelinesQuery.queryKey }),
				queryClient.invalidateQueries({
					queryKey: stepsQuery(declared.caseId).queryKey,
				}),
			]);
		},
	});
	const skills = corpusSkills(corpus.data?.files.map(({ path }) => path) ?? []);

	return { save, setSteps, skills, skillsId, steps };
}

export { useStepEditing as default };
