import { join } from "node:path";

import { format } from "oxfmt";
import type { FormatConfig } from "oxfmt";
import { z } from "zod";

import { CONTROL_DIR } from "#benchmark/config";

/** The project's formatter settings, which the formatter itself validates. */
const FORMAT_CONFIG = z.looseObject({});

/**
 * Formats a file the server writes into the control repository as the
 * project's formatter would, so the change an operator reviews is the only
 * diff and the format check still passes. `file` picks the language.
 */
async function projectFormatted(file: string, text: string): Promise<string> {
	const config: FormatConfig = FORMAT_CONFIG.parse(
		await Bun.file(join(CONTROL_DIR, ".oxfmtrc.json")).json(),
	);
	const result = await format(file, text, config);
	const [error] = result.errors;
	if (error !== undefined) {
		throw new Error(`Could not format ${file}: ${error.message}`);
	}

	return result.code;
}

export { projectFormatted as default };
