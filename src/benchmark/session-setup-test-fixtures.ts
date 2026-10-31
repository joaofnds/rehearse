import SessionAttemptsInFlight from "./session-attempts-in-flight";

/**
 * A home directory that holds no Claude Code setup, so an attempt under test
 * runs with the declared keys alone and never reads the developer's own.
 */
const ABSENT_HOME = "/nonexistent/rehearse-test-home";

/** A command's attempts under way, for a test no operator stops. */
function attemptsInFlight(): SessionAttemptsInFlight {
	return new SessionAttemptsInFlight();
}

export { ABSENT_HOME as default, attemptsInFlight };
