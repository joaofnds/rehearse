import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

/**
 * Vite swaps a Node module the client reaches for a stub that throws once the
 * browser loads it, so the build refuses one rather than shipping a blank page.
 */
const BROWSER_EXTERNALIZED = "has been externalized for browser compatibility";

const NONE = 0;

const serverOnlyImports: string[] = [];

function refuseServerOnlyImports(): Plugin {
	return {
		generateBundle() {
			if (serverOnlyImports.length !== NONE) {
				this.error(
					`The client imports modules that only run on the server:\n${serverOnlyImports.join("\n")}`,
				);
			}
		},
		name: "refuse-server-only-imports",
	};
}

export default defineConfig({
	build: {
		rolldownOptions: {
			onLog(level, log, handler) {
				if (log.message.includes(BROWSER_EXTERNALIZED)) {
					serverOnlyImports.push(log.message);
				}
				handler(level, log);
			},
		},
	},
	plugins: [react(), tailwindcss(), refuseServerOnlyImports()],
	resolve: {
		alias: {
			"#client": fileURLToPath(new URL("src", import.meta.url)),
		},
	},
	root: "client",
});
