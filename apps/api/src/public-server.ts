import Fastify from 'fastify';

import { getConfig } from './config';
import { Settings } from './database/app-settings';
import { apiKeyAuth } from './plugins/auth';
import anthropicPlugin from './routes/anthropic';
import modelsPlugin from './routes/models';
import openaiPlugin from './routes/openai';

// The tunnel must never expose the dashboard, credentials, or login routes.
export async function createPublicServer() {
	const app = Fastify({ logger: false, bodyLimit: 256 * 1024 * 1024 });
	const config = getConfig(Settings.get());
	Object.defineProperty(config, 'apiKey', { get: () => Settings.get().apiKey ?? undefined });
	app.decorate('config', config);
	app.addHook('onRequest', async (request, reply) => {
		const config = getConfig(Settings.get());
		if (!config.apiKey) {
			return reply.code(503).send({ error: 'Proxy API key is required' });
		}
		await apiKeyAuth(config).call(app, request, reply);
	});
	await app.register(anthropicPlugin);
	await app.register(openaiPlugin);
	await app.register(modelsPlugin);
	return app;
}
