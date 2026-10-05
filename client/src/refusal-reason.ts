import { z } from "zod";

const refusalBodySchema = z.object({ error: z.string() });

/** The `{ error }` a refusal declares, or nothing for any other body. */
function declaredError(text: string): string | undefined {
	try {
		const body = refusalBodySchema.safeParse(JSON.parse(text));

		return body.success ? body.data.error : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Why the server refused a request. A route's refusal and the API's error
 * handler answer `{ error }`, whatever the status, so the reason is read from
 * the body. Anything else, the request guard's plain-text 403 included, is
 * shown as the server sent it.
 */
export async function refusalReason(
	response: Readonly<{ text: () => Promise<string> }>,
): Promise<string> {
	const text = await response.text();

	return declaredError(text) ?? text;
}
