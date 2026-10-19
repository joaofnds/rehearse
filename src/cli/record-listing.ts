import type { UnreadableRecord } from "#cli/output";
import { controlRelative } from "#cli/output";
import type { RecordId } from "#cli/record-id";
import { formatRecordId } from "#cli/record-id";
import type { ShortIdColumn } from "#cli/short-id-column";
import { NO_SHORT_ID, shortIdsByRecordId } from "#cli/short-id-column";

interface ListedRecord {
	readonly id: string;
	readonly fields: readonly string[];
}

interface RecordListing {
	readonly entries: readonly ListedRecord[];
	readonly unreadable: readonly UnreadableRecord[];
}

/**
 * One unreadable record must not hide the valid ones: a half-written group or
 * an attempt directory whose run died before it wrote anything is reported by
 * id and reason while every record that parses still prints. This is the
 * `case list` precedent, and it is why each listing collects rather than
 * throws.
 */
async function collect<Named>(
	named: readonly Named[],
	idOf: (name: Named) => RecordId,
	read: (name: Named) => Promise<readonly string[] | undefined>,
): Promise<RecordListing> {
	const entries: ListedRecord[] = [];
	const unreadable: UnreadableRecord[] = [];

	await Array.fromAsync(named, async (name) => {
		const id = formatRecordId(idOf(name));
		try {
			const fields = await read(name);
			if (fields !== undefined) {
				entries.push({ fields, id });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			unreadable.push({ id, reason: controlRelative(message) });
		}
	});

	return { entries, unreadable };
}

/**
 * The short id goes second, beside the Record ID it abbreviates, so a reader
 * finds both ids of a record in the first two columns whatever its kind.
 */
function withShortIds(
	listing: RecordListing,
	{ shortIds, unreadable }: ShortIdColumn,
): RecordListing {
	return {
		entries: listing.entries.map(({ id, fields }) => ({
			fields: [shortIds.get(id) ?? NO_SHORT_ID, ...fields],
			id,
		})),
		unreadable: [...listing.unreadable, ...unreadable],
	};
}

async function numbered(
	runsDirectory: string,
	listing: RecordListing,
): Promise<RecordListing> {
	return withShortIds(listing, await shortIdsByRecordId(runsDirectory));
}

export { collect, numbered, withShortIds };
export type { ListedRecord, RecordListing };
