import { z } from "zod";

import { isConfirmationIdentity } from "./confirmation-record";
import type { Immutable } from "./contracts";

const ARCHIVE_SCHEMA_VERSION = 1;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const CONFLICT = 409;
const groupIdSchema = z.string().refine(isConfirmationIdentity);
const archiveSchema = z.strictObject({
	archivedAt: z.iso.datetime(),
	groupId: groupIdSchema,
	schemaVersion: z.literal(ARCHIVE_SCHEMA_VERSION),
});
type ConfirmationArchive = Immutable<
	Pick<z.infer<typeof archiveSchema>, "groupId" | "archivedAt">
>;
interface ConfirmationArchives {
	readonly archived: readonly ConfirmationArchive[];
	readonly unreadable: readonly {
		readonly id: string;
		readonly reason: string;
		readonly groupId?: string;
	}[];
}
interface ConfirmationArchiveTarget {
	readonly runsDirectory: string;
	readonly groupId: string;
}
interface ArchiveConfirmationRequest extends ConfirmationArchiveTarget {
	readonly archivedAt: string;
}

class ConfirmationArchiveRefusalError extends Error {
	public override name = "ConfirmationArchiveRefusalError";
	public constructor(
		public readonly status:
			| typeof BAD_REQUEST
			| typeof NOT_FOUND
			| typeof CONFLICT,
		message: string,
	) {
		super(message);
	}
}
function validGroupId(groupId: string): string {
	const parsed = groupIdSchema.safeParse(groupId);
	if (!parsed.success) {
		throw new ConfirmationArchiveRefusalError(
			BAD_REQUEST,
			"Invalid confirmation group ID",
		);
	}

	return parsed.data;
}

export {
	ARCHIVE_SCHEMA_VERSION,
	archiveSchema,
	groupIdSchema,
	ConfirmationArchiveRefusalError,
	validGroupId,
};
export type {
	ConfirmationArchive,
	ConfirmationArchives,
	ConfirmationArchiveTarget,
	ArchiveConfirmationRequest,
};
