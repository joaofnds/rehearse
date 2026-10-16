import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { CorpusExperimentSource } from "./experiment-source";

interface CorpusDraft {
	readonly text: string;
	readonly version: string;
}

interface CorpusDraftState {
	readonly draft: CorpusDraft | null;
	readonly recovered: boolean;
	readonly save: (text: string, version: string) => void;
	readonly discard: () => void;
}

type CorpusDraftIdentity = readonly [
	"corpus-draft",
	string,
	string,
	string | null,
	string | null,
];

/** Shared by the retained draft and the editor that owns its local state. */
export function corpusDraftIdentity(
	root: string,
	path: string,
	source: CorpusExperimentSource | undefined,
): CorpusDraftIdentity {
	return [
		"corpus-draft",
		root,
		path,
		source?.run ?? null,
		source?.stage ?? null,
	];
}

/** Unapplied text stays in app memory, scoped to the linked tree, file and source. */
export function useCorpusDraft(
	root: string,
	path: string,
	source: CorpusExperimentSource | undefined,
): CorpusDraftState {
	const client = useQueryClient();
	const options = queryOptions({
		queryKey: corpusDraftIdentity(root, path, source),
		queryFn: (): CorpusDraft | null => null,
		initialData: null,
		enabled: false,
		// Drafts have no server fetch and must outlive the editor's observer.
		gcTime: Infinity,
	});
	const retainedDraft = useQuery(options);
	const recovered = useRef(retainedDraft.data !== null);
	const [draft, setDraft] = useState(retainedDraft.data);

	return {
		draft,
		recovered: recovered.current,
		save: (text, version) => {
			setDraft({ text, version });
			client.setQueryData(options.queryKey, () => ({ text, version }));
		},
		discard: () => {
			setDraft(null);
			client.setQueryData(options.queryKey, null);
		},
	};
}
