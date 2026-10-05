export function plural(
	count: number,
	noun: string,
	nounPlural = `${noun}s`,
): string {
	return count === 1 ? `1 ${noun}` : `${count} ${nounPlural}`;
}
