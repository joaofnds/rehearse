import { mkdir, open, readdir } from "node:fs/promises";
import { join } from "node:path";

import { isCaseId } from "./case";
import claimedNumbers from "./numbered-claims";
import serialMap from "./serial-map";
import {
	BINDINGS_DIRECTORY,
	CLAIMS_DIRECTORY,
	formatShortId,
	registryDirectory,
	shortIdKind,
} from "./short-id-contract";
import type { ClaimSubject, ShortId } from "./short-id-contract";

const SHORT_ID_NUMBER_STEP = 1;

const NO_CLAIMED_SHORT_ID_NUMBER = 0;

const FINAL_CLAIMED_SHORT_ID_NUMBER_OFFSET = -1;

const SHORT_ID_SEQUENCE_STEP = 1;

async function highestNumber(claimsDirectory: string): Promise<number> {
	return (
		claimedNumbers(await readdir(claimsDirectory)).at(
			FINAL_CLAIMED_SHORT_ID_NUMBER_OFFSET,
		) ?? NO_CLAIMED_SHORT_ID_NUMBER
	);
}

/**
 * The exclusive create is what makes a number one process's alone: a second
 * writer racing for it gets EEXIST and moves to the next. The content is
 * written after the create, so a writer killed between the two leaves an
 * empty file, which every reader treats as a number that names nothing.
 */
async function createExclusively(
	file: string,
	contents: string,
): Promise<boolean> {
	const openClaimFile = async (): Promise<
		Awaited<ReturnType<typeof open>> | false
	> => {
		try {
			return await open(file, "wx");
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				error.code === "EEXIST"
			) {
				return false;
			}

			throw error;
		}
	};

	const handle = await openClaimFile();
	if (handle === false) {
		return false;
	}

	try {
		await handle.writeFile(contents);
	} finally {
		await handle.close();
	}

	return true;
}

function serialize(value: ClaimSubject): string {
	return `${JSON.stringify(value)}\n`;
}

function* unclaimedNumbers(first: number): Generator<number> {
	for (let number = first; ; number += SHORT_ID_SEQUENCE_STEP) {
		yield number;
	}
}

async function ensureRegistry(
	runsDirectory: string,
	caseId: string,
): Promise<string> {
	const directory = registryDirectory(runsDirectory, caseId);

	await mkdir(join(directory, CLAIMS_DIRECTORY), { recursive: true });
	await mkdir(join(directory, BINDINGS_DIRECTORY), { recursive: true });

	return directory;
}

/**
 * The case id names the registry's directory, and a replay reads it from a
 * manifest on disk, so one that is not a case id is refused before it can
 * name a directory outside the registry.
 */
async function claimShortId(
	runsDirectory: string,
	caseId: string,
	subject: ClaimSubject,
): Promise<ShortId> {
	if (!isCaseId(caseId)) {
		throw new Error(
			`Cannot claim a short id in ${caseId}: it is not a case id`,
		);
	}

	const claimsDirectory = join(
		await ensureRegistry(runsDirectory, caseId),
		CLAIMS_DIRECTORY,
	);

	for await (const inspection of serialMap(
		unclaimedNumbers(
			(await highestNumber(claimsDirectory)) + SHORT_ID_NUMBER_STEP,
		),
		async (number) => ({
			claimed: await createExclusively(
				join(claimsDirectory, String(number)),
				serialize(subject),
			),
			number,
		}),
	)) {
		const { number, claimed } = inspection;
		if (claimed) {
			return { caseId, kind: shortIdKind(subject), number };
		}
	}

	throw new Error("Short id candidates ended before a number was claimed");
}

async function bindReplay(
	runsDirectory: string,
	id: ShortId,
	attempt: { readonly lineage: string; readonly timestamp: string },
): Promise<void> {
	const binding = join(
		registryDirectory(runsDirectory, id.caseId),
		BINDINGS_DIRECTORY,
		String(id.number),
	);

	const bound = await createExclusively(
		binding,
		serialize({ kind: "attempt:stage", ...attempt }),
	);
	if (!bound) {
		throw new Error(
			`Short id ${formatShortId(id)} is already bound to a replay record`,
		);
	}
}

export { claimShortId, bindReplay };
