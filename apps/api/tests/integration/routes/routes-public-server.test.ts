import { expect, it } from 'vitest';

import { Settings } from 'src/database/app-settings';
import { createPublicServer } from 'src/public-server';

it('requires a key and never exposes administration through the public listener', async () => {
	Settings.get();
	Settings.update({ apiKey: 'test-proxy-key', models: [] });
	const app = await createPublicServer();
	try {
		for (const url of ['/v1/models', '/settings', '/auth/openai/start']) {
			expect((await app.inject({ url })).statusCode).toBe(403);
		}
		const headers = { authorization: 'Bearer test-proxy-key' };
		expect((await app.inject({ url: '/v1/models', headers })).statusCode).toBe(200);
		for (const url of ['/settings', '/auth/openai/start', '/auth/claude/status', '/health']) {
			expect((await app.inject({ url, headers })).statusCode).toBe(404);
		}
		Settings.update({ apiKey: null });
		expect((await app.inject({ url: '/v1/models', headers })).statusCode).toBe(503);
	} finally {
		await app.close();
	}
});
