import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { ReadManifestEntry } from "./read-manifest";
import { sha256Of } from "./staleness-test-files";

// No stage captures another skill, so a stage that loads one reads it beyond its captured files.
const STYLE = "skills/delivery/SKILL.md";

function styleEntry(content: string): ReadManifestEntry {
	return {
		evidence: "observed",
		half: "corpus",
		path: STYLE,
		role: "read for context",
		sha256: sha256Of(content),
	};
}

async function withStyle(corpus: string, content: string): Promise<void> {
	await mkdir(join(corpus, "skills", "delivery"), { recursive: true });
	await Bun.write(join(corpus, STYLE), content);
}

function deliveryRead(content: string): ReadManifestEntry {
	return {
		evidence: "observed",
		half: "corpus",
		path: "skills/delivery/SKILL.md",
		role: "read for context",
		sha256: sha256Of(content),
	};
}

export { STYLE, styleEntry, withStyle, deliveryRead };
