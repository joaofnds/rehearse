import type { HashedFile } from "#benchmark/checkpoint";
import { corpusDifferences } from "#benchmark/checkpoint";
import type {
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";

export type ComparisonAttribution =
	| { readonly claim: "identical" }
	| {
			readonly claim: "attributable";
			readonly differingPath: string;
			readonly differingPaths: readonly [string];
	  }
	| {
			readonly claim: "refused";
			readonly differingPaths: readonly [string, string, ...string[]];
	  };

const ATTRIBUTION_WORDING = {
	modified: (path: string) => path,
	missingFromRight: (path: string) => path,
	missingFromLeft: (path: string) => path,
};

type ComparisonMode = (ComparisonReport | LegacyComparisonReport)["mode"];

/**
 * A pipeline arm's `executedCorpus` path is stage-qualified
 * (`inputs/corpus/<stage>/CLAUDE.md`, written by `frozenDirectoryFiles` walking
 * each stage's own capture directory under `inputs/corpus/`, per
 * `pipeline-confirmation.ts`). A session arm omits that stage segment
 * (`inputs/corpus/output-styles/brief.md`). Both must resolve to the original
 * corpus-layout path, so `dedupedByPath` receives the comparison mode instead
 * of guessing which segment is a stage. Keying on raw pipeline paths would
 * count one file once per stage; dropping a segment from a session path can
 * collapse distinct layout files that share a basename.
 */
export function layoutPath(path: string, mode: ComparisonMode): string {
	const segments = path.split("/");
	if (segments[0] !== "inputs" || segments[1] !== "corpus") {
		return path;
	}

	const layoutStart = mode === "session" ? 2 : 3;
	const layoutSegments = segments.slice(layoutStart);

	return layoutSegments.length === 0 ? path : layoutSegments.join("/");
}

function dedupedByPath(
	files: readonly HashedFile[],
	mode: ComparisonMode,
): HashedFile[] {
	const byPath = new Map<string, string>();
	for (const file of files) {
		const path = layoutPath(file.path, mode);
		if (!byPath.has(path)) {
			byPath.set(path, file.sha256);
		}
	}

	return [...byPath.entries()].map(([path, sha256]) => ({ path, sha256 }));
}

export function comparisonAttribution(
	left: readonly HashedFile[],
	right: readonly HashedFile[],
	mode: ComparisonMode,
): ComparisonAttribution {
	const differingPaths = corpusDifferences(
		dedupedByPath(left, mode),
		dedupedByPath(right, mode),
		ATTRIBUTION_WORDING,
	);

	const [first, second, ...rest] = differingPaths;
	if (first === undefined) {
		return { claim: "identical" };
	}
	if (second === undefined) {
		return {
			claim: "attributable",
			differingPath: first,
			// A previously loaded client reads this field before it knows the new
			// discriminator, so the additive response stays renderable during deploys.
			differingPaths: [first],
		};
	}

	return { claim: "refused", differingPaths: [first, second, ...rest] };
}
