import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import KeyHint from "#client/system/components/key-hint";
import { Button } from "#client/system/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "#client/system/ui/dialog";
import SearchInput from "#client/system/ui/search-input";

import SearchResults from "./search-results";

function GlobalSearch(): React.JSX.Element {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	useSearchOpening(setOpen);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" aria-label="Search everything">
					<Search aria-hidden="true" className="size-4" />
					<span className="flex-1 text-left">Search</span>
					<span className="hidden md:inline-flex">
						<KeyHint letter="⌘ / Ctrl K" />
					</span>
				</Button>
			</DialogTrigger>
			<DialogContent width="wide">
				<div className="flex shrink-0 flex-col gap-2 border-b border-divider px-5 py-4">
					<DialogTitle>Search everything</DialogTitle>
					<DialogDescription>
						Runs, cases, instructions and saved comparisons. Escape closes
						search.
					</DialogDescription>
					<label className="mt-3 block">
						<SearchInput
							aria-label="Search everything"
							value={query}
							onChange={(event) => {
								setQuery(event.target.value);
							}}
						/>
					</label>
				</div>
				<div className="relative min-h-0 max-h-100 overflow-y-auto overscroll-y-contain pt-3">
					<SearchResults
						query={query}
						close={() => {
							setOpen(false);
						}}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function useSearchOpening(
	setOpen: React.Dispatch<React.SetStateAction<boolean>>,
): void {
	useEffect(() => {
		const keydown: EventListener = (event) => {
			if (
				event instanceof KeyboardEvent &&
				(event.metaKey || event.ctrlKey) &&
				event.key.toLowerCase() === "k"
			) {
				event.preventDefault();
				setOpen((value) => !value);
			}
		};
		document.addEventListener("keydown", keydown);
		return () => {
			document.removeEventListener("keydown", keydown);
		};
	}, []);
}

export { GlobalSearch as default };
