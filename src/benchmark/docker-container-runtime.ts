import { z } from "zod";
import { CommandError, runCommand } from "./command";
import { CONTROL_DIR } from "./config";
import type { TargetService } from "./pipeline";
import type { ContainerRuntime, StartedContainer } from "./target-services";

const hostPortSchema = z.coerce.number().int().min(1).max(65_535);

/** The host port in `docker port` output, such as `127.0.0.1:32768`. */
export function publishedHostPort(output: string): number {
	const [binding = ""] = output.trim().split("\n");
	const parsed = hostPortSchema.safeParse(
		binding.slice(binding.lastIndexOf(":") + 1),
	);
	if (!parsed.success) {
		throw new Error(`docker port printed no published port: ${output.trim()}`);
	}

	return parsed.data;
}

/**
 * Publishes each service on a loopback port docker picks, so it never takes a
 * port the operator's own services hold and never listens beyond this machine.
 */
export const dockerContainerRuntime: ContainerRuntime = {
	start: startContainer,
	succeeds: succeedsIn,
	remove: removeContainer,
};

async function startContainer(
	service: TargetService,
): Promise<StartedContainer> {
	const environment = Object.entries(service.env ?? {}).flatMap(
		([variable, value]) => ["--env", `${variable}=${value}`],
	);
	const output = await docker(
		"run",
		"--detach",
		"--rm",
		"--label",
		`rehearse.service=${service.name}`,
		"--publish",
		`127.0.0.1::${service.port}`,
		...environment,
		service.image,
	);
	const id = output.trim();

	try {
		const published = await docker("port", id, `${service.port}/tcp`);

		return { id, hostPort: publishedHostPort(published) };
	} catch (error) {
		await removeContainer(id);
		throw error;
	}
}

async function succeedsIn(
	id: string,
	command: readonly string[],
): Promise<boolean> {
	try {
		await docker("exec", id, ...command);

		return true;
	} catch (error) {
		if (error instanceof CommandError) {
			return false;
		}

		throw error;
	}
}

async function removeContainer(id: string): Promise<void> {
	await docker("rm", "--force", id);
}

function docker(...args: readonly string[]): Promise<string> {
	return runCommand(["docker", ...args], CONTROL_DIR);
}
