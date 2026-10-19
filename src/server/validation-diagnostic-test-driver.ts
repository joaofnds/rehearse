import type createAppServer from "#server/app";
import type { DiagnosticCase } from "#server/validation-diagnostic-cases";

class DiagnosticDriver {
	public constructor(
		private readonly app: Readonly<
			Pick<ReturnType<typeof createAppServer>, "request">
		>,
		private readonly port: number,
	) {}

	public async sendRaw(request: DiagnosticCase): Promise<Response> {
		return await this.app.request(request.path, {
			body: JSON.stringify(request.body),
			headers: {
				"content-type": "application/json",
				host: `127.0.0.1:${String(this.port)}`,
				origin: `http://127.0.0.1:${String(this.port)}`,
				"sec-fetch-site": "same-origin",
			},
			method: request.method,
		});
	}
}

export { DiagnosticDriver as default };
