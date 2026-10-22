// Describe a credited book award. Never evaluates a line or calculates a payout.
export function graveWinDetails(win,graves){
  const positions=win.positions.flatMap(p=>{
    const multiplier=graves[p.reel]?.[p.row-1]||0;
    return multiplier?[{...p,multiplier}]:[];
  });
  if(!positions.length||!Number.isSafeInteger(win.meta?.multiplier)||!Number.isSafeInteger(win.meta?.winWithoutMult))return null;
  return {positions,multiplier:win.meta.multiplier,base:win.meta.winWithoutMult,
    raw:win.rawWin,credited:win.win,capped:win.win<win.rawWin};
}

export function createBonusPresentation(root,{clock,cells,readout,format,text,renderCell,character}){
  const $=s=>root.querySelector(s);
  const make=(tag,className,parent)=>{const el=document.createElement(tag);el.className=className;parent?.append(el);return el;};
  const hud=$('#feature-counter')||make('div','feature-counter',root);
  hud.id='feature-counter';hud.className='feature-counter bonus-hud';hud.hidden=true;hud.replaceChildren();
  const title=make('div','bonus-hud-title',hud),name=make('span','bonus-hud-name',title),ladder=make('div','grave-ladder',title);
  const ranks=[2,3,5,10].map(value=>{const el=make('span','grave-rank',ladder);el.dataset.level=String(value);el.textContent='×'+value;return el;});
  const spins=make('div','bonus-hud-spins',hud),spinsLabel=make('span','bonus-hud-label',spins),count=make('strong','bonus-hud-count',spins);count.id='feature-count';
  const award=make('div','bonus-hud-award',hud),awardLabel=make('span','bonus-hud-label',award),amount=make('strong','bonus-hud-amount',award);
  const toast=make('div','grave-toast',$('.reels-shell'));toast.hidden=true;toast.setAttribute('role','status');
  const formula=make('div','grave-formula',readout);formula.hidden=true;
  const terms=make('div','grave-addends',formula),calculation=make('div','grave-calculation',formula),equation=make('div','grave-equation',calculation),capNote=make('div','grave-cap-note',calculation);
  let state=null,contribution=null,toastKey=null;
  function refreshText(){
    name.textContent=text('bonusName');spinsLabel.textContent=text('freeSpins');awardLabel.textContent=text('roundAward');
    ladder.setAttribute('aria-label',text('graveLadder'));
    if(state)amount.textContent=format(state.total);
    if(toastKey)toast.textContent=text(toastKey);
    if(!contribution)return;
    terms.replaceChildren();
    const label=make('span','grave-formula-label',terms);label.textContent=text('graveContribution');
    contribution.positions.forEach((p,i)=>{
      if(i){const plus=make('span','grave-plus',terms);plus.textContent='+';}
      const chip=make('b','grave-term',terms);chip.textContent='×'+p.multiplier;chip.dataset.reel=String(p.reel);chip.dataset.row=String(p.row);
    });
    const total=make('strong','grave-factor',terms);total.textContent='= ×'+contribution.multiplier;
    equation.textContent=`${format(contribution.base)} × ${contribution.multiplier} = ${format(contribution.raw)}`;
    capNote.hidden=!contribution.capped;
    capNote.textContent=contribution.capped?text('cappedAward',{amount:format(contribution.credited)}):'';
    formula.setAttribute('aria-label',text('graveSumExplanation'));
  }
  function render(next,{holdBonus=false}={}){
    state=next;
    const active=next.totalFs>0&&(!next.bonusEnded||holdBonus);
    root.dataset.bonus=active?'active':next.totalFs?'complete':'base';hud.hidden=!active;
    count.textContent=`${next.fs} / ${next.totalFs}`;
    hud.dataset.ordinal=String(next.fs);hud.dataset.total=String(next.totalFs);
    const highest=Math.max(0,...next.graves.flat());
    ranks.forEach(el=>{const value=Number(el.dataset.level);el.classList.toggle('attained',active&&value<=highest);el.classList.toggle('current',active&&value===highest);});
    refreshText();
  }
  function clearContributions(){
    contribution=null;formula.hidden=true;root.classList.remove('presenting-grave-win');
    cells.flat().forEach(cell=>cell.classList.remove('grave-contributing'));
  }
  function showContribution(win,graves){
    clearContributions();contribution=graveWinDetails(win,graves);
    if(!contribution)return;
    formula.hidden=false;root.classList.add('presenting-grave-win');
    contribution.positions.forEach(p=>cells[p.reel][p.row-1].classList.add('grave-contributing'));
    formula.dataset.multiplier=String(contribution.multiplier);formula.dataset.base=String(contribution.base);
    formula.dataset.raw=String(contribution.raw);formula.dataset.credited=String(contribution.credited);
    refreshText();
  }
  async function animateContribution(duration=520){
    if(!contribution)return;
    await Promise.all(contribution.positions.map(p=>clock.animate(cells[p.reel][p.row-1].querySelector('.multiplier'),[
      {transform:'scale(1)'},{transform:'scale(1.16)',offset:.45},{transform:'scale(1)'},
    ],{duration:Math.min(520,duration),easing:'ease-in-out'})));
  }
  async function updateGraves(event,before,after){
    const hasUpgrade=event.positions.some(p=>before.graves[p.reel][p.row-1]>0);
    toastKey=hasUpgrade?'gravesStrengthen':'gravesOpen';toast.textContent=text(toastKey);toast.hidden=clock.skipped||!clock.factor();
    const pose=character('bonus','dig');
    try{
      await Promise.all([pose,...event.positions.map(async(p,i)=>{
        const cell=cells[p.reel][p.row-1],previous=before.graves[p.reel][p.row-1],next=event.multipliers[i];
        renderCell(after,p.reel,p.row-1);
        const kind=previous===0?'grave-opening':previous===next?'grave-holding':'grave-upgrading';cell.classList.add(kind);
        const tag=make('span','grave-change',cell);tag.textContent=previous&&previous!==next?`×${previous} → ×${next}`:previous===next?text('graveAtMax'):'×'+next;tag.setAttribute('aria-hidden','true');
        try{
          await Promise.all([
            clock.animate(cell.querySelector('.grave-bed'),[{transform:'scale(.45)',opacity:0},{transform:'scale(1.08)',opacity:1,offset:.7},{transform:'scale(1)',opacity:1}],{duration:780,easing:'ease-out'}),
            clock.animate(cell.querySelector('.multiplier'),[{transform:'translateY(35%) scale(.6)',opacity:0},{transform:'translateY(0) scale(1.18)',opacity:1,offset:.65},{transform:'translateY(0) scale(1)',opacity:1}],{duration:780,easing:'ease-out'}),
            clock.animate(tag,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)',offset:.25},{opacity:1,transform:'translateY(-3px)',offset:.8},{opacity:0,transform:'translateY(-7px)'}],{duration:860,easing:'ease-out'}),
          ]);
        }finally{tag.remove();cell.classList.remove(kind);}
      })]);
    }finally{toast.hidden=true;toastKey=null;}
  }
  async function pulseCounter(){await clock.animate(count,[{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],{duration:220,easing:'ease-out'});}
  function cleanup(){
    clearContributions();toast.hidden=true;toastKey=null;
    root.querySelectorAll('.grave-change').forEach(el=>el.remove());
    cells.flat().forEach(cell=>cell.classList.remove('grave-opening','grave-upgrading','grave-holding'));
  }
  return {render,refreshText,showContribution,animateContribution,clearContributions,updateGraves,pulseCounter,cleanup};
}
