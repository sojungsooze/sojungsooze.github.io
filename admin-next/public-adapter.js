import {PortfolioCloud,validateConfig} from './cloud.js';
import {signedDocument} from './cloud.js';
export async function loadCloudPortfolio(config,{gateway=null,activation=null,fetcher=fetch}={}){
  validateConfig(config);
  if(!activation){const response=await fetcher(new URL('./public-activation.json',import.meta.url),{cache:'no-store'});if(!response.ok)throw new Error('공개 연결 검증이 아직 완료되지 않았습니다.');activation=await response.json();}
  if(activation.enabled!==true||activation.projectUrl!==config.projectUrl||activation.schemaVersion!==1)throw new Error('확인된 포트폴리오 프로젝트가 아닙니다.');
  // No persistent/admin session in the visitor client.
  if(!gateway){const {createClient}=await import('./sdk.js');gateway=await createClient(config);}
  const cloud=new PortfolioCloud(config,gateway),result=await cloud.readPublic();
  return {document:await signedDocument(result.document,gateway,true),revision:result.revision};
}
