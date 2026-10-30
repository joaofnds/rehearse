import { join } from "node:path";

import { z } from "zod";

import type { Immutable } from "./contracts";
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

const liveCorpusReadSchema = z
	.object({
		count: z.number().int().positive(),
		path: z.string().nonempty(),
	})
	.strict();

/**
 * How the corpus reached a session: the rule and its redirect count, and each
 * file under test the session or a sub-agent still reached through its live
 * copy, by layout path.
 */
const corpusDeliveryRecordSchema = corpusDeliverySchema
	.extend({ liveReads: z.array(liveCorpusReadSchema) })
	.strict();

type CorpusDeliveryRecord = Immutable<
	z.infer<typeof corpusDeliveryRecordSchema>
>;

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

interface DeliveredFile {
	readonly file: string;
	readonly authored: string;
	readonly delivered: string;
	readonly redirected: number;
}

async function deliveredFiles(
	root: string,
	layoutPaths: readonly string[],
	citations: HomePathCitationMap,
): Promise<readonly DeliveredFile[]> {
	const held = new Set(layoutPaths);
	const delivered = await Array.fromAsync(layoutPaths, async (layoutPath) => {
		const file = join(root, layoutPath);
		const source = Bun.file(file);
		const authored = (await source.exists())
			? textOf(await source.bytes())
			: undefined;
		if (authored === undefined) {
			return [];
		}

		const { text, redirected } = deliverHomePathCitations(
			authored,
			citations,
			held,
		);

		return [{ authored, delivered: text, file, redirected }];
	});

	return delivered.flat();
}

function totalDelivery(files: readonly DeliveredFile[]): CorpusDelivery {
	return {
		redirected: files.reduce(
			(total, { redirected }) => total + redirected,
			NOTHING_DELIVERED.redirected,
		),
		rule: HOME_PATH_DELIVERY_RULE,
	};
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
	const files = await deliveredFiles(installRoot, layoutPaths, citations);
	await Array.fromAsync(files, async ({ file, authored, delivered }) => {
		if (delivered !== authored) {
			await Bun.write(file, delivered);
		}
	});

	return totalDelivery(files);
}

/**
 * What installing these files would redirect, read from the authored copy
 * without writing, so a run can record it before any rep installs.
 */
async function countCorpusDelivery(
	root: string,
	layoutPaths: readonly string[],
	citations: HomePathCitationMap,
): Promise<CorpusDelivery> {
	return totalDelivery(await deliveredFiles(root, layoutPaths, citations));
}

export {
	HOME_PATH_DELIVERY_RULE,
	NOTHING_DELIVERED,
	corpusDeliverySchema,
	corpusDeliveryRecordSchema,
	countCorpusDelivery,
	deliverInstalledCorpus,
};
export type { CorpusDelivery, CorpusDeliveryRecord };
