import { z } from "zod";
import { CommandError, runCommand } from "./command";
import { CONTROL_DIR } from "./config";
import type { TargetService } from "./pipeline";
import type {
	ContainerOwner,
	ContainerRuntime,
	OwnedContainer,
	StartedContainer,
} from "./target-services";

const hostPortSchema = z.coerce.number().int().min(1).max(65_535);

/** Exit codes docker exec gives when the command cannot run in the container. */
const COMMAND_CANNOT_RUN = new Set([126, 127]);

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
 * Publishes the service on a loopback port docker picks, so it never takes a
 * port the operator's own services hold and never listens beyond this machine.
 * The labels let a run's end find its containers however far their start got.
 */
export function dockerRunArguments(
	service: TargetService,
	owner: ContainerOwner,
): readonly string[] {
	const environment = Object.entries(service.env ?? {}).flatMap(
		([variable, value]) => ["--env", `${variable}=${value}`],
	);

	return [
		"run",
		"--detach",
		"--label",
		`rehearse.run=${owner.run}`,
		"--label",
		`rehearse.attempt=${owner.attempt}`,
		"--label",
		`rehearse.service=${service.name}`,
		"--publish",
		`127.0.0.1::${service.port}`,
		...environment,
		service.image,
	];
}

/** Each line of `docker ps --format '{{.ID}} {{.Label "rehearse.service"}}'`. */
export function ownedContainersIn(output: string): readonly OwnedContainer[] {
	return output
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => {
			const [id = "", service = ""] = line.trim().split(" ");

			return { id, service };
		});
}

export const dockerContainerRuntime: ContainerRuntime = {
	start: startContainer,
	succeeds: succeedsIn,
	owned: ownedBy,
	remove: removeContainer,
};

async function startContainer(
	service: TargetService,
	owner: ContainerOwner,
): Promise<StartedContainer> {
	const started = await docker(...dockerRunArguments(service, owner));
	const id = started.trim();

	try {
		const published = await docker("port", id, `${service.port}/tcp`);

		return { id, hostPort: publishedHostPort(published) };
	} catch (error) {
		await assertRunning(id);
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
		if (
			!(error instanceof CommandError) ||
			COMMAND_CANNOT_RUN.has(error.exitCode)
		) {
			throw error;
		}

		await assertRunning(id);

		return false;
	}
}

async function assertRunning(id: string): Promise<void> {
	const state = await docker(
		"inspect",
		"--format",
		"{{.State.Running}} {{.State.ExitCode}}",
		id,
	);
	const [running, exitCode] = state.trim().split(" ");
	if (running !== "true") {
		throw new Error(`container ${id} exited with code ${exitCode}`);
	}
}

async function ownedBy(
	owner: ContainerOwner,
): Promise<readonly OwnedContainer[]> {
	const output = await docker(
		"ps",
		"--all",
		"--filter",
		`label=rehearse.run=${owner.run}`,
		"--filter",
		`label=rehearse.attempt=${owner.attempt}`,
		"--format",
		'{{.ID}} {{.Label "rehearse.service"}}',
	);

	return ownedContainersIn(output);
}

async function removeContainer(id: string): Promise<void> {
	await docker("rm", "--force", id);
}

function docker(...args: readonly string[]): Promise<string> {
	return runCommand(["docker", ...args], CONTROL_DIR);
}
