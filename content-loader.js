// NOT ACTIVE. The activation tool installs this only after real cloud verification.
(function(root){
  'use strict';
  const fallback=root.SOJUNG_PORTFOLIO_DATA,model=root.PortfolioAdminModel,base=document.currentScript.src;
  root.SOJUNG_CONTENT_READY=(async()=>{
    if(root.SOJUNG_PREVIEW_DATA===true)return fallback;
    if(!model)return fallback;
    try{
      const [{cloudConfig},{loadCloudPortfolio}]=await Promise.all([import(new URL('admin-next/config.js',base).href),import(new URL('admin-next/public-adapter.js',base).href)]);
      let timer;const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Cloud load deadline')),6000);});let result;
      try{result=await Promise.race([loadCloudPortfolio(cloudConfig),deadline]);}finally{clearTimeout(timer);}
      const errors=model.validatePublicContent(result.document,fallback);if(errors.length)throw new Error(errors.join(' / '));
      root.SOJUNG_CONTENT_STATUS={source:'supabase',revision:result.revision};return model.normalizeFilters({...model.clone(fallback),filterCategories:result.document.filterCategories,projects:result.document.projects});
    }catch(error){console.warn('온라인 포트폴리오를 읽지 못해 기존 공개 데이터를 사용합니다.',error.message);}
    try{
      const response=await fetch(new URL('data/portfolio-content.json',base),{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error('HTTP '+response.status);const text=await response.text();if(text.length>2*1024*1024)throw new Error('JSON size limit');
      const content=JSON.parse(text.replace(/^\uFEFF/,'')),errors=model.validatePublicContent(content,fallback);if(errors.length)throw new Error(errors.join(' / '));
      root.SOJUNG_CONTENT_STATUS={source:'public-json'};return model.normalizeFilters({...model.clone(fallback),filterCategories:content.filterCategories,projects:content.projects});
    }catch(error){root.SOJUNG_CONTENT_STATUS={source:'fallback',error:error.message};return fallback;}
  })();
})(window);
