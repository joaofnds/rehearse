import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import type { CorpusSearch } from "./corpus-search";
import type { CorpusExperimentSource } from "./experiment-source";
import type { LineRange } from "./line-range";

const returnEditQuery = queryOptions({
	enabled: false,
	gcTime: Infinity,
	initialData: null,
	queryFn: (): CorpusSearch | null => null,
	queryKey: ["corpus-edit-return"],
});

interface CorpusSettingsLinkProps {
	readonly path: string | undefined;
	readonly lines: LineRange | undefined;
	readonly source: CorpusExperimentSource | undefined;
}

function CorpusSettingsLink({
	path,
	lines,
	source,
}: CorpusSettingsLinkProps): React.JSX.Element {
	const client = useQueryClient();

	return (
		<Link
			to="/settings"
			onClick={() => {
				client.setQueryData(returnEditQuery.queryKey, (): CorpusSearch => ({
					end: lines?.end,
					file: path,
					sourceRun: source?.run,
					sourceStep: source?.stage,
					start: lines?.start,
				}));
			}}
			className="text-link underline decoration-link/60 underline-offset-4 hover:text-link-hover"
		>
			Link an editable copy in Settings
		</Link>
	);
}

function CorpusReturnLink(): React.JSX.Element | null {
	const client = useQueryClient();
	const cached = useQuery(returnEditQuery);

	return cached.data === null ? null : (
		<Link
			to="/corpus"
			search={cached.data}
			onClick={() => {
				client.setQueryData(returnEditQuery.queryKey, null);
			}}
			className="text-link underline decoration-link/60 underline-offset-4 hover:text-link-hover"
		>
			Return to instruction edit
		</Link>
	);
}

export { CorpusReturnLink, CorpusSettingsLink };
