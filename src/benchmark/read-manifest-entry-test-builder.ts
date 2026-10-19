import { createHash } from "node:crypto";

import type { ReadManifestEntry } from "#benchmark/read-manifest";

class ReadManifestEntryBuilder {
	public constructor(private readonly props: Partial<ReadManifestEntry> = {}) {}

	public build(): ReadManifestEntry & { readonly sha256: string } {
		return {
			evidence: "declared",
			half: "corpus",
			path: "skills/build/SKILL.md",
			role: "stage skill",
			...this.props,
			sha256:
				this.props.sha256 ??
				createHash("sha256").update("build skill\n").digest("hex"),
		};
	}
}

export { ReadManifestEntryBuilder as default };
