import { z } from "zod";

const identitySchema = z
	.string()
	.regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u)
	.brand("SavedIdentity");

type SavedIdentity = z.infer<typeof identitySchema>;

class SessionHistoryReaderError extends Error {
	public override name = "SessionHistoryReaderError";

	public constructor(
		public readonly kind: "not-found" | "refused",
		message: string,
	) {
		super(message);
	}
}

interface SessionAttemptHistoryIdentity {
	readonly runsDirectory: string;
	readonly caseId: string;
	readonly uuid: string;
}

interface ConfirmationAttemptHistoryIdentity {
	readonly runsDirectory: string;
	readonly groupId: string;
	readonly repId: string;
}

interface StageHistoryIdentityInput {
	readonly runsDirectory: string;
	readonly run: string;
	readonly stage: string;
}

interface ReplayHistoryIdentityInput {
	readonly runsDirectory: string;
	readonly lineage: string;
	readonly timestamp: string;
}

function parseIdentity(value: string): SavedIdentity {
	const parsed = identitySchema.safeParse(value);
	if (!parsed.success) {
		throw new SessionHistoryReaderError(
			"refused",
			"Invalid saved-attempt identity",
		);
	}

	return parsed.data;
}

export { parseIdentity, SessionHistoryReaderError };
export type {
	SessionAttemptHistoryIdentity,
	ConfirmationAttemptHistoryIdentity,
	StageHistoryIdentityInput,
	ReplayHistoryIdentityInput,
};
