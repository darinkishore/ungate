import { z } from 'zod';

import { OAuth } from './auth/oauth';
import { OpenAIOAuthService } from './auth/openai/openai-oauth-service';
import { config } from './config';
import { ModelMappings } from './database/model-mappings';

import type { ModelMappingConfig } from '@ungate/shared';

const prefix = 'Ungate: ';
const claudeCatalogue = z.object({
	data: z.array(z.object({ id: z.string().min(1), display_name: z.string().min(1) })),
	has_more: z.boolean().optional()
});
const openaiCatalogue = z.object({
	models: z.array(
		z.object({
			slug: z.string().min(1),
			display_name: z.string().min(1),
			visibility: z.string(),
			supported_in_api: z.boolean().optional()
		})
	)
});

export type SubscriptionProvider = 'claude' | 'openai';

async function fetchCatalogue(url: string, headers: Record<string, string>, provider: SubscriptionProvider): Promise<unknown> {
	const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
	if (!response.ok) {
		// Never include a provider response body or credentials in the error.
		throw new Error(`${provider} model catalogue returned HTTP ${response.status}`);
	}

	return response.json();
}

export class SubscriptionModels {
	static parseCatalogue(provider: SubscriptionProvider, value: unknown): { id: string; label: string }[] {
		if (provider === 'claude') {
			const catalogue = claudeCatalogue.parse(value);
			if (catalogue.has_more) throw new Error('Claude model catalogue was paginated; no models were changed');

			return catalogue.data.map((model) => ({ id: model.id, label: model.display_name }));
		}

		return openaiCatalogue
			.parse(value)
			.models.filter((model) => model.visibility === 'list' && model.supported_in_api !== false)
			.map((model) => ({ id: model.slug, label: model.display_name }));
	}

	static async refresh(provider: SubscriptionProvider): Promise<ModelMappingConfig[]> {
		let catalogue: unknown;
		if (provider === 'claude') {
			const credentials = await OAuth.getValidToken();
			if (!credentials) throw new Error('Connect Claude before refreshing its models');
			catalogue = await fetchCatalogue(
				`${config.anthropic.apiUrl}/v1/models?limit=100`,
				{
					Authorization: `Bearer ${credentials.accessToken}`,
					'anthropic-version': '2023-06-01',
					'anthropic-beta': `${config.anthropic.beta.oauth},${config.anthropic.beta.claudeCode}`,
					'User-Agent': 'claude-cli/2.1.9 (external, claude-vscode, agent-sdk/0.2.7)',
					'x-app': 'cli'
				},
				provider
			);
		} else {
			const credentials = await OpenAIOAuthService.getValidToken();
			if (!credentials?.accountId) throw new Error('Connect ChatGPT before refreshing its models');
			// Older client versions return only the hidden auto-review model.
			catalogue = await fetchCatalogue(
				`${config.openai.codexUrl}/models?client_version=0.157.1`,
				{
					Authorization: `Bearer ${credentials.accessToken}`,
					'chatgpt-account-id': credentials.accountId,
					'User-Agent': 'codex_cli_rs/0.157.1'
				},
				provider
			);
		}

		const available = this.parseCatalogue(provider, catalogue);
		if (!available.length) throw new Error(`${provider} returned no visible models; no models were changed`);
		const existing = ModelMappings.list();
		const refreshed = available.map((model): ModelMappingConfig => {
			const id = `${prefix}${model.label}`;
			const previous = existing.find((item) => item.id === id && item.provider === provider);

			return {
				id,
				label: model.label,
				provider,
				upstreamModel: model.id,
				sortOrder: 0,
				reasoningBudget: previous?.reasoningBudget ?? null,
				serviceTier: previous?.serviceTier ?? null
			};
		});
		const retained = existing.filter((model) => model.provider !== provider || !model.id.startsWith(prefix));
		ModelMappings.replace([...refreshed, ...retained]);

		return ModelMappings.list();
	}
}
