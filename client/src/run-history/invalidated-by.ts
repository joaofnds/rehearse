/** An edit, named by the corpus versions it went from and to. */
export interface EditVersions {
	readonly previous: string;
	readonly current: string;
}

const SEPARATOR = "..";

/** The run-history address's `invalidatedBy` value naming an edit. */
export function invalidatedByValue({
	previous,
	current,
}: EditVersions): string {
	return `${previous}${SEPARATOR}${current}`;
}
