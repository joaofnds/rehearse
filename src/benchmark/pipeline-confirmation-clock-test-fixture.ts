const INITIAL_CLOCK_READ_COUNT = 0;
const CLOCK_DAY = 8;
const CLOCK_HOUR = 10;
const CLOCK_MINUTE = 15;
const CLOCK_MINUTES_PER_READ = 10;
const CLOCK_MONTH_INDEX = 9;
const CLOCK_YEAR = 2026;
const CLOCK_READ_COUNT_INCREMENT = 1;

class PipelineConfirmationClock {
	private reads = INITIAL_CLOCK_READ_COUNT;

	public readonly now = (): number => {
		this.reads += CLOCK_READ_COUNT_INCREMENT;
		return this.reads;
	};

	public readonly wallClock = (): number =>
		Date.UTC(
			CLOCK_YEAR,
			CLOCK_MONTH_INDEX,
			CLOCK_DAY,
			CLOCK_HOUR,
			CLOCK_MINUTE + CLOCK_MINUTES_PER_READ * this.reads,
		);
}

export { PipelineConfirmationClock as default };
