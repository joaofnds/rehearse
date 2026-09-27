/**
 * A record the server answered is not there. The query client does not retry
 * one, since a second request gets the same answer.
 */
export class RecordNotFoundError extends Error {
	public override name = "RecordNotFoundError";
}
