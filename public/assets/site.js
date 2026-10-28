'use strict';
const demoPeople = [
  {art:'history',kind:'HISTORY · 創作デモ',name:'星を読む学者',line:'遠い昔の空にも、同じ星があった。'},
  {art:'literature',kind:'LITERATURE · 創作デモ',name:'物語を集める旅人',line:'まだ地図にない、心の景色を探して。'},
  {art:'anime',kind:'ANIME · 創作デモ',name:'光の扉を探す青年',line:'冒険は、最初の一歩から。'},
  {art:'fantasy',kind:'FANTASY · 創作デモ',name:'星図の魔法使い',line:'知らないことは、新しい魔法の入口。'},
  {art:'scifi',kind:'SCI-FI · 創作デモ',name:'未来の航海士',line:'この星の外にも、問いは続いている。'}
];
const draw = document.querySelector('#draw');
let previous = -1;
draw.addEventListener('click', async () => {
  if (draw.disabled) return;
  draw.disabled = true;
  const card = document.querySelector('#persona-card');
  card.setAttribute('aria-busy','true');
  document.querySelector('#draw-status').textContent='扉の向こうに、誰がいるだろう。';
  document.querySelector('#encounter-stage').classList.add('shuffling');
  const choices=demoPeople.map((p,i)=>i).filter(i=>i!==previous);
  const value=new Uint32Array(1);crypto.getRandomValues(value);
  const selected=choices[value[0]%choices.length], p=demoPeople[selected];
  const image=new Image();image.src='/assets/'+p.art+'-600.webp';
  try {
    await Promise.all([image.decode(),new Promise(resolve=>setTimeout(resolve,matchMedia('(prefers-reduced-motion: reduce)').matches?0:650))]);
    const art=document.querySelector('#demo-art');art.src=image.src;art.alt=p.name+'を描いたオリジナルのイラスト';
    document.querySelector('#demo-kind').textContent=p.kind;
    document.querySelector('#demo-name').textContent=p.name;
    document.querySelector('#demo-line').textContent=p.line;
    document.querySelector('#draw-status').textContent=p.name+'に出会いました。これは創作人物によるデモです。';
    draw.replaceChildren(document.createTextNode('もう一度めくる ↗'));previous=selected;
  } catch (error) {console.warn('Demo image unavailable:', error.message);document.querySelector('#draw-status').textContent='画像を読み込めませんでした。もう一度お試しください。';}
  finally {document.querySelector('#encounter-stage').classList.remove('shuffling');card.removeAttribute('aria-busy');draw.disabled=false;}
});
document.querySelector('#copy-prompt').addEventListener('click', async () => {
  const status=document.querySelector('#copy-status');
  try {await navigator.clipboard.writeText('ランダムな人物と話したい');status.textContent='コピーしました。接続済みのChatGPTで貼り付けてください。';}
  catch {status.textContent='コピーできませんでした。「ランダムな人物と話したい」を選択してコピーしてください。';}
});
