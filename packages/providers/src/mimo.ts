import { OpenAICompatibleProvider } from './openai-compatible-client.js';

export type MimoRegion = 'cn' | 'sgp' | 'ams';

export const MIMO_REGIONS: Record<MimoRegion, string> = {
  cn: 'https://token-plan-cn.xiaomimimo.com/v1',
  sgp: 'https://token-plan-sgp.xiaomimimo.com/v1',
  ams: 'https://token-plan-ams.xiaomimimo.com/v1',
};

export interface MimoOptions {
  region?: MimoRegion;
}

export class MimoProvider extends OpenAICompatibleProvider {
  constructor(options: MimoOptions = {}) {
    const region = options.region ?? 'sgp';
    super({
      id: 'mimo',
      name: 'MiMo',
      baseURL: MIMO_REGIONS[region],
      defaultModel: 'mimo-v2.5',
      freeTier: true,
    });
  }
}