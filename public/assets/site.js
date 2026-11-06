import {initialPreviewState,transitionPreview,readPersonaReference} from './preview-state.js';

/** Browser UX is a *reference preview*. ChatGPT or another client performs roleplay. */
const draw = document.querySelector('#draw');
const stage = document.querySelector('#encounter-stage');
const card = document.querySelector('#persona-card');
const status = document.querySelector('#draw-status');
const kind = document.querySelector('#demo-kind');
const name = document.querySelector('#demo-name');
const line = document.querySelector('#demo-line');
const sourceLink = document.querySelector('#persona-source');
const qidLabel = document.querySelector('#persona-qid');
let preview = initialPreviewState();

const labels = {
  idle:'MCPを呼び出すと、Wikidata由来の人物参照がここに表示されます。',
  loading:'Wikidataから人物参照を取得しています…',
  reference_ready:'出典付きの人物参照を取得しました。人格への切替は接続したAI側で行います。',
  access_denied:'この環境からMCPに接続できません。ChatGPT側のプラグイン接続をご確認ください。',
  rate_limited:'アクセスが集中しています。しばらくしてから再試行してください。',
  empty:'対象人物が見つかりませんでした。再試行できます。',
  error:'人物情報を取得できませんでした。再試行できます。'
};
const shorten = (description,max) =>
  description.length > max ? description.slice(0,max-1)+'…' : description;

function dispatch(event) {
  preview = transitionPreview(preview,event);
  render();
}
function render() {
  const phase=preview.phase;
  const busy=phase==='loading';
  draw.disabled=busy;
  draw.textContent=busy?'参照を取得中…':'MCPで実際に人物を抽選';
  card.setAttribute('aria-busy',String(busy));
  stage.classList.toggle('shuffling',busy);
  stage.dataset.previewState=phase;
  status.textContent=labels[phase];
  sourceLink.hidden=true;
  qidLabel.hidden=true;
  if(phase==='reference_ready'){
    const p=preview.persona;
    kind.textContent=(p.kind==='real'?'実在人物':'架空キャラクター')+
      (p.source_mode==='wikidata_live'?' · LIVE WIKIDATA':' · 保存済み参照');
    name.textContent=p.name;
    line.textContent=shorten(p.description||'出典付きの人物参照を取得しました。',100);
    sourceLink.href=p.article_url;
    sourceLink.hidden=false;
    qidLabel.textContent=p.qid;
    qidLabel.hidden=false;
  }else if(phase==='loading'){
    kind.textContent='REFERENCE REQUEST';
    name.textContent='人物を検索中';
    line.textContent='実際のMCPに問い合わせています。';
  }else{
    kind.textContent=phase==='idle'?'WIKIDATA REFERENCES':'CONNECTION STATUS';
    name.textContent=phase==='idle'?'まだ見ぬ、誰か。':'参照を取得できません';
    line.textContent=phase==='idle'?'人物情報はこのボタンを押すと取得します。':preview.message;
  }
}
draw.addEventListener('click',async()=>{
  if(preview.phase==='loading')return;
  dispatch({type:'REQUEST'});
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch('/mcp',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        jsonrpc:'2.0',id:1,method:'tools/call',
        params:{name:'random_persona',arguments:{kind:'both',language:'ja'}}
      }),
      credentials:'omit',
      signal:controller.signal
    });
    if(response.status===401||response.status===403){
      dispatch({type:'ACCESS_DENIED'});return;
    }
    if(response.status===429){dispatch({type:'RATE_LIMIT'});return;}
    if(!response.ok)throw Error('MCP HTTP '+response.status);
    const payload=await response.json();
    const p=readPersonaReference(payload);
    if(!p){dispatch({type:'NO_MATCH'});return;}
    dispatch({type:'READY',persona:p});
  }catch(error){
    // No fabricated characters or silent fallback to the former five-card demo.
    console.warn('Persona preview unavailable:',error instanceof Error?error.name:'request_failed');
    dispatch({type:'FAIL'});
  }finally{clearTimeout(timeout);}
});
const copyButton=document.querySelector('#copy-prompt');
copyButton.addEventListener('click',async()=>{
 const copyStatus=document.querySelector('#copy-status');
 try{
  await navigator.clipboard.writeText('ランダムな人物になりきって話して');
  copyStatus.textContent='コピーしました。対応するChatGPTでご利用ください。';
 }catch{
  copyStatus.textContent='コピーできませんでした。表示された文章を選択してコピーしてください。';
 }
});
render();
