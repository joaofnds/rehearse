import { z } from "zod";

const DEFAULT_PORT = 4173;

const MINIMUM_PORT = 0;

const MAXIMUM_PORT = 65_535;

const NONEMPTY_PORT_LENGTH = 1;

const serverConfigurationSchema = z
	.object({
		PORT: z
			.string()
			.trim()
			.min(NONEMPTY_PORT_LENGTH)
			.transform(Number)
			.pipe(z.number().int().min(MINIMUM_PORT).max(MAXIMUM_PORT))
			.default(DEFAULT_PORT),
	})
	.transform(({ PORT }) => ({ port: PORT }));

export { serverConfigurationSchema as default };
