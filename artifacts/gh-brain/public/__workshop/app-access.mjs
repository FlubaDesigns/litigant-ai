// Public client entrance for an independently deployed app. It grants no API
// identity and never changes the application's own authentication or roles.
const PUBLIC='https://us-central1-flubadesigns-25482.cloudfunctions.net/socialFooterApi';
const slot=site=>'fluba-workshop:'+site;
export function exitWorkshop(site,env=globalThis){try{env.sessionStorage.removeItem(slot(site));}catch{}}
export async function authorizeWorkshop(config,env=globalThis){
 const denied={allowed:false,privateVisit:false};
 if(config?.schema!=='site-workshop-app/v1'||!/^[-a-z0-9]+$/.test(config.site||'')||!/^[a-f0-9]{32}$/.test(config.generation||'')||!/^[a-f0-9]{64}$/.test(config.keyHash||''))return denied;
 const now=env.now?env.now():Date.now();let candidate=null;
 const match=/^#workshop=([a-f0-9]{32})\.([A-Za-z0-9_-]{43})$/.exec(env.location.hash);
 if(match){env.history.replaceState(null,'',env.location.pathname+env.location.search);if(match[1]===config.generation)candidate={generation:match[1],key:match[2],expires:now+8*3600000};}
 if(!candidate)try{candidate=JSON.parse(env.sessionStorage.getItem(slot(config.site))||'null');}catch{}
 if(candidate&&(candidate.generation!==config.generation||!Number.isFinite(candidate.expires)||candidate.expires<now))candidate=null;
 let state;
 try{const response=await env.fetch(PUBLIC+'?site='+encodeURIComponent(config.site)+'&view=workshop',{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)return denied;state=await response.json();}catch{return denied;}
 if(!state?.available||state.site!==config.site||state.generation!==config.generation)return denied;
 const homeRoute=(env.location.pathname==='/'||env.location.pathname==='/index.html')&&(!/^#(?:\/|!)/.test(env.location.hash)||env.location.hash==='#/');
 // This path grants no private capability and never stores a public viewing key.
 if(!candidate&&config.homepageSupported===true&&state.visibilityMode==='homepage'&&homeRoute)return{allowed:true,privateVisit:false,homepageVisit:true};
 let privateVisit=true;
 if(state.underConstruction===false){candidate={key:state.key};privateVisit=false;}
 if(!candidate||!/^[A-Za-z0-9_-]{43}$/.test(candidate.key||''))return denied;
 const bytes=await env.crypto.subtle.digest('SHA-256',new TextEncoder().encode(candidate.key));
 const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==config.keyHash){exitWorkshop(config.site,env);return denied;}
 if(privateVisit)try{env.sessionStorage.setItem(slot(config.site),JSON.stringify(candidate));}catch{}
 return{allowed:true,privateVisit};
}

