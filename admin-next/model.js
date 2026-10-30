export const clone=value=>JSON.parse(JSON.stringify(value));
export const DEFAULT_CATEGORIES=[{id:'vlog',name:'VLOG'},{id:'short',name:'SHORT FORM'},{id:'brand',name:'BRAND'}];
export const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
export function youtubeId(value){
  try{const u=new URL(value),host=u.hostname.replace(/^www\./,'');if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return '';
    const p=u.pathname.split('/').filter(Boolean),id=host==='youtu.be'?p[0]:['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host)?p[0]==='watch'?u.searchParams.get('v'):['embed','shorts','live'].includes(p[0])?p[1]:'':'';
    return /^[\w-]{11}$/.test(id||'')?id:'';
  }catch{return '';}
}
// An explicit startTime opts in; legacy `seconds` values stay image-only.
export function parseStillStartTime(value){
  if(typeof value!=='string'||value.length>16)return null;
  const time=value.trim();
  if(!/^\d+:[0-5]\d$/.test(time)&&!/^\d+:[0-5]\d:[0-5]\d$/.test(time))return null;
  const seconds=time.split(':').reduce((total,part)=>total*60+Number(part),0);
  return Number.isSafeInteger(seconds+180)?seconds:null;
}
export function normalizeDocument(input){
  const data=clone(input?.data||input);
  if(!data||!Array.isArray(data.projects))throw new Error('프로젝트 데이터 형식을 확인하세요.');
  const categories=data.filterCategories===undefined?clone(DEFAULT_CATEGORIES):data.filterCategories;
  const projects=data.projects.map(p=>{
    const project=clone(p);
    if(project.filterCategoryIds===undefined){const label=((p.category||'')+' '+(p.type||'')).toLowerCase();project.filterCategoryIds=DEFAULT_CATEGORIES.filter(c=>label.includes(c.id==='short'?'short':c.id)).map(c=>c.id).filter(id=>categories.some(c=>c.id===id));}
    return project;
  });
  return {schemaVersion:1,filterCategories:categories,projects};
}
export const PORTFOLIO_BUCKET='sojung-portfolio-assets';
const STORAGE_PREFIX='storage://'+PORTFOLIO_BUCKET+'/';
export const storageReference=(path)=>STORAGE_PREFIX+path;
export function storagePath(reference){
  if(typeof reference!=='string'||!reference.startsWith(STORAGE_PREFIX))return '';
  const path=reference.slice(STORAGE_PREFIX.length);
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(path)?path:'';
}
export function assertStoragePath(path){if(typeof path!=='string'||storagePath(storageReference(path))!==path)throw new Error('포트폴리오 전용 이미지 경로만 사용할 수 있습니다.');return path;}
export function validMedia(value,{image=false,projectId=''}={}){
  if(!value)return true;if(typeof value!=='string')return false;
  const stored=storagePath(value);if(stored)return !projectId||stored.startsWith(projectId+'/');
  if(value.startsWith('storage:')||/[\x00-\x20\\]/.test(value))return false;
  try{const decoded=decodeURIComponent(value);if(decoded.split(/[/?#]/).includes('..')||/[\x00-\x1f\\]/.test(decoded))return false;
    if(value.startsWith('assets/'))return !/[?#]/.test(value)&&(image?/\.(png|jpe?g|webp|gif|avif)$/i:/\.(png|jpe?g|webp|gif|avif|mp4|webm)$/i).test(value);
    const url=new URL(value);
    // Never follow another shared-project bucket URL. Cloud images use our canonical reference.
    if(image&&url.hostname.endsWith('.supabase.co')&&url.pathname.startsWith('/storage/v1/'))return false;
    return url.protocol==='https:'&&!url.username&&!url.password&&(!image||(!/[?&]token=/i.test(value)&&(!/\/[^/]+\.[a-z0-9]+$/i.test(url.pathname)||/\.(png|jpe?g|webp|gif|avif)$/i.test(url.pathname))));
  }catch{return false;}
}
export function validateDocument(doc){
  const errors=[],ids=new Set(),categoryIds=new Set(),names=new Set();
  if(!doc||doc.schemaVersion!==1||!Array.isArray(doc.projects)||!Array.isArray(doc.filterCategories))return ['프로젝트와 카테고리 데이터 형식을 확인하세요.'];
  if(doc.projects.length>200||doc.filterCategories.length>50)errors.push('프로젝트는 200개, 카테고리는 50개까지 등록할 수 있습니다.');
  const inspect=(value,depth=0)=>{if(depth>20){errors.push('데이터 중첩이 너무 깊습니다.');return;}if(value&&typeof value==='object')for(const key of Object.keys(value)){if(['__proto__','prototype','constructor'].includes(key))errors.push('허용하지 않는 데이터 키입니다.');else inspect(value[key],depth+1);}};inspect(doc);
  for(const c of doc.filterCategories){const name=typeof c?.name==='string'?c.name.trim().normalize('NFKC').toUpperCase():'';
    if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(c?.id||'')||c.id.toLowerCase()==='all'||categoryIds.has(c.id)||!name||name==='ALL'||name.length>60||names.has(name))errors.push('카테고리 ID와 이름은 중복될 수 없으며 ALL은 변경할 수 없습니다.');categoryIds.add(c?.id);names.add(name);
  }
  for(const p of doc.projects){
    if(!p||typeof p!=='object'||typeof p.title!=='string'||!p.title.trim()||p.title.length>160||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(p.id||'')||ids.has(p.id)){errors.push('프로젝트 제목 또는 고유 ID를 확인하세요.');continue;}ids.add(p.id);
    if(p.visible!==undefined&&typeof p.visible!=='boolean')errors.push(p.title+': 공개 여부를 확인하세요.');
    for(const key of ['number','category','type','role','tools','summary','description'])if(p[key]!==undefined&&(typeof p[key]!=='string'||p[key].length>6000))errors.push(p.title+': '+key+' 입력을 확인하세요.');
    if(p.url&&!youtubeId(p.url)&&!(/\.(mp4|webm)(?:[?#]|$)/i.test(p.url)&&validMedia(p.url)))errors.push(p.title+': YouTube URL을 확인하세요.');
    for(const key of ['thumbnail','videoFile','previewFile'])if(!validMedia(p[key],{image:key==='thumbnail',projectId:p.id})||(key!=='thumbnail'&&p[key]&&!/\.(mp4|webm)(?:[?#]|$)/i.test(p[key])))errors.push(p.title+': '+key+' 미디어 경로를 확인하세요.');
    if(!Array.isArray(p.filterCategoryIds)||new Set(p.filterCategoryIds).size!==p.filterCategoryIds.length||p.filterCategoryIds.some(id=>!categoryIds.has(id)))errors.push(p.title+': 필터 카테고리를 확인하세요.');
    if(p.points!==undefined&&(!Array.isArray(p.points)||p.points.some(point=>!Array.isArray(point)||point.length!==2||point.some(v=>typeof v!=='string'))))errors.push(p.title+': STORY / CUT / CAPTION 형식을 확인하세요.');
    if(p.stills!==undefined&&(!Array.isArray(p.stills)||p.stills.length>4)){errors.push(p.title+': 상세 이미지는 최대 4장입니다.');continue;}
    for(const f of p.stills||[]){if(!f||typeof f!=='object'||Array.isArray(f)){errors.push(p.title+': 상세 이미지 형식을 확인하세요.');continue;}
      if(!validMedia(f.image,{image:true,projectId:p.id}))errors.push(p.title+': 상세 이미지 경로를 확인하세요.');
      if(f.startTime!==undefined&&(typeof f.startTime!=='string'||(f.startTime.trim()!==''&&parseStillStartTime(f.startTime)===null)))errors.push(p.title+': 영상 시작 시간은 02:35 또는 01:02:30 형식으로 입력하세요.');
      for(const [key,max]of [['title',120],['caption',300],['description',300],['alt',300]])if(f[key]!==undefined&&(typeof f[key]!=='string'||f[key].length>max))errors.push(p.title+': 상세 이미지 '+key+'는 '+max+'자 이하로 입력하세요.');
    }
  }
  return errors;
}
export function publicDocument(doc){return {...clone(doc),projects:clone(doc.projects.filter(p=>p.visible!==false))};}
export function attachMedia(target,record,thumbnail=false){Object.defineProperty(target,thumbnail?'_thumbnailMedia':'_media',{value:record,writable:true,configurable:true,enumerable:false});}
export function pendingMedia(doc){const result=[];doc.projects.forEach(p=>{if(p._thumbnailMedia)result.push({projectId:p.id,field:'thumbnail',record:p._thumbnailMedia});(p.stills||[]).forEach((f,index)=>{if(f._media)result.push({projectId:p.id,field:'stills',index,record:f._media});});});return result;}
export function moveStill(project,index,delta){const target=index+delta;if(target<0||target>=project.stills.length)return;[project.stills[index],project.stills[target]]=[project.stills[target],project.stills[index]];}
export function categoryUsage(doc,id){return doc.projects.filter(p=>p.filterCategoryIds.includes(id));}
export function removeCategory(doc,id){const used=categoryUsage(doc,id);if(used.length)throw new Error('먼저 연결 프로젝트의 카테고리를 변경하세요: '+used.map(p=>p.title).join(', '));doc.filterCategories=doc.filterCategories.filter(c=>c.id!==id);}
export function captionKey(frame){return frame.caption===undefined&&frame.description!==undefined?'description':'caption';}
