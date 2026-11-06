/** An explicit, side-effect-free state machine for the site's optional MCP preview.
 * The preview shows *references*, never a simulated ChatGPT conversation.
 */
export const PREVIEW_STATES=Object.freeze([
 'idle','loading','reference_ready','access_denied','rate_limited','empty','error'
]);
const QID=/^Q[1-9][0-9]{0,11}$/;
const validQid=value=>typeof value==='string'&&QID.exec(value)?.[0]===value;
export function initialPreviewState(){
 return Object.freeze({phase:'idle',persona:null,message:''});
}
function output(phase,persona=null,message=''){
 return Object.freeze({phase,persona,message});
}
export function transitionPreview(state,event){
 if(!state||!PREVIEW_STATES.includes(state.phase)||!event||typeof event.type!=='string')
  throw new TypeError('Invalid preview transition');
 if(event.type==='RESET')return initialPreviewState();
 if(event.type==='REQUEST'){
  if(state.phase==='loading')return state;
  return output('loading');
 }
 if(state.phase!=='loading')throw new Error('Preview completion requires loading phase');
 if(event.type==='READY'){
  if(!event.persona||!validQid(event.persona.qid)||!event.persona.name||
    !validArticleUrl(event.persona.article_url))throw new TypeError('Invalid reference');
  return output('reference_ready',event.persona);
 }
 if(event.type==='ACCESS_DENIED')return output('access_denied',null,'プラットフォーム側でMCPへのアクセスが制限されています。');
 if(event.type==='RATE_LIMIT')return output('rate_limited',null,'アクセスが集中しています。しばらくして再試行してください。');
 if(event.type==='NO_MATCH')return output('empty',null,'条件に合う人物が見つかりませんでした。');
 if(event.type==='FAIL')return output('error',null,'MCPから人物情報を取得できませんでした。');
 throw new Error('Unknown preview event: '+event.type);
}
/** Reject unexpected URL hosts and untrusted links even when server metadata is malformed. */
export function readPersonaReference(rpc){
 if(!rpc||rpc.error||rpc.result?.isError)throw Error('MCP returned an error');
 const data=rpc.result?.structuredContent;
 if(!data||data.status!=='ok'){
  if(data?.status==='no_match')return null;
  throw Error('Invalid MCP persona response');
 }
 const p=data.persona;
 if(!p||typeof p.qid!=='string'||!validQid(p.qid)||
    typeof p.name!=='string'||!p.name.trim()||p.name.length>160||
    !['real','fictional'].includes(p.kind)||!Array.isArray(p.sources))
  throw Error('Invalid persona fields');
 const link=p.sources.find(s=>s?.purpose==='article'&&
  typeof s.url==='string'&&validArticleUrl(s.url));
 if(!link)throw Error('No safe article link');
 return Object.freeze({
  qid:p.qid,
  name:p.name,
  kind:p.kind,
  description:typeof p.description==='string'?p.description.slice(0,280):'',
  article_url:link.url,
  source_mode:data.source_mode??'unknown'
 });
}
function validArticleUrl(raw){
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.port||
     url.search||url.hash||
     !['ja.wikipedia.org','en.wikipedia.org'].includes(url.hostname)||
     !url.pathname.startsWith('/wiki/')||
     /%2f|%5c|%00/i.test(url.pathname))return false;
  const title=decodeURIComponent(url.pathname.slice(6));
  if(!title.trim()||/[\\\u0000-\u001f\u007f]/.test(title))return false;
  if(/^(?:Special|Category|Template|Help|File|Image|Wikipedia|Portal|Draft|Module|Talk|User|特別|カテゴリ|カテゴリー|ファイル|画像|テンプレート|利用者|ノート)[:：]/i.test(title))return false;
  return !title.split('/').some(part=>part==='.'||part==='..');
 }catch{return false;}
}
