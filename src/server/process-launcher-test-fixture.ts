import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import serialMap from "#benchmark/serial-map";

const RESOURCE_DRAIN_START_INDEX = 0;

const PROCESS_POLL_INTERVAL_MS = 20;

/** Polls, because the detached child runs on its own schedule. */
async function eventually(check: () => Promise<boolean>): Promise<boolean> {
	for await (const ready of serialMap(
		Array.from({ length: 100 }).values(),
		check,
	)) {
		if (ready) {
			return true;
		}

		await Bun.sleep(PROCESS_POLL_INTERVAL_MS);
	}

	return false;
}

/** Assigning undefined to an environment variable stores the string "undefined". */
function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		Reflect.deleteProperty(Bun.env, name);
	} else {
		Bun.env[name] = value;
	}
}

async function logText(log: string): Promise<string> {
	return await Bun.file(log)
		.text()
		.catch(() => "");
}

async function processGroup(pid: number): Promise<number> {
	const output = await Bun.$`ps -o pgid= -p ${pid}`.text();

	return Number(output.trim());
}

const roots: string[] = [];

const pids: number[] = [];

const localeRestorations: (() => void)[] = [];

async function logFile(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-launcher-"));
	roots.push(root);

	return join(root, "launches", "launch.log");
}

async function clearProcessFixtures(): Promise<void> {
	for (const restore of localeRestorations
		.splice(RESOURCE_DRAIN_START_INDEX)
		.toReversed()) {
		restore();
	}
	for (const pid of pids.splice(RESOURCE_DRAIN_START_INDEX)) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// The child already exited.
		}
	}
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

interface ProcessLocale {
	readonly use: (tz: string, locale: string) => void;
}

function processLocale(): ProcessLocale {
	const saved = { locale: Bun.env["LC_ALL"], tz: Bun.env.TZ };
	localeRestorations.push(() => {
		restoreEnv("TZ", saved.tz);
		restoreEnv("LC_ALL", saved.locale);
	});
	return {
		use: (tz, locale) => {
			Bun.env.TZ = tz;
			Bun.env["LC_ALL"] = locale;
		},
	};
}

export {
	eventually,
	logText,
	processGroup,
	pids,
	logFile,
	clearProcessFixtures,
	processLocale,
};
