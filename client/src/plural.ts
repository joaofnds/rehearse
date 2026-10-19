const SINGLE_ITEM_COUNT = 1;

function plural(count: number, noun: string, nounPlural = `${noun}s`): string {
	return count === SINGLE_ITEM_COUNT ? `1 ${noun}` : `${count} ${nounPlural}`;
}

export { plural as default };
