/**
 * A home directory that holds no Claude Code setup, so an attempt under test
 * runs with the declared keys alone and never reads the developer's own.
 */
const ABSENT_HOME = "/nonexistent/rehearse-test-home";

export { ABSENT_HOME as default };
