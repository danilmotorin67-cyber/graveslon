// Display-only event state. Never evaluates paylines, selects outcomes or settles money.
const SYMBOLS = new Set(['L1','L2','L3','L4','H1','H2','H3','H4','M','W','S']);
export const EVENT_TYPES = new Set(['reveal','graveMultiplierUpdate','winInfo','setWin','setTotalWin',
  'freeSpinTrigger','updateFreeSpin','freeSpinRetrigger','freeSpinEnd','wincap','finalWin']);
export const TIMINGS = Object.freeze({ spin: 900, stagger: 150, anticipation: 500, cycle:380,
  land: 240, symbol: 720, grave: 650, feature: 2200, bigWin: 3600, line: 1050,
  particle:650, wild:400, scatter:500, overlay:450, fallback:300,
  fog:18000, idle:5000, bat:20000 });

function check(ok, message) { if (!ok) throw new Error(message); }
function units(n) { check(Number.isSafeInteger(n) && n >= 0, 'Invalid integer amount'); return n; }
function count(n) { check(Number.isSafeInteger(n) && n > 0, 'Invalid free-spin count'); return n; }
function position(p) {
  check(p && Number.isInteger(p.reel) && p.reel >= 0 && p.reel < 5 &&
    Number.isInteger(p.row) && p.row >= 1 && p.row <= 3, 'Invalid padded event position');
}
export function initialState() {
  return { board: Array.from({length:5},()=>Array(3).fill('L1')),
    graves: Array.from({length:5},()=>Array(3).fill(0)), index:-1, total:0, spinWin:0,
    fs:0, totalFs:0, freeWin:0, bonusEnded:false, phase:'base', gameType:'basegame', capped:false, wins:[] };
}

export function applyEvent(previous, event) {
  check(event && EVENT_TYPES.has(event.type), 'Unknown book event');
  check(event.index === previous.index + 1, 'Nonsequential event index');
  const state = structuredClone(previous);
  state.index = event.index;
  switch (event.type) {
    case 'reveal':
      check(Array.isArray(event.board) && event.board.length === 5 &&
        event.board.every(r=>Array.isArray(r) && r.length === 5 && r.every(s=>SYMBOLS.has(s?.name))), 'Invalid padded board');
      check(['basegame','freegame'].includes(event.gameType), 'Invalid game type');
      check(Array.isArray(event.anticipation) && event.anticipation.length === 5 &&
        event.anticipation.every(v=>Number.isSafeInteger(v) && v >= 0), 'Invalid anticipation');
      state.board = event.board.map(r=>r.slice(1,4).map(s=>s.name));
      state.gameType = event.gameType;
      state.wins = []; state.spinWin = 0;
      break;
    case 'graveMultiplierUpdate':
      check(Array.isArray(event.positions) && Array.isArray(event.multipliers) &&
        event.positions.length === event.multipliers.length, 'Invalid grave arrays');
      event.positions.forEach((p,i)=>{
        position(p);
        check([2,3,5,10].includes(event.multipliers[i]), 'Invalid grave multiplier');
        state.graves[p.reel][p.row-1] = event.multipliers[i];
      });
      break;
    case 'winInfo':
      units(event.totalWin);
      check(Array.isArray(event.wins), 'Invalid wins');
      event.wins.forEach(w=>{
        units(w.win); units(w.rawWin);
        check(Array.isArray(w.positions), 'Invalid winning positions');
        w.positions.forEach(position);
      });
      state.wins = structuredClone(event.wins);
      break;
    case 'setWin': state.spinWin = units(event.amount); break;
    case 'setTotalWin': state.total = units(event.amount); break;
    case 'freeSpinTrigger':
      event.positions.forEach(position);
      state.phase = 'bonus'; state.totalFs = count(event.totalFs);
      state.bonusEnded = false;
      state.graves = Array.from({length:5},()=>Array(3).fill(0));
      break;
    case 'updateFreeSpin':
      state.fs = count(event.amount); state.totalFs = count(event.total);
      check(state.fs <= state.totalFs, 'Free-spin ordinal exceeds total');
      break;
    case 'freeSpinRetrigger':
      event.positions.forEach(position);
      state.totalFs = count(event.totalFs);
      break;
    case 'freeSpinEnd': state.freeWin = units(event.amount); state.bonusEnded = true; break;
    case 'wincap':
      check(event.amount === 500000, 'Invalid cap event');
      state.total = event.amount; state.capped = true;
      break;
    case 'finalWin': state.total = units(event.amount); state.phase = 'complete'; break;
  }
  return state;
}

export function validateBook(book) {
  check(book && Array.isArray(book.events) && book.events.length > 0, 'Empty book');
  let state = initialState();
  for (const event of book.events) {
    check(state.phase !== 'complete', 'Events follow finalWin');
    state = applyEvent(state,event);
  }
  check(state.phase === 'complete' && state.total === units(book.payoutMultiplier), 'Book total mismatch');
  return state;
}

export class BookPlayer {
  constructor(renderer) { this.renderer=renderer; this.state=initialState(); this.running=false; this.serial=0; }
  skip() { this.renderer.skip?.(); }
  finish() { this.fastFinish=true; this.skip(); }
  stop() { this.serial++; this.renderer.skip?.(); }
  async play(book, {fromEvent=0}={}) {
    check(!this.running, 'A book is already playing');
    validateBook(book); // Fail before drawing any malformed round.
    check(Number.isInteger(fromEvent) && fromEvent >= 0 && fromEvent <= book.events.length, 'Invalid resume cursor');
    const serial=++this.serial;
    this.fastFinish=false; this.running=true; this.state=initialState();
    try {
      for (const event of book.events.slice(0,fromEvent)) this.state=applyEvent(this.state,event);
      this.renderer.restore?.(structuredClone(this.state));
      for (const event of book.events.slice(fromEvent)) {
        if (serial !== this.serial) return {aborted:true,state:this.state};
        const before=this.state;
        this.state=applyEvent(before,event);
        await this.renderer.event(event,structuredClone(before),structuredClone(this.state),{instant:this.fastFinish});
      }
      return {aborted:false,state:this.state};
    } finally { this.running=false; }
  }
}
