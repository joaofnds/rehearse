export function plural(count: number, noun: string): string {
	return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}
