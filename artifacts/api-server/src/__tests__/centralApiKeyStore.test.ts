import {expect,it,vi,afterEach} from 'vitest';
vi.mock('../lib/flubaProviderKeys.js',()=>({readFlubaProviderKey:vi.fn(),clearFlubaProviderKeyCache:vi.fn()}));
import {readFlubaProviderKey} from '../lib/flubaProviderKeys.js';
import {getApiKey,getAllConfiguredProviders,saveApiKey} from '../lib/apiKeyStore.js';
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
it('selects the central key and official endpoint even when retired Replit and deployment keys exist',async()=>{
 vi.stubEnv('OPENAI_API_KEY','revoked-local-placeholder');vi.stubEnv('AI_INTEGRATIONS_OPENAI_API_KEY','old-proxy-placeholder');vi.stubEnv('AI_INTEGRATIONS_OPENAI_BASE_URL','https://old-proxy.invalid');
 vi.mocked(readFlubaProviderKey).mockResolvedValue('central-provider-placeholder');
 expect(await getApiKey('openai')).toEqual({key:'central-provider-placeholder',baseUrl:'https://api.openai.com/v1'});
 expect(readFlubaProviderKey).toHaveBeenCalledWith('OPENAI_API_KEY');
 expect((await getAllConfiguredProviders()).every(p=>p.source==='fluba'&&p.maskedKey==='Managed in Fluba')).toBe(true);
});
it('cannot reinstate site overrides and does not borrow shared credentials for a custom endpoint',async()=>{
 await expect(saveApiKey('openai','old-site-placeholder','OpenAI')).rejects.toThrow('Fluba Cortex');
 expect(await getApiKey('custom-provider')).toBeNull();expect(readFlubaProviderKey).not.toHaveBeenCalled();
});
