#!/usr/bin/env bun
import { pinnedBunRefusal } from "./bun-pin";
import { REQUIRED_BUN_VERSION } from "./config";

const CLI_USER_ARGUMENTS_START_INDEX = 2;

const BUN_MISMATCH_EXIT_CODE = 1;

const [required = REQUIRED_BUN_VERSION] = Bun.argv.slice(
	CLI_USER_ARGUMENTS_START_INDEX,
);
const refusal = pinnedBunRefusal({ required, running: Bun.version });

if (refusal !== null) {
	await Bun.write(Bun.stderr, `${refusal}\n`);
	process.exit(BUN_MISMATCH_EXIT_CODE);
}
