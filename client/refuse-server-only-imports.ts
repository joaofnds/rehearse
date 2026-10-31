import { isBuiltin } from "node:module";

import type { Plugin } from "vite";

/**
 * Vite swaps a Node module the client reaches for a stub that throws once the
 * browser loads it, so the build refuses one rather than shipping a blank page.
 */
function refuseServerOnlyImports(): Plugin {
	return {
		enforce: "pre",
		name: "refuse-server-only-imports",
		resolveId(source, importer) {
			if (isBuiltin(source)) {
				this.error(
					`The client imports ${source}, which runs only on the server, from ${importer ?? "its entry"}`,
				);
			}

			return null;
		},
	};
}

export { refuseServerOnlyImports as default };
