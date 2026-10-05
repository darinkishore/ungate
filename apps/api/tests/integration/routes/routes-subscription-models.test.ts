import Fastify from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';

import { OAuth } from 'src/auth/oauth';
import { ModelMappings } from 'src/database/model-mappings';
import settingsPlugin from 'src/routes/settings';
import { SubscriptionModels } from 'src/subscription-models';

import type { ModelMappingConfig } from '@ungate/shared';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it('imports the live catalogue, preserves user reasoning settings and keeps other providers', async () => {
	ModelMappings.replace([
		{
			id: 'Ungate: Sonnet',
			label: 'Sonnet',
			provider: 'claude',
			upstreamModel: 'old',
			sortOrder: 0,
			reasoningBudget: 'high',
			serviceTier: null
		},
		{
			id: 'Ungate: Removed',
			label: 'Removed',
			provider: 'claude',
			upstreamModel: 'old',
			sortOrder: 1,
			reasoningBudget: null,
			serviceTier: null
		},
		{
			id: 'custom',
			label: 'Custom',
			provider: 'openai',
			upstreamModel: 'gpt-test',
			sortOrder: 2,
			reasoningBudget: null,
			serviceTier: null
		}
	]);
	vi.spyOn(OAuth, 'getValidToken').mockResolvedValue({ accessToken: 'test', refreshToken: '', expiresAt: Date.now() + 60_000 });
	vi.stubGlobal(
		'fetch',
		vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'claude-new', display_name: 'Sonnet' }], has_more: false })))
	);
	const app = Fastify();
	await app.register(settingsPlugin);
	try {
		const response = await app.inject({ method: 'POST', url: '/models/refresh', payload: { provider: 'claude' } });
		expect(response.statusCode).toBe(200);
		const { models } = response.json<{ models: ModelMappingConfig[] }>();
		expect(models).toHaveLength(2);
		expect(models[0]).toMatchObject({ id: 'Ungate: Sonnet', upstreamModel: 'claude-new', reasoningBudget: 'high' });
		expect(models[1].id).toBe('custom');
	} finally {
		await app.close();
	}
});

it('leaves saved models intact when the provider fails and does not expose its body', async () => {
	const before = ModelMappings.list();
	vi.spyOn(OAuth, 'getValidToken').mockResolvedValue({ accessToken: 'test', refreshToken: '', expiresAt: Date.now() + 60_000 });
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private provider body', { status: 403 })));
	await expect(SubscriptionModels.refresh('claude')).rejects.toThrow('HTTP 403');
	expect(ModelMappings.list()).toEqual(before);
});

it('excludes hidden and non-API OpenAI models', () => {
	expect(
		SubscriptionModels.parseCatalogue('openai', {
			models: [
				{ slug: 'visible', display_name: 'Visible', visibility: 'list', supported_in_api: true },
				{ slug: 'review', display_name: 'Review', visibility: 'hide' },
				{ slug: 'disabled', display_name: 'Disabled', visibility: 'list', supported_in_api: false }
			]
		})
	).toEqual([{ id: 'visible', label: 'Visible' }]);
});

it('rejects a truncated Claude catalogue', () => {
	expect(() => SubscriptionModels.parseCatalogue('claude', { data: [], has_more: true })).toThrow('paginated');
});
