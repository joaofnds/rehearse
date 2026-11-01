import { dirname, join, relative } from "node:path";

import { z } from "zod";

import { textIfPresent } from "./file-presence";

const OMITTED_STATE_FILE = "state-omissions.json";
const EMPTY_COLLECTION_LENGTH = 0;
const omittedPathsSchema = z.array(z.string().nonempty());

async function writeStateOmissions(
	recordDirectory: string,
	sourceDirectory: string,
	paths: readonly string[],
): Promise<void> {
	if (paths.length === EMPTY_COLLECTION_LENGTH) {
		return;
	}

	await Bun.write(
		join(recordDirectory, OMITTED_STATE_FILE),
		JSON.stringify(paths.map((path) => relative(sourceDirectory, path))),
	);
}

async function readStateOmissions(
	stateDirectory: string,
): Promise<readonly string[]> {
	const text = await textIfPresent(
		join(dirname(stateDirectory), OMITTED_STATE_FILE),
	);
	return text === undefined ? [] : omittedPathsSchema.parse(JSON.parse(text));
}

export { readStateOmissions, writeStateOmissions };
