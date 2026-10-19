import { listCases } from "#benchmark/case";
import { formatRecordId } from "#cli/record-id";

import type { RecordListing } from "./record-listing";

async function listDeclaredCases(): Promise<RecordListing> {
	const listing = await listCases(undefined, { includeArchived: false });

	return {
		entries: listing.declarations.map((declaration) => ({
			fields: [declaration.title],
			id: formatRecordId({ caseId: declaration.id, kind: "case" }),
		})),
		unreadable: listing.unreadable.map(({ id, reason }) => ({
			id: formatRecordId({ caseId: id, kind: "case" }),
			reason,
		})),
	};
}

export { listDeclaredCases as default };
