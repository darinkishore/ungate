import { expect, it } from 'vitest';

import { Settings } from 'src/database/app-settings';
import { createPublicServer } from 'src/public-server';

it('requires a key and never exposes administration through the public listener', async () => {
	Settings.get();
	Settings.update({ apiKey: 'test-proxy-key', models: [] });
	const app = await createPublicServer();
	try {
		for (const url of ['/v1/models', '/settings', '/auth/openai/start']) {
			const response = await app.inject({ url });
			expect(response.statusCode).toBe(403);
		}
		const headers = { authorization: 'Bearer test-proxy-key' };
		const models = await app.inject({ url: '/v1/models', headers });
		expect(models.statusCode).toBe(200);
		for (const url of ['/settings', '/auth/openai/start', '/auth/claude/status', '/health']) {
			const response = await app.inject({ url, headers });
			expect(response.statusCode).toBe(404);
		}
		const refresh = await app.inject({ method: 'POST', url: '/models/refresh', headers, payload: { provider: 'claude' } });
		expect(refresh.statusCode).toBe(404);
		Settings.update({ apiKey: null });
		const noKey = await app.inject({ url: '/v1/models', headers });
		expect(noKey.statusCode).toBe(503);
	} finally {
		await app.close();
	}
});
