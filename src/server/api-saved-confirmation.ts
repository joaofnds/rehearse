import { parseConfirmationRepRecord } from "#benchmark/confirmation-record";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import type { parseRecordId } from "#cli/record-id";
import type {
	HTTP_STATUS_CONFLICT,
	HTTP_STATUS_INTERNAL_SERVER_ERROR,
	HTTP_STATUS_NOT_FOUND,
} from "#server/http-status";

type ConfirmationIdentity = Extract<
	ReturnType<typeof parseRecordId>,
	{ readonly kind: "rep:session" }
>;

type SavedConfirmation =
	| {
			readonly found: true;
			readonly record: ReturnType<typeof parseConfirmationRepRecord>;
	  }
	| {
			readonly found: false;
			readonly message: string;
			readonly status:
				| typeof HTTP_STATUS_NOT_FOUND
				| typeof HTTP_STATUS_CONFLICT
				| typeof HTTP_STATUS_INTERNAL_SERVER_ERROR;
	  };

async function readSavedConfirmation(
	file: Readonly<Bun.BunFile>,
): Promise<ReturnType<typeof parseConfirmationRepRecord> | undefined> {
	try {
		return parseConfirmationRepRecord(await file.text());
	} catch {
		return undefined;
	}
}

async function confirmationResult(
	runsDirectory: string,
	id: ConfirmationIdentity,
): Promise<SavedConfirmation> {
	const file = Bun.file(
		confirmationGroupPaths(runsDirectory, id.groupId).rep(id.repId).recordFile,
	);
	if (!(await file.exists())) {
		return {
			found: false,
			message: "No saved result for this confirmation attempt",
			status: 404,
		};
	}

	const record = await readSavedConfirmation(file);
	if (record === undefined) {
		return {
			found: false,
			message: "The saved confirmation result could not be read",
			status: 500,
		};
	}

	if (record.groupId !== id.groupId || record.repId !== id.repId) {
		return {
			found: false,
			message: "The saved confirmation result names a different attempt",
			status: 409,
		};
	}

	return { found: true, record };
}

export { confirmationResult as default };
