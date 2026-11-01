import { basename, dirname, join } from "node:path";

import { MAX_CONTEXT_FILE_BYTES, MAX_CONTEXT_TOTAL_BYTES } from "./config";
import type { ContextFile } from "./contracts";
import { lstatIfPresent } from "./file-presence";
import serialMap from "./serial-map";
import { sessionJudgeFileSchema } from "./session-judge-contract";
import type { SessionJudgeInput } from "./session-judge-contract";
import { readStateOmissions } from "./state-evidence-omissions";

const EMPTY_COUNT = 0;

type SelectedText =
	| { readonly content: string; readonly kind: "file" }
	| { readonly detail: string; readonly kind: "absent" | "refused" };

async function selectedPath(
	root: string,
	path: string,
): Promise<SelectedText | undefined> {
	const parts = path.split("/");
	if (!sessionJudgeFileSchema.safeParse(path).success) {
		return { detail: `Unsafe Judge file path ${path}`, kind: "refused" };
	}

	let cursor = root;
	for await (const entry of serialMap(parts.values(), async (part) => {
		cursor = join(cursor, part);

		return await lstatIfPresent(cursor);
	})) {
		if (entry === undefined) {
			return {
				detail: `${path} is absent from the preserved tree`,
				kind: "absent",
			};
		}

		if (entry.isSymbolicLink()) {
			return { detail: `${path} reaches a symlink`, kind: "refused" };
		}
	}

	return undefined;
}

async function selectedText(root: string, path: string): Promise<SelectedText> {
	const refused = await selectedPath(root, path);
	if (refused !== undefined) {
		return refused;
	}

	const file = join(root, path);
	const entry = await lstatIfPresent(file);
	if (
		entry === undefined ||
		!entry.isFile() ||
		entry.size > MAX_CONTEXT_FILE_BYTES
	) {
		return {
			detail: `${path} is not a regular text file within the evidence size limit`,
			kind: "refused",
		};
	}

	const content = new TextDecoder("utf-8", { fatal: true }).decode(
		await Bun.file(file).bytes(),
	);

	return content.includes("\0")
		? { detail: `${path} contains binary data`, kind: "refused" }
		: { content, kind: "file" };
}

async function selectedJudgeText(
	root: string,
	path: string,
): Promise<SelectedText> {
	try {
		return await selectedText(root, path);
	} catch (error) {
		return {
			detail: `Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`,
			kind: "refused",
		};
	}
}

interface SessionJudgeEvidenceRequest {
	readonly prompt: string;
	readonly reply: string | undefined;
	readonly transcriptFile: string;
	readonly boundary: number | undefined;
	readonly stateDirectory: string;
	readonly files: readonly string[];
}

class JudgeEvidence {
	private readonly files: ContextFile[];
	private readonly unavailable: string[] = [];
	private readonly manifest: string[] = [];
	private omitted: readonly string[] = [];
	public constructor(private readonly request: SessionJudgeEvidenceRequest) {
		this.files = [{ content: request.prompt, path: "prompt.txt" }];
		if (request.reply === undefined) {
			this.unavailable.push("The attempt saved no reply");
		} else {
			this.files.push({ content: request.reply, path: "reply.txt" });
		}
	}
	private async transcript(): Promise<void> {
		const { boundary, transcriptFile } = this.request;
		const transcript =
			boundary === undefined
				? undefined
				: await selectedJudgeText(
						dirname(transcriptFile),
						basename(transcriptFile),
					);
		if (transcript?.kind === "file") {
			this.files.push({
				content: transcript.content
					.split("\n")
					.filter((line) => line.trim() !== "")
					.slice(boundary)
					.join("\n"),
				path: "transcript.jsonl",
			});
		} else {
			this.manifest.push(
				"transcript.jsonl: unavailable; no readable saved attempt boundary or transcript",
			);
		}
	}
	private async selectedStateFile(path: string): Promise<void> {
		if (
			this.omitted.some(
				(omitted) => path === omitted || path.startsWith(`${omitted}/`),
			)
		) {
			this.unavailable.push(
				`state/${path} was omitted during retention because it was not a regular file or directory`,
			);

			return;
		}

		const selected = await selectedJudgeText(this.request.stateDirectory, path);
		if (selected.kind === "file") {
			this.files.push({ content: selected.content, path: `state/${path}` });
		} else if (selected.kind === "absent") {
			this.manifest.push(`state/${path}: absent from the preserved tree`);
		} else {
			this.unavailable.push(selected.detail);
		}
	}
	private async state(): Promise<void> {
		const state = await lstatIfPresent(this.request.stateDirectory);
		this.omitted = await readStateOmissions(this.request.stateDirectory);
		if (
			this.request.files.length > EMPTY_COUNT &&
			(state === undefined || !state.isDirectory() || state.isSymbolicLink())
		) {
			this.unavailable.push("The attempt preserved no readable final tree");
		} else {
			await Array.fromAsync(this.request.files, async (path) => {
				await this.selectedStateFile(path);
			});
		}
	}
	public async read(): Promise<SessionJudgeInput> {
		await this.transcript();
		await this.state();
		this.files.push({
			content:
				this.manifest.length === EMPTY_COUNT
					? "All selected evidence is available."
					: this.manifest.join("\n"),
			path: "evidence.txt",
		});
		if (
			this.files.reduce(
				(sum, file) => sum + Buffer.byteLength(file.content),
				EMPTY_COUNT,
			) > MAX_CONTEXT_TOTAL_BYTES
		) {
			return {
				files: [],
				unavailable: [
					...this.unavailable,
					"Judge evidence exceeds the total text size limit",
				],
			};
		}

		return { files: this.files, unavailable: this.unavailable };
	}
}

async function sessionJudgeInput(
	request: SessionJudgeEvidenceRequest,
): Promise<SessionJudgeInput> {
	try {
		return await new JudgeEvidence(request).read();
	} catch (error) {
		return {
			files: [],
			unavailable: [
				`Cannot read saved Judge evidence: ${error instanceof Error ? error.message : String(error)}`,
			],
		};
	}
}

export { selectedJudgeText, sessionJudgeInput };
