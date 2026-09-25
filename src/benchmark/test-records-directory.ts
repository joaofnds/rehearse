import { afterAll } from "bun:test";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = join(tmpdir(), `rehearse-records-${randomUUID()}`);
Bun.env["REHEARSE_RECORDS_DIR"] = directory;

afterAll(async () => {
	await rm(directory, { force: true, recursive: true });
});
