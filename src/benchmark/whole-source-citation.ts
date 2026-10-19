const CITATION_PATH_COMPONENT_COUNT = 1;

function normalizedSourceCitation(value: string): string {
	const [file] = value.split("#", CITATION_PATH_COMPONENT_COUNT);
	return file?.toLowerCase().replaceAll(/[^a-z0-9]/gu, "") ?? "";
}

/**
 * Judges spell a whole-source citation many ways: the source name, the
 * camelCase field key from the input JSON, either with a #fragment. All of
 * them name the source; the comparison ignores case and separators.
 */
function citesWholeSource(path: string, source: string): boolean {
	return normalizedSourceCitation(path) === normalizedSourceCitation(source);
}

export { citesWholeSource as default };
