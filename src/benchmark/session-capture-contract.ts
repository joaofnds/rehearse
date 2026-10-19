class CaptureError extends Error {
	public override name = "CaptureError";
}

interface ResolvedSession {
	readonly sessionId: string;
	readonly path: string;
}

interface CapturedPrefix {
	readonly sha256: string;
	readonly lines: number;
}

interface TranscriptPrefixCapture {
	readonly sourcePath: string;
	readonly destinationPath: string;
	readonly cut: number;
}
export { CaptureError as default };
export type { ResolvedSession, CapturedPrefix, TranscriptPrefixCapture };
