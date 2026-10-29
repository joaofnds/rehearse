import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

const IN_FLIGHT_FILE = "in-flight.json";

const inFlightClaimSchema = z.object({
	pid: z.number().int().positive(),
	startedAt: z.iso.datetime(),
});

/**
 * Which process is writing a confirmation group or session attempt, and
 * since when, so a reader can tell one still recording from one whose
 * process ended before its record was written.
 */
type InFlightClaim = z.infer<typeof inFlightClaimSchema>;

/**
 * Written before the record's first file, so no directory a reader lists
 * lacks it while its process is alive. It stays once the record is written,
 * since a written record settles the reading on its own.
 */
async function claimInFlight(directory: string): Promise<void> {
	await mkdir(directory, { recursive: true });
	await Bun.write(
		join(directory, IN_FLIGHT_FILE),
		`${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
	);
}

/**
 * Undefined for a record written before claims existed, and for a claim
 * that does not parse, which a reader treats alike: as a record nothing
 * says is still being written.
 */
async function readInFlightClaim(
	directory: string,
): Promise<InFlightClaim | undefined> {
	const file = Bun.file(join(directory, IN_FLIGHT_FILE));
	if (!(await file.exists())) {
		return undefined;
	}

	try {
		const parsed = inFlightClaimSchema.safeParse(await file.json());

		return parsed.success ? parsed.data : undefined;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return undefined;
		}

		throw error;
	}
}

export { claimInFlight, readInFlightClaim };

export type { InFlightClaim };
