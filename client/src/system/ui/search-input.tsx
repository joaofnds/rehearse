import type { ComponentProps } from "react";
import { Search } from "lucide-react";

type SearchInputProps = Omit<ComponentProps<"input">, "className" | "type">;

export function SearchInput(props: SearchInputProps): React.JSX.Element {
	return (
		<span className="relative block min-w-0 w-full">
			<Search
				aria-hidden="true"
				className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-dim"
			/>
			<input
				{...props}
				type="search"
				className="min-h-touch-target min-w-0 w-full rounded-lg border border-strong bg-card py-2 pr-4 pl-11 text-14 text-foreground"
			/>
		</span>
	);
}
