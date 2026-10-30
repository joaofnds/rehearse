import { join } from "node:path";

import { z } from "zod";

import deliverHomePathCitations from "./home-path-citation";
import type { HomePathCitationMap } from "./home-path-citation";

/**
 * Which rule turned the authored corpus into the text a session read. A record
 * without one was installed verbatim, so its home-path citations reached the
 * live install, and it is not comparable with a record that has one.
 */
const HOME_PATH_DELIVERY_RULE = 1;

const corpusDeliverySchema = z
	.object({
		redirected: z.number().int().nonnegative(),
		rule: z.literal(HOME_PATH_DELIVERY_RULE),
	})
	.strict();

type CorpusDelivery = z.infer<typeof corpusDeliverySchema>;

const NOTHING_DELIVERED: CorpusDelivery = {
	redirected: 0,
	rule: HOME_PATH_DELIVERY_RULE,
};

const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

function textOf(bytes: Readonly<Uint8Array>): string | undefined {
	try {
		return strictUtf8.decode(bytes);
	} catch {
		return undefined;
	}
}

/**
 * Rewrites, in place, the home-path citations in each installed text file
 * that name a file or directory this install holds. A file that is not UTF-8
 * text keeps its bytes.
 */
async function deliverInstalledCorpus(
	installRoot: string,
	layoutPaths: readonly string[],
	citations: HomePathCitationMap,
): Promise<CorpusDelivery> {
	const held = new Set(layoutPaths);
	const counts = await Array.fromAsync(layoutPaths, async (layoutPath) => {
		const file = join(installRoot, layoutPath);
		const text = textOf(await Bun.file(file).bytes());
		if (text === undefined) {
			return NOTHING_DELIVERED.redirected;
		}

		const delivered = deliverHomePathCitations(text, citations, held);
		if (delivered.text !== text) {
			await Bun.write(file, delivered.text);
		}

		return delivered.redirected;
	});

	return {
		redirected: counts.reduce(
			(total, count) => total + count,
			NOTHING_DELIVERED.redirected,
		),
		rule: HOME_PATH_DELIVERY_RULE,
	};
}

export {
	HOME_PATH_DELIVERY_RULE,
	NOTHING_DELIVERED,
	corpusDeliverySchema,
	deliverInstalledCorpus,
};
export type { CorpusDelivery };
