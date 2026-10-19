const OPERATOR_STOP_FILE = "operator-stop.json";

const ATTEMPT_FILE = "attempt.json";

const RECORD_SUFFIX = ".json";

function runNameFromTimestamp(timestamp: string): string {
	return timestamp.replaceAll(":", "-");
}

export {
	runNameFromTimestamp,
	OPERATOR_STOP_FILE,
	RECORD_SUFFIX,
	ATTEMPT_FILE,
};
