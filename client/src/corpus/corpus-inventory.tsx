import { RotateCcw } from "lucide-react";
import { useState } from "react";

import EmptyState from "#client/system/components/empty-state";
import Notice from "#client/system/components/notice";
import TableShell from "#client/system/components/table-shell";
import { Button } from "#client/system/ui/button";
import SearchInput from "#client/system/ui/search-input";

import type { CorpusFile } from "./corpus-inventory-rows";
import { COLUMNS, rowFor } from "./corpus-inventory-rows";
import type { CorpusResponse } from "./corpus-query";

const EMPTY_COLLECTION_LENGTH = 0;

interface CorpusInventoryProps {
	readonly sourcePath: string | undefined;
	readonly report: CorpusResponse | undefined;
	readonly isLoading: boolean;
	readonly isError: boolean;
	readonly onEdit: ((path: string) => void) | undefined;
	readonly onView: (path: string, returnFocus: () => void) => void;
}

function CorpusInventory({
	report,
	isLoading,
	isError,
	onEdit,
	onView,
	sourcePath,
}: CorpusInventoryProps): React.JSX.Element {
	const [search, setSearch] = useState("");
	const files = searchedCorpusFiles(report?.files ?? [], search, sourcePath);

	return (
		<>
			<CorpusInventoryStatus
				report={report}
				isLoading={isLoading}
				isError={isError}
			/>
			{report !== undefined && report.files.length > EMPTY_COLLECTION_LENGTH ? (
				<CorpusFileSearch
					search={search}
					setSearch={setSearch}
					shown={files.length}
					total={report.files.length}
				/>
			) : null}
			{report !== undefined &&
			report.files.length > EMPTY_COLLECTION_LENGTH &&
			files.length === EMPTY_COLLECTION_LENGTH ? (
				<p className="text-14 text-muted-foreground">
					No corpus files match. Clear search to show all files.
				</p>
			) : null}
			{report !== undefined && report.files.length > EMPTY_COLLECTION_LENGTH ? (
				<CorpusCountMeanings />
			) : null}
			{report !== undefined && files.length > EMPTY_COLLECTION_LENGTH ? (
				<CorpusInventoryTable
					files={files}
					lastEdit={report.lastEdit}
					onEdit={onEdit}
					onView={onView}
				/>
			) : null}
		</>
	);
}

interface CorpusFileSearchProps {
	readonly search: string;
	readonly setSearch: (search: string) => void;
	readonly shown: number;
	readonly total: number;
}

function CorpusFileSearch({
	search,
	setSearch,
	shown,
	total,
}: CorpusFileSearchProps): React.JSX.Element {
	return (
		<div className="flex flex-wrap items-center gap-3">
			<label className="min-w-0 w-full flex-none sm:w-auto sm:flex-1">
				<SearchInput
					aria-label="Search corpus files"
					placeholder="File path or hash"
					value={search}
					onChange={(event) => {
						setSearch(event.target.value);
					}}
				/>
			</label>
			<Button
				variant="outline"
				onClick={() => {
					setSearch("");
				}}
			>
				<RotateCcw aria-hidden="true" className="size-4" />
				Clear search
			</Button>
			<span
				role="status"
				className="text-12 text-dim"
			>{`${shown} of ${total} files shown`}</span>
		</div>
	);
}

function CorpusCountMeanings(): React.JSX.Element {
	return (
		<details className="rounded-md border border-divider bg-card px-4 py-3 text-14">
			<summary className="cursor-pointer font-medium">
				What do Read by and prior-version counts mean?
			</summary>
			<dl className="mt-3 grid gap-3">
				<div>
					<dt className="font-medium">Read by</dt>
					<dd className="text-muted-foreground">
						Distinct run-history rows whose records include this path in their
						captured corpus files or additional recorded corpus reads. This
						includes declared capture; the count does not establish that a model
						used the instruction. Unreadable records are excluded.
					</dd>
				</div>
				<div>
					<dt className="font-medium">Prior-version results</dt>
					<dd className="text-muted-foreground">
						Rows that recorded this file’s hash from the previous corpus version
						when that hash differs from the current file. These rows can include
						results already stale before the last edit. The last-edit card
						counts only results newly made stale by the whole edit. Counts are
						unavailable without a measured prior version.
					</dd>
				</div>
			</dl>
		</details>
	);
}

interface CorpusInventoryStatusProps {
	readonly report: CorpusResponse | undefined;
	readonly isLoading: boolean;
	readonly isError: boolean;
}

function CorpusInventoryStatus({
	report,
	isLoading,
	isError,
}: CorpusInventoryStatusProps): React.JSX.Element {
	return (
		<>
			{isLoading ? <p className="text-muted-foreground">Loading…</p> : null}
			{isError ? (
				<p role="alert" className="text-attention">
					<span aria-hidden="true">⚠ </span>
					Could not load the corpus.
				</p>
			) : null}
			{report !== undefined &&
			report.refusals.length > EMPTY_COLLECTION_LENGTH ? (
				<Notice
					message="These entries could not be hashed, so they are missing from the table, and a refused layout directory is missing from it whole:"
					items={report.refusals}
				/>
			) : null}
			{report !== undefined &&
			report.files.length === EMPTY_COLLECTION_LENGTH &&
			report.refusals.length === EMPTY_COLLECTION_LENGTH ? (
				<EmptyState heading="No corpus files found">
					<p>
						The corpus root holds no files in corpus layout. Add a CLAUDE.md, a
						skill, an output style, or an agent definition under it, then reload
						this screen.
					</p>
				</EmptyState>
			) : null}
		</>
	);
}

interface CorpusInventoryTableProps {
	readonly files: readonly CorpusFile[];
	readonly lastEdit: CorpusResponse["lastEdit"];
	readonly onEdit: CorpusInventoryProps["onEdit"];
	readonly onView: CorpusInventoryProps["onView"];
}

function CorpusInventoryTable({
	files,
	lastEdit,
	onEdit,
	onView,
}: CorpusInventoryTableProps): React.JSX.Element {
	return (
		<TableShell
			caption="Corpus files"
			className="min-w-240 table-fixed"
			columnClasses={["w-96", "w-40", "w-44", "w-24", "w-40", "w-24"]}
			columns={onEdit === undefined ? [...COLUMNS] : [...COLUMNS, "Edit"]}
			numeric={["Read by", "Prior-version results"]}
			rows={files.map((file) => rowFor(file, lastEdit, { onEdit, onView }))}
		/>
	);
}

function searchedCorpusFiles(
	entries: readonly CorpusFile[],
	search: string,
	sourcePath: string | undefined,
): readonly CorpusFile[] {
	const needle = search.trim().toLowerCase();
	const files = entries
		.filter((file) =>
			[file.path, file.sha256].some((text) =>
				text.toLowerCase().includes(needle),
			),
		)
		.toSorted(
			(left, right) =>
				Number(right.path === sourcePath) - Number(left.path === sourcePath),
		);
	return files;
}

export { CorpusInventory as default };
