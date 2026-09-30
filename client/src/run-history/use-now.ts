import { useEffect, useState } from "react";

/**
 * How often the elapsed readings redraw between the run's own measurements. A
 * run records its elapsed time when it emits an event, once per agent turn and
 * minutes apart, so without this the clock would stop between turns. One
 * second is the unit the reading shows in its first minute.
 */
const ELAPSED_TICK_MS = 1000;

/**
 * The clock the elapsed readings are drawn against, advancing on its own so a
 * run's reading keeps moving between the sparse events the run itself records.
 * It ticks only while something is running, so a page showing finished history
 * redraws nothing.
 */
export function useNow(running: boolean): number {
	const [nowMs, setNowMs] = useState(() => Date.now());

	useEffect(() => {
		if (!running) {
			return undefined;
		}

		const timer = setInterval(() => {
			setNowMs(Date.now());
		}, ELAPSED_TICK_MS);

		return () => {
			clearInterval(timer);
		};
	}, [running]);

	return nowMs;
}
