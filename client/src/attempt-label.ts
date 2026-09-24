/** Which attempt at its checkpoint a record is, or which rep of its group. */
export interface AttemptPosition {
	readonly position: number;
	readonly count: number;
}

export function attemptLabel({ position, count }: AttemptPosition): string {
	return `attempt ${String(position)} of ${String(count)}`;
}
