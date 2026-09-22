import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";
import { EmptyState } from "#client/system/components/empty-state";
import { PlannedFeatureBlock } from "#client/system/components/planned-feature-block";
import { TableShell } from "#client/system/components/table-shell";
import "./corpus-page.css";

type CorpusResponse = InferResponseType<typeof apiClient.api.corpus.$get>;
type CorpusFile = CorpusResponse["files"][number];

const COLUMNS = ["Path", "Hash", "Last edited", "Read by"] as const;

async function fetchCorpusReport(): Promise<CorpusResponse> {
	const response = await apiClient.api.corpus.$get();

	return response.json();
}

function rowFor(file: CorpusFile): readonly React.ReactNode[] {
	return [
		file.path,
		file.sha256.slice(0, 12),
		new Date(file.lastEditedAt).toLocaleString(),
		file.readBy,
	];
}

export function CorpusPage(): React.JSX.Element {
	const query = useQuery({
		queryKey: ["corpus"],
		queryFn: fetchCorpusReport,
	});

	return (
		<div className="rh-corpus">
			<h1>Instruction corpus</h1>

			{query.isLoading ? <p>Loading…</p> : null}
			{query.isError ? <p role="alert">Could not load the corpus.</p> : null}

			{query.isSuccess ? (
				<p className="rh-corpus__root">
					<span>{query.data.root}</span>
					{query.data.refusals.length > 0 ? null : (
						<>
							<span> · </span>
							<span>{`corpus root@${query.data.digest}`}</span>
						</>
					)}
				</p>
			) : null}

			{query.isSuccess && query.data.refusals.length > 0 ? (
				<div className="rh-corpus__refusals" role="alert">
					<p>
						These entries could not be hashed, so they are missing from the
						table, and a refused layout directory is missing from it whole:
					</p>
					<ul>
						{query.data.refusals.map((refusal) => (
							<li key={refusal}>{refusal}</li>
						))}
					</ul>
				</div>
			) : null}

			{query.isSuccess &&
			query.data.files.length === 0 &&
			query.data.refusals.length === 0 ? (
				<EmptyState heading="No corpus files found">
					<p>
						The corpus root holds no files in corpus layout. Add a CLAUDE.md, a
						skill, an output style, or an agent definition under it, then reload
						this screen.
					</p>
				</EmptyState>
			) : null}

			{query.isSuccess && query.data.files.length > 0 ? (
				<TableShell
					caption="CORPUS FILES"
					columns={[...COLUMNS]}
					rows={query.data.files.map((file) => rowFor(file))}
				/>
			) : null}

			<PlannedFeatureBlock heading="Edit an instruction, review, then apply">
				<p>Writes a new corpus version, keeps the old one addressable</p>
			</PlannedFeatureBlock>
		</div>
	);
}
