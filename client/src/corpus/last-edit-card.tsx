import { Link } from "@tanstack/react-router";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { plural } from "#client/plural";
import { invalidatedByValue } from "#client/run-history/invalidated-by";
import { SectionLabel } from "#client/system/components/section-label";
import type { CorpusResponse } from "./corpus-query";

type LastEdit = CorpusResponse["lastEdit"];

function reading(lastEdit: LastEdit): React.JSX.Element {
	if (lastEdit.kind === "not-recorded") {
		return (
			<span className="text-dim">{`Not recorded: ${lastEdit.reason}`}</span>
		);
	}
	if (lastEdit.count === 0) {
		return (
			<span>
				<span aria-hidden="true">✓ </span>
				{`No recorded result invalidated by the edit from ${corpusVersionLabel(lastEdit.previous)}`}
			</span>
		);
	}

	return (
		<span>
			<span aria-hidden="true">⚠ </span>
			{`${plural(lastEdit.count, "recorded result")} · `}
			<Link
				to="/"
				search={{ invalidatedBy: invalidatedByValue(lastEdit) }}
				className="text-link underline decoration-link/60 underline-offset-4 hover:text-link-hover"
			>
				review them
			</Link>
		</span>
	);
}

/** How many recorded results the last edit made stale, beside the corpus it edited. */
export function LastEditCard({
	lastEdit,
}: {
	readonly lastEdit: LastEdit;
}): React.JSX.Element {
	return (
		<section
			aria-labelledby="last-edit-heading"
			className="rounded-lg border border-strong bg-raised px-3 py-2"
		>
			<h2 id="last-edit-heading">
				<SectionLabel>Invalidated by the last edit</SectionLabel>
			</h2>
			<p className="mt-1 text-14">{reading(lastEdit)}</p>
			<p className="mt-1 max-w-80 text-12 text-muted-foreground">
				Only results that were fresh before this edit and are stale now.
				Per-file counts below use a different basis.
			</p>
		</section>
	);
}
