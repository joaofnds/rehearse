const HTTP_STATUS = {
	badRequest: 400,
	conflict: 409,
	created: 201,
	notFound: 404,
	ok: 200,
} as const;

export { HTTP_STATUS as default };
