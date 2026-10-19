import type { StageCorpusResponse } from "./history-evidence-queries";

interface DeclaredCorpusPaneProps {
	readonly entries: StageCorpusResponse;
}

/**
 * What a checkpoint declared, against what its transcript shows. An entry with
 * no matching read says no observation was recorded, never that the file was
 * not loaded: the transcript records deliveries, so its silence about a file is
 * an absence of evidence rather than evidence of absence.
 */
function DeclaredCorpusPane({
	entries,
}: DeclaredCorpusPaneProps): React.JSX.Element {
	return (
		<section
			aria-label="Declared corpus"
			className="rounded-lg border bg-muted px-4 py-3 text-secondary-foreground"
		>
			<details>
				<summary className="cursor-pointer text-14">
					Declared corpus · {entries.length} files ·{" "}
					{
						entries.filter(({ state }) => state === "no-observation-recorded")
							.length
					}{" "}
					without an observation ·{" "}
					{entries.filter(({ state }) => state === "undeclared").length}{" "}
					undeclared
				</summary>
				<ul className="mt-2 flex flex-col gap-1">
					{entries.map((entry) => (
						<li key={`${entry.state}:${entry.path}`}>
							<code className="font-mono text-13">{entry.path}</code>{" "}
							<small className="text-12 text-muted-foreground">
								{corpusStateLabel(entry)}
							</small>
						</li>
					))}
				</ul>
			</details>
		</section>
	);
}

function corpusStateLabel(entry: StageCorpusResponse[number]): string {
	const locator =
		entry.firstLocator === undefined
			? ""
			: ` · ${entry.firstLocator.line}:${entry.firstLocator.block}`;
	if (entry.state === "observed") {
		return `Observed${locator}`;
	}

	if (entry.state === "undeclared") {
		return `Undeclared${locator}`;
	}

	return "No observation recorded";
}

export { DeclaredCorpusPane as default };
