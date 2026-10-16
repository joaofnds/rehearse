import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { CorpusSearch } from "./corpus-search";
import type { CorpusExperimentSource } from "./experiment-source";
import type { LineRange } from "./line-range";

const returnEditQuery = queryOptions({
	queryKey: ["corpus-edit-return"],
	queryFn: (): CorpusSearch | null => null,
	initialData: null,
	enabled: false,
	gcTime: Infinity,
});

export function CorpusSettingsLink({
	path,
	lines,
	source,
}: {
	readonly path: string | undefined;
	readonly lines: LineRange | undefined;
	readonly source: CorpusExperimentSource | undefined;
}): React.JSX.Element {
	const client = useQueryClient();

	return (
		<Link
			to="/settings"
			onClick={() => {
				client.setQueryData(returnEditQuery.queryKey, (): CorpusSearch => ({
					file: path,
					sourceRun: source?.run,
					sourceStep: source?.stage,
					start: lines?.start,
					end: lines?.end,
				}));
			}}
			className="text-accent-foreground underline decoration-deeper underline-offset-4 hover:text-pale"
		>
			Link an editable copy in Settings
		</Link>
	);
}

export function CorpusReturnLink(): React.JSX.Element | null {
	const client = useQueryClient();
	const cached = useQuery(returnEditQuery);

	return cached.data === null ? null : (
		<Link
			to="/corpus"
			search={cached.data}
			onClick={() => {
				client.setQueryData(returnEditQuery.queryKey, null);
			}}
			className="text-accent-foreground underline decoration-deeper underline-offset-4 hover:text-pale"
		>
			Return to instruction edit
		</Link>
	);
}
