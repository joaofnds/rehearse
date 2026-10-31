import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import refuseServerOnlyImports from "./refuse-server-only-imports";

export default defineConfig({
	plugins: [react(), tailwindcss(), refuseServerOnlyImports()],
	resolve: {
		alias: {
			"#client": fileURLToPath(new URL("src", import.meta.url)),
		},
	},
	root: "client",
});
