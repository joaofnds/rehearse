const JUDGED_SECTIONS = ["hardBlockers", "requirements", "dimensions"] as const;

interface StageSessionRequest {
	readonly runsDirectory: string;
	readonly projectsDirectory: string;
	readonly run: string;
	readonly stage: string;
}

type SessionLineKind = "user" | "assistant" | "tool" | "result";

interface SessionLine {
	/** The line of the provider's transcript the row comes from, from 1. */
	readonly line: number;
	readonly kind: SessionLineKind;
	readonly text: string;
}

type JudgedSection = (typeof JUDGED_SECTIONS)[number];

/** One piece of evidence the stage judge cited from the session's exchanges. */
interface CitedSpan {
	readonly section: JudgedSection;
	readonly item: string;
	/** The evidence's place in its item, as the evidence route numbers it. */
	readonly index: number;
	readonly claim: string;
	readonly quote?: string;
	/** The exchange the span sits in, from 1, where the evidence locates it. */
	readonly exchange?: number;
	/** Whose words in that exchange: the agent's message or the Product Owner's answer. */
	readonly field?: "message" | "productOwnerAnswer";
}

type StageSession =
	| {
			readonly state: "closed";
			readonly spans: readonly CitedSpan[];
			readonly lineCount?: number;
			/** The preserved transcript, relative to the runs directory's parent. */
			readonly transcriptPath?: string;
	  }
	| {
			readonly state: "running";
			readonly lineCount: number;
			readonly lines: readonly SessionLine[];
			readonly latestToolCall?: string;
	  }
	| { readonly state: "not-started" }
	| { readonly state: "untracked" };

/** What one content block of a transcript message reads as. */
type TranscriptBlock =
	| { readonly kind: "text" | "tool" | "result"; readonly text: string }
	| { readonly kind: "other" };

interface TranscriptWindow {
	readonly lineCount: number;
	readonly window: readonly string[];
}

export type {
	StageSessionRequest,
	SessionLineKind,
	SessionLine,
	CitedSpan,
	StageSession,
	TranscriptBlock,
	TranscriptWindow,
};

export { JUDGED_SECTIONS as default };
