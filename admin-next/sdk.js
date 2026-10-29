import {SDK_URL,validateConfig,assertPortfolioRpc} from './cloud.js';
import {PORTFOLIO_BUCKET,assertStoragePath} from './model.js';
export async function createClient(config){
  validateConfig(config);const {createClient:make}=await import(SDK_URL),network=(input,options={})=>fetch(input,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000)}),client=make(config.projectUrl,config.publishableKey,{global:{fetch:network},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'sojung-portfolio-public-site'}});
  return {
    async rpc(name,args={}){assertPortfolioRpc(name);if(name!=='portfolio_read_public')throw new Error('방문자는 공개 데이터만 읽을 수 있습니다.');const {data,error}=await client.rpc(name,args).abortSignal(AbortSignal.timeout(8000));if(error)throw error;return data;},
    async sign(paths){return paths.map(path=>{assertStoragePath(path);return {path,signedUrl:client.storage.from(PORTFOLIO_BUCKET).getPublicUrl(path).data.publicUrl};});}
  };
}
