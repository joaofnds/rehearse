import type { SessionAttempt } from "./session-attempt";

class SessionInvocationError extends Error {
	public override name = "SessionInvocationError";

	public constructor(
		message: string,
		public readonly attempt: SessionAttempt,
	) {
		super(message);
	}
}

export { SessionInvocationError as default };
