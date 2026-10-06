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
/** The edit an `invalidatedBy` value names, undefined when it names none. */
export function editNamedBy(value: string): EditVersions | undefined {
	const parts = value.split(SEPARATOR);
	const [previous, current] = parts;
	if (
		parts.length !== 2 ||
		previous === undefined ||
		previous === "" ||
		current === undefined ||
		current === ""
	) {
		return undefined;
	}

	return { previous, current };
}
