import { afterAll } from "bun:test";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RECORDS_DIRECTORY_VARIABLE } from "./config";

const directory = join(tmpdir(), `rehearse-records-${randomUUID()}`);
Bun.env[RECORDS_DIRECTORY_VARIABLE] = directory;

afterAll(async () => {
	await rm(directory, { force: true, recursive: true });
});
