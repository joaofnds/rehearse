/** An edit, named by the corpus versions it went from and to. */
interface EditVersions {
	readonly previous: string;
	readonly current: string;
}

const SEPARATOR = "..";

/** The run-history address's `invalidatedBy` value naming an edit. */
function invalidatedByValue({ previous, current }: EditVersions): string {
	return `${previous}${SEPARATOR}${current}`;
}

/** Two full corpus versions, each a layout's SHA-256 in lowercase hex. */
const EDIT = /^(?<previous>[0-9a-f]{64})\.\.(?<current>[0-9a-f]{64})$/u;

/**
 * The edit an `invalidatedBy` value names, undefined when it names none, as
 * a short version label or anything but two full versions does.
 */
function editNamedBy(value: string): EditVersions | undefined {
	const { previous, current } = EDIT.exec(value)?.groups ?? {};
	if (previous === undefined || current === undefined) {
		return undefined;
	}

	return { current, previous };
}

export { editNamedBy, invalidatedByValue };
export type { EditVersions };
