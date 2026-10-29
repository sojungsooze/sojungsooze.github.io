import {clone,canonical,normalizeDocument,validateDocument,storageReference,storagePath,publicDocument,pendingMedia,PORTFOLIO_BUCKET,assertStoragePath} from './model.js';
export const PORTFOLIO_RPC_NAMES=new Set(['portfolio_is_admin','portfolio_read_admin','portfolio_read_public','portfolio_register_media','portfolio_save']);
export function assertPortfolioRpc(name){if(!PORTFOLIO_RPC_NAMES.has(name))throw new Error('포트폴리오 전용 API만 사용할 수 있습니다.');return name;}
export const SDK_URL='https://esm.sh/@supabase/supabase-js@2.118.0';
export function validateConfig(config){
  if(!config?.enabled||!config.projectUrl||!config.publishableKey)throw new Error('관리자 연결을 준비 중입니다. 설정이 완료되면 로그인할 수 있어요.');
  let url;try{url=new URL(config.projectUrl);}catch{throw new Error('Supabase 프로젝트 주소 설정을 확인하세요.');}
  if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('사용 중인 Supabase 프로젝트의 HTTPS 주소를 확인하세요.');
  const key=config.publishableKey;
  if(key.startsWith('sb_publishable_sb_publishable_'))throw new Error('공개 키의 접두어가 중복되어 있어요. 연결 설정의 키를 다시 확인해 주세요.');
  if(key.startsWith('sb_secret_'))throw new Error('비밀키는 관리자 웹페이지에서 사용할 수 없습니다. 공개 키로 교체하세요.');
  if(!key.startsWith('sb_publishable_')){
    try{const part=key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');const data=JSON.parse(atob(part));if(data.role!=='anon')throw new Error();}
    catch{throw new Error('Publishable 또는 anon 공개 키만 사용할 수 있습니다.');}
  }
  if(config.bucket!==PORTFOLIO_BUCKET)throw new Error('포트폴리오 전용 sojung-portfolio-assets 저장소만 사용할 수 있습니다.');
  if(config.administratorUid&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(config.administratorUid))throw new Error('확인한 기존 관리자 UID를 설정하세요.');
}
export function friendlyError(error){
  const text=error?.message||String(error);
  if(/PORTFOLIO_CONFLICT|40001/.test(text)||error?.code==='40001')return '다른 창에서 먼저 저장했습니다. 입력은 유지됩니다. 새로고침 후 최신 내용을 확인하고 다시 저장하세요.';
  if(/42501|administrator access|row.level|not authorized|permission denied/i.test(text)||error?.code==='42501')return '이 계정에는 관리자 권한이 없습니다. 관리자 계정 설정을 확인해 주세요.';
  if(/invalid login credentials/i.test(text))return '이메일 또는 비밀번호를 확인하세요.';
  if(/Failed to fetch|NetworkError|fetch failed|timeout|aborted/i.test(text))return '연결을 확인한 뒤 다시 저장하세요. 응답이 끊긴 경우 저장 여부를 재확인하기 전에는 완료로 표시하지 않습니다.';
  return text;
}
const checked=({data,error})=>{if(error)throw error;return data;};
export async function createBrowserGateway(config,{createClient}={}){
  validateConfig(config);
  if(!createClient)({createClient}=await import(SDK_URL));
  const network=(input,options={})=>fetch(input,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000)});
  const admin=createClient(config.projectUrl,config.publishableKey,{global:{fetch:network},auth:{storageKey:'sojung-portfolio-admin-next-session',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  const visitor=createClient(config.projectUrl,config.publishableKey,{global:{fetch:network},auth:{storageKey:'sojung-portfolio-visitor',persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  return {
    auth:admin.auth,
    async rpc(name,args={},anonymous=false){assertPortfolioRpc(name);return checked(await (anonymous?visitor:admin).rpc(name,args).abortSignal(AbortSignal.timeout(25000)));},
    async upload(path,file){assertStoragePath(path);return checked(await admin.storage.from(PORTFOLIO_BUCKET).upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'}));},
    async download(path,anonymous=false){assertStoragePath(path);if(!anonymous)return checked(await admin.storage.from(PORTFOLIO_BUCKET).download(path));
      const url=admin.storage.from(PORTFOLIO_BUCKET).getPublicUrl(path).data.publicUrl,response=await network(url,{cache:'no-store'});if(!response.ok)throw new Error('공개 이미지 읽기 실패: HTTP '+response.status);return response.blob();},
    // Compatibility adapter name: public bucket URLs do not require signing or tokens.
    async sign(paths){return paths.map(path=>{assertStoragePath(path);const url=admin.storage.from(PORTFOLIO_BUCKET).getPublicUrl(path).data.publicUrl;if(!url)throw new Error('공개 이미지 주소를 확인하지 못했습니다.');return {path,signedUrl:url};});}
  };
}
export async function imageInfo(file){
  if(!(file instanceof Blob)||!file.size||file.size>15*1024*1024)throw new Error('PNG, JPG, WebP 이미지를 15MB 이하로 선택하세요.');
  const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer),ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
  let result;
  if(bytes.length>=33&&bytes.slice(0,8).every((v,i)=>v===[137,80,78,71,13,10,26,10][i])&&ascii(12,16)==='IHDR')result={type:'image/png',extension:'png',width:view.getUint32(16),height:view.getUint32(20)};
  else if(bytes[0]===255&&bytes[1]===216){
    for(let i=2;i+8<bytes.length;){if(bytes[i++]!==255)break;let marker=bytes[i++];while(marker===255)marker=bytes[i++];if(marker===217||marker===218)break;const size=view.getUint16(i);if(size<2||i+size>bytes.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){result={type:'image/jpeg',extension:'jpg',height:view.getUint16(i+3),width:view.getUint16(i+5)};break;}i+=size;
    }
  }else if(bytes.length>=30&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'){
    const kind=ascii(12,16);if(kind==='VP8X')result={width:1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16),height:1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)};
    if(kind==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42)result={width:view.getUint16(26,true)&16383,height:view.getUint16(28,true)&16383};
    if(kind==='VP8L'&&bytes[20]===47){const n=view.getUint32(21,true);result={width:(n&16383)+1,height:((n>>>14)&16383)+1};}if(result)Object.assign(result,{type:'image/webp',extension:'webp'});
  }
  if(!result||!result.width||!result.height||result.width>20000||result.height>20000||result.width*result.height>100000000)throw new Error('이미지 형식 또는 해상도를 확인하세요. PNG, JPG, WebP만 지원합니다.');
  if(file.type&&file.type!==result.type&&file.type!=='application/octet-stream')throw new Error('이미지 내용과 파일 형식이 다릅니다.');
  return result;
}
export async function sha256(blob){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');}
export async function signedDocument(doc,gateway,anonymous=false){
  const mapped=clone(doc),paths=new Set();
  for(const p of mapped.projects)for(const value of [p.thumbnail,...(p.stills||[]).map(f=>f.image)]){const path=storagePath(value);if(path)paths.add(path);}
  const signed=await gateway.sign([...paths],anonymous),lookup=new Map();
  for(const row of signed){if(row.error||!row.signedUrl||!row.path)throw new Error('저장된 이미지의 읽기 권한을 확인하지 못했습니다.');lookup.set(row.path,row.signedUrl);}
  for(const p of mapped.projects){const resolve=value=>{const path=storagePath(value);if(!path)return value;const url=lookup.get(path);if(!url)throw new Error('이미지 공개 경로 확인 실패: '+path);return url;};p.thumbnail=resolve(p.thumbnail);(p.stills||[]).forEach(f=>{f.image=resolve(f.image);});}
  return mapped;
}
export class PortfolioCloud {
  constructor(config,gateway){validateConfig(config);this.config=config;this.gateway=gateway;this.busy=false;this.operation=null;}
  async readAdmin(){const result=await this.gateway.rpc('portfolio_read_admin');if(!result||!Number.isSafeInteger(result.revision)||typeof result.initialized!=='boolean')throw new Error('관리자 데이터 응답을 확인할 수 없습니다.');
    const doc=normalizeDocument(result.document),errors=validateDocument(doc);if(errors.length)throw new Error(errors.join('\n'));return {...result,document:doc};}
  async readPublic(){const result=await this.gateway.rpc('portfolio_read_public',{},true);if(!result?.document||!Number.isSafeInteger(result.revision))throw new Error('아직 공개 데이터 이전이 완료되지 않았습니다.');
    const document=normalizeDocument(result.document),errors=validateDocument(document);if(errors.length)throw new Error(errors.join('\n'));if(document.projects.some(p=>p.visible===false))throw new Error('비공개 프로젝트가 공개 응답에 포함되어 있습니다.');return {...result,document};}
  async save(document,expectedRevision,onState=()=>{}){
    if(this.busy)throw new Error('이미 저장 중입니다. 완료될 때까지 기다려 주세요.');this.busy=true;
    let saveStage='validation',databaseSaved=false,adminVerified=false;
    try{
      const payload=clone(document),errors=validateDocument(payload);if(errors.length)throw new Error(errors.join('\n'));
      onState('이미지 저장 중...');
      for(const item of pendingMedia(document)){
        saveStage='image-validation';
        const {record,projectId,field,index}=item,info=await imageInfo(record.file);const hash=await sha256(record.file);
        record.path||=projectId+'/'+crypto.randomUUID()+'.'+info.extension;
        if(!record.verified){
          // An interrupted response may have left an immutable object. Verify it, never overwrite.
          saveStage='image-upload';
          if(!record.attempted){record.attempted=true;try{await this.gateway.upload(record.path,record.file.type===info.type?record.file:new Blob([record.file],{type:info.type}));delete record.lastError;}catch(error){record.lastError=error;}}
          saveStage='image-readback';
          let stored;try{stored=await this.gateway.download(record.path);}catch(error){record.attempted=false;if(record.lastError){saveStage='image-upload';throw record.lastError;}throw error;}
          if(stored.size!==record.file.size||await sha256(stored)!==hash)throw new Error('업로드 이미지 검증 실패. 기존 이미지와 입력은 유지됩니다.');
          saveStage='media-register';
          await this.gateway.rpc('portfolio_register_media',{p_path:record.path,p_project_id:projectId,p_sha256:hash});record.verified=true;
        }
        const p=payload.projects.find(p=>p.id===projectId);if(field==='thumbnail')p.thumbnail=storageReference(record.path);else p.stills[index].image=storageReference(record.path);
      }
      const signature=canonical(payload);if(this.operation?.signature!==signature)this.operation={signature,id:crypto.randomUUID()};
      onState('내용 저장 중...');
      saveStage='save-rpc';
      const result=await this.gateway.rpc('portfolio_save',{p_document:payload,p_expected_revision:expectedRevision,p_operation_id:this.operation.id});
      saveStage='save-response';
      if(!Number.isSafeInteger(result?.revision))throw new Error('저장 결과를 확인하지 못했습니다.');
      databaseSaved=true;
      onState('저장 내용 확인 중...');
      saveStage='admin-readback';
      const saved=await this.readAdmin();if(saved.revision!==result.revision||canonical(saved.document)!==signature)throw new Error('저장 후 재조회한 내용이 다릅니다. 입력을 유지했습니다. 최신 데이터를 확인하세요.');
      adminVerified=true;saveStage='public-readback';
      const published=await this.readPublic();if(published.revision!==result.revision||canonical(published.document)!==canonical(publicDocument(payload)))throw new Error('관리자 저장 후 공개 데이터 확인에 실패했습니다. 입력은 유지됩니다.');
      saveStage='image-urls';
      const rendered=await signedDocument(published.document,this.gateway,true);
      // Verify new public objects as a logged-out visitor, not with the admin session.
      saveStage='public-image-readback';
      for(const item of pendingMedia(document)){const bytes=await this.gateway.download(item.record.path,true);if(await sha256(bytes)!==await sha256(item.record.file))throw new Error('방문자 이미지 읽기 검증에 실패했습니다.');}
      this.operation=null;return {...saved,publicDocument:rendered,verified:true};
    }catch(cause){
      // Keep the original SQLSTATE for diagnosis, never log credentials or payloads.
      const error=new Error(cause?.message||String(cause),{cause});
      Object.assign(error,{code:cause?.code,status:cause?.status,saveStage,databaseSaved,adminVerified});throw error;
    }finally{this.busy=false;}
  }
}
