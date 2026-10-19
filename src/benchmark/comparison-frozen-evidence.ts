import { dirname, resolve } from "node:path";

import type { FrozenFile, LoadedFrozenFile } from "./comparison-evidence";
import type { LoadArmRequest } from "./comparison-evidence-files";
import {
	descendantPath,
	evidenceError,
	readEvidenceFile,
} from "./comparison-evidence-files";
import sessionFrozenPath from "./comparison-session-frozen-paths";
import type { ParsedConfirmationGroupRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";

const REQUIRED_FROZEN_INPUT_KINDS = [
	"checkpoint",
	"corpus",
	"rubric",
	"pipeline",
	"instructions",
	"task",
	"product-brief",
] as const;

interface VerifiedFrozenFiles {
	readonly files: readonly LoadedFrozenFile[];
	readonly sourcePaths: readonly string[];
}

class FrozenEvidenceFiles {
	private readonly identities = new Set<string>();
	private readonly kinds = new Set<FrozenFile["kind"]>();
	private readonly files: LoadedFrozenFile[] = [];
	private readonly sourcePaths: string[] = [];
	public constructor(
		private readonly request: Readonly<LoadArmRequest>,
		private readonly groupPath: string,
		private readonly group: Immutable<ParsedConfirmationGroupRecord>,
	) {}
	public async load(): Promise<void> {
		await Array.fromAsync([...this.group.inputs.files], async (frozen) => {
			await this.loadFile(frozen);
		});
	}
	public verified(): VerifiedFrozenFiles {
		const { request, group } = this;
		const { kinds } = this;
		if (group.mode !== "session") {
			for (const kind of REQUIRED_FROZEN_INPUT_KINDS) {
				if (!kinds.has(kind)) {
					throw evidenceError(
						{
							arm: request.role,
							caseId: request.caseId,
							field: `inputs.files.${kind}`,
						},
						`source group records no ${kind} input`,
					);
				}
			}
		}
		return { files: this.files, sourcePaths: this.sourcePaths };
	}
	private observe(frozen: FrozenFile): string {
		const { request, group } = this;
		const identity = `${frozen.kind}:${frozen.path}`;
		const field = `inputs.files[${identity}]`;
		if (this.identities.has(identity)) {
			throw evidenceError(
				{ arm: request.role, caseId: request.caseId, field },
				"duplicate frozen input path",
			);
		}
		this.identities.add(identity);
		this.kinds.add(frozen.kind);
		if (group.mode === "session") {
			sessionFrozenPath(request, frozen);
		}
		return field;
	}
	private async loadFile(frozen: FrozenFile): Promise<void> {
		const { request, group, groupPath } = this;
		const field = this.observe(frozen);
		const path =
			group.mode === "session"
				? descendantPath(request, {
						field: `${field}.path`,
						path: frozen.path,
						root: dirname(groupPath),
					})
				: resolve(dirname(groupPath), frozen.path);
		const source = await readEvidenceFile({
			arm: request.role,
			caseId: request.caseId,
			field: `${field}.path`,
			path,
		});
		if (source.sha256 !== frozen.sha256) {
			throw evidenceError(
				{ arm: request.role, caseId: request.caseId, field: `${field}.sha256` },
				`recorded ${frozen.sha256} but found ${source.sha256}`,
			);
		}
		this.files.push({ record: frozen, text: source.text });
		this.sourcePaths.push(source.canonicalPath);
	}
}

async function assertFrozenFiles(
	request: Readonly<LoadArmRequest>,
	groupPath: string,
	group: Immutable<ParsedConfirmationGroupRecord>,
): Promise<VerifiedFrozenFiles> {
	const evidence = new FrozenEvidenceFiles(request, groupPath, group);
	await evidence.load();
	return evidence.verified();
}

export { assertFrozenFiles, REQUIRED_FROZEN_INPUT_KINDS };
export type { VerifiedFrozenFiles };
