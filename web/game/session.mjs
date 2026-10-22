import {validateBook} from '../animation-lab/book-player.mjs';

export const CREDIT_SCALE=1_000_000n;
export const BET_LEVELS=Object.freeze([100_000n,200_000n,500_000n,1_000_000n,2_000_000n,5_000_000n,10_000_000n,20_000_000n,50_000_000n,100_000_000n]);
export class SessionError extends Error {constructor(code){super(code);this.code=code;}}
function require(ok,code){if(!ok)throw new SessionError(code);}
export function payoutFor(bet,payout){
  require(typeof bet==='bigint'&&bet>0n,'invalidBet');
  require(Number.isSafeInteger(payout)&&payout>=0,'invalidBook');
  require(bet*BigInt(payout)%100n===0n,'invalidBet');
  return bet*BigInt(payout)/100n;
}
export function formatCredits(amount,locale='ru'){
  require(typeof amount==='bigint','invalidAmount');
  const negative=amount<0n,value=negative?-amount:amount;
  const whole=new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(value/CREDIT_SCALE);
  let fraction=(value%CREDIT_SCALE).toString().padStart(6,'0');
  while(fraction.length>2&&fraction.endsWith('0'))fraction=fraction.slice(0,-1);
  const separator=new Intl.NumberFormat(locale).formatToParts(1.1).find(p=>p.type==='decimal').value;
  return (negative?'−':'')+whole+separator+fraction;
}

// Explicit, volatile demo credits and a fixed sequence of QA books.
// This is neither a weighted game distribution nor a substitute for an RGS.
export class DemoProvider {
  constructor(scenarios,{balance=10_000n*CREDIT_SCALE}={}){
    require(typeof balance==='bigint'&&balance>=0n,'invalidAmount');
    this.balance=balance;this.scenarios=scenarios;this.ordinal={base:0,bonus:0};
    this.active=null;this.lastCompleted=null;this.serial=0;
    this.policy={disableTurbo:false,disableAutoplay:false};
  }
  async initialize(){return {balance:this.balance,betLevels:[...BET_LEVELS],defaultBet:1_000_000n,policy:{...this.policy},demo:true};}
  async play({bet,mode}){
    require(!this.active,'pendingRound');
    require(BET_LEVELS.includes(bet),'invalidBet');
    require(mode==='base'||mode==='bonus','invalidMode');
    const cost=bet*(mode==='bonus'?100n:1n);
    require(this.balance>=cost,'insufficientBalance');
    const sequence=mode==='base'?['ordinary_win','loss','ordinary_win','loss','multiplier_10','retrigger']:['ordinary_win','retrigger','multiplier_10','max_win'];
    const label=sequence[this.ordinal[mode]%sequence.length];
    const source=this.scenarios.find(s=>s.mode===mode&&s.label===label);
    require(source,'invalidBook');
    const book=structuredClone(source.book);
    validateBook(book); // Validate before changing the demo wallet.
    require(book.payoutMultiplier<=500_000,'invalidBook');
    const payout=payoutFor(bet,book.payoutMultiplier);
    this.balance-=cost;this.ordinal[mode]++;
    this.active={id:'demo-'+(++this.serial),bet,mode,cost,payout,book};
    return {...this.active,book:structuredClone(book),balance:this.balance};
  }
  async complete(id){
    if(this.lastCompleted===id)return {balance:this.balance};
    require(this.active?.id===id,'unknownRound');
    this.balance+=this.active.payout;this.lastCompleted=id;this.active=null;
    return {balance:this.balance};
  }
}

// The UI consumes this controller. A future RGS provider must own money and
// round recovery; rendering failures must never issue a second play request.
export class GameSession {
  constructor(provider,player,onChange=()=>{}){
    this.provider=provider;this.player=player;this.onChange=onChange;
    this.status='loading';this.balance=0n;this.bet=1_000_000n;this.betLevels=[];
    this.policy={};this.active=null;this.displayWin=0n;this.lastWin=0n;
    this.displayState=null;this.error=null;this.playbackComplete=false;
  }
  changed(){this.onChange(this);}
  async initialize(){
    require(!this.active,'pendingRound');
    this.status='loading';this.error=null;this.changed();
    try{
      const info=await this.provider.initialize();
      require(info.demo===true,'unsupportedSession');
      this.balance=info.balance;this.betLevels=info.betLevels;this.bet=info.defaultBet;this.policy=info.policy;
      this.status='idle';
    }catch(error){this.status='error';this.error=error.code||'loadError';}
    this.changed();
  }
  get locked(){return this.status!=='idle';}
  setBet(bet){require(!this.locked&&!this.active,'busy');require(this.betLevels.includes(bet),'invalidBet');this.bet=bet;this.changed();}
  display(state){
    this.displayState=state;
    if(this.active)this.displayWin=payoutFor(this.active.bet,state.total);
    this.changed();
  }
  async spin(mode='base'){
    require(!this.locked&&!this.active,'busy');
    this.status='requesting';this.error=null;this.displayWin=0n;this.playbackComplete=false;this.changed();
    try{
      this.active=await this.provider.play({bet:this.bet,mode});
      this.balance=this.active.balance;
      await this.finishActive(0);
    }catch(error){
      this.error=error.code||'roundError';this.status=this.active?'error':'idle';this.changed();
    }
  }
  async finishActive(fromEvent){
    require(!!this.active,'unknownRound');
    if(!this.playbackComplete){
      this.status='playing';this.changed();
      const result=await this.player.play(this.active.book,{fromEvent});
      require(!result.aborted,'playbackInterrupted');
      this.playbackComplete=true;
    }
    this.status='settling';this.changed();
    const result=await this.provider.complete(this.active.id);
    this.lastWin=this.active.payout;this.displayWin=this.lastWin;this.balance=result.balance;
    this.active=null;this.error=null;this.status='idle';this.changed();
  }
  async recover(){
    require(this.status==='error'&&!!this.active,'unknownRound');
    this.error=null;
    try{await this.finishActive(Math.max(0,this.player.state.index));}
    catch(error){this.status='error';this.error=error.code||'roundError';this.changed();}
  }
  clearError(){if(!this.active){this.error=null;this.changed();}}
  finish(){if(this.status==='playing')this.player.finish();}
}
