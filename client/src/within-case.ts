/**
 * A short id or checkpoint short id without the case it is filed under, for a
 * reading that names the case beside it.
 */
function withinCase(shortId: string, caseId: string | undefined): string {
	const prefix = `${caseId}/`;

	return caseId !== undefined && shortId.startsWith(prefix)
		? shortId.slice(prefix.length)
		: shortId;
}

export { withinCase as default };
