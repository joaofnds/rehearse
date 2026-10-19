import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { runRecordQuery } from "#client/monitor/run-record-query";

import type {
	CorpusExperimentSource,
	SourceEvidence,
} from "./experiment-source-evidence";
import sourceEvidence from "./experiment-source-evidence";

interface ExperimentSourceState {
	readonly activeSource: CorpusExperimentSource | undefined;
	readonly sourcePath: string | undefined;
	readonly evidence: SourceEvidence | undefined;
	readonly visibleEvidence: SourceEvidence | undefined;
	readonly clearSource: () => void;
	readonly selectedFile: (path: string) => void;
}

/** Ties a saved source to the file that opened it; switching files clears it. */
function useExperimentSource(
	openedPath: string | undefined,
	source: CorpusExperimentSource | undefined,
	editPath: string | undefined,
): ExperimentSourceState {
	const { bound, setBound } = useBoundSource(openedPath, source);
	const activeSource =
		bound !== undefined && (editPath === undefined || editPath === bound.path)
			? bound.source
			: undefined;
	const record = useQuery({
		...runRecordQuery(activeSource?.run ?? ""),
		enabled: activeSource !== undefined,
	});
	const evidence =
		activeSource !== undefined && record.isSuccess && bound !== undefined
			? sourceEvidence(record.data, activeSource, bound.path)
			: undefined;
	const visibleEvidence: SourceEvidence | undefined = record.isError
		? {
				checkpoint: "not recorded",
				corpus: "not recorded",
				reason: `Could not read the saved run: ${record.error.message}`,
				replayable: false,
			}
		: evidence;

	return {
		activeSource,
		clearSource: () => {
			setBound(undefined);
		},
		evidence,
		selectedFile: (path) => {
			if (path !== bound?.path) {
				setBound(undefined);
			}
		},
		sourcePath: bound?.path,
		visibleEvidence,
	};
}

interface BoundSource {
	readonly path: string;
	readonly source: CorpusExperimentSource;
}

interface BoundSourceState {
	readonly bound: BoundSource | undefined;
	readonly setBound: (bound: BoundSource | undefined) => void;
}

function useBoundSource(
	openedPath: string | undefined,
	source: CorpusExperimentSource | undefined,
): BoundSourceState {
	const [bound, setBound] = useState<
		| { readonly path: string; readonly source: CorpusExperimentSource }
		| undefined
	>(
		source === undefined || openedPath === undefined
			? undefined
			: { path: openedPath, source },
	);
	useEffect(() => {
		setBound(
			source === undefined || openedPath === undefined
				? undefined
				: { path: openedPath, source },
		);
	}, [openedPath, source?.run, source?.stage]);
	return { bound, setBound };
}

export { useExperimentSource as default };
export type { ExperimentSourceState };
