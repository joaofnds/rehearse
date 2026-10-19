import { RotateCcw } from "lucide-react";

import { Button } from "#client/system/ui/button";
import NativeSelect from "#client/system/ui/native-select";
import SearchInput from "#client/system/ui/search-input";

import type { RunDiscoverySearch } from "./run-discovery";

const SORT_OPTIONS = [
	["newest", "Newest first"],
	["oldest", "Oldest first"],
	["cost", "Highest cost"],
	["case", "Case A–Z"],
] as const;

interface SearchAndSortProps {
	readonly discovery: RunDiscoverySearch;
	readonly onChange: (search: RunDiscoverySearch) => void;
	readonly onClear: () => void;
}

function SearchAndSort({
	discovery,
	onChange,
	onClear,
}: SearchAndSortProps): React.JSX.Element {
	return (
		<div className="flex flex-wrap items-center gap-3">
			<label className="min-w-0 w-full flex-none sm:w-auto sm:flex-1">
				<SearchInput
					value={discovery.query ?? ""}
					aria-label="Search runs"
					placeholder="run id, case, corpus hash, blocker id"
					onChange={(event) => {
						onChange({ query: event.target.value });
					}}
				/>
			</label>
			<div className="flex w-full items-center gap-3 sm:w-auto">
				<div className="min-w-0 flex-1 sm:w-66 sm:flex-none">
					<NativeSelect
						prefix="Sort"
						aria-label="Sort runs"
						value={discovery.sort ?? "newest"}
						onChange={(event) => {
							const [sort] =
								SORT_OPTIONS.find(([value]) => value === event.target.value) ??
								[];
							onChange({ sort });
						}}
					>
						{SORT_OPTIONS.map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</NativeSelect>
				</div>
				<Button variant="outline" onClick={onClear}>
					<RotateCcw aria-hidden="true" className="size-4" />
					Clear
				</Button>
			</div>
		</div>
	);
}

export { SearchAndSort as default };
