/** Provider credentials are owned by Fluba Cortex; site overrides are never read. */
import { PROVIDER_BASE_URLS } from "./providers/types.js";
import { readFlubaProviderKey, type ProviderSecretName } from "./flubaProviderKeys.js";
export interface ProviderKeyInfo { id:string; label:string; maskedKey:string; baseUrl?:string; source:"fluba"; updatedAt?:string; }
const PROVIDERS:Record<string,{name:ProviderSecretName;label:string}>={
  openai:{name:"OPENAI_API_KEY",label:"OpenAI"}, anthropic:{name:"ANTHROPIC_API_KEY",label:"Anthropic (Claude)"},
  grok:{name:"XAI_API_KEY",label:"xAI Grok"}, gemini:{name:"GEMINI_API_KEY",label:"Google Gemini"},
};
export async function getApiKey(providerId:string):Promise<{key:string;baseUrl?:string}|null> {
  if (!Object.hasOwn(PROVIDERS,providerId)) return null;
  const key=await readFlubaProviderKey(PROVIDERS[providerId]!.name);
  return key ? {key,baseUrl:PROVIDER_BASE_URLS[providerId]} : null;
}
export async function getAllConfiguredProviders():Promise<ProviderKeyInfo[]> {
  const rows=await Promise.all(Object.entries(PROVIDERS).map(async([id,p])=>{
    const credentials=await getApiKey(id);
    return credentials ? {id,label:p.label,maskedKey:"Managed in Fluba",baseUrl:credentials.baseUrl,source:"fluba" as const} : null;
  }));
  return rows.filter((row):row is NonNullable<typeof row>=>row!==null);
}
