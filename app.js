const APP_KEY = 'frame_training_v1';
const DB_NAME = 'frame_photos_v1';
const DB_STORE = 'photos';

const WORKOUTS = {
  A: {
    title: 'Workout A', subtitle: 'Push · Shoulders · Back · Legs', estimate: '30–35 min',
    exercises: [
      {id:'pushup', name:'Push-ups', sets:3, min:5, max:8, rest:120, note:'Clean reps. Stop with ~1–2 reps left.', progress:'8/8/8 clean twice → use a harder push-up progression.'},
      {id:'row', name:'One-arm Backpack Row', sets:3, min:8, max:12, rest:120, suffix:'/side', note:'Same reps on both sides. Use a solid backpack.', progress:'12/12/12 twice → add a little weight to the backpack.'},
      {id:'pike', name:'Pike Push-ups', sets:2, min:5, max:8, rest:120, note:'Hips high, head travels slightly forward.', progress:'8/8 twice → gradually elevate feet or increase ROM.'},
      {id:'bulg', name:'Bulgarian Split Squat', sets:2, min:8, max:12, rest:150, suffix:'/leg', note:'Controlled reps. This is the “who invented this” exercise.', progress:'12/12 twice → add backpack load or slow the eccentric.'}
    ]
  },
  B: {
    title: 'Workout B', subtitle: 'Dips · Back · Legs · Core', estimate: '28–35 min',
    exercises: [
      {id:'dips', name:'Dips', sets:3, min:5, max:8, rest:150, note:'Use feet assistance if full dips are not clean yet.', progress:'8/8/8 twice → reduce assistance; if already full, add tempo/control.'},
      {id:'row', name:'One-arm Backpack Row', sets:3, min:8, max:12, rest:120, suffix:'/side', note:'Same reps on both sides. Keep torso controlled.', progress:'12/12/12 twice → add a little weight.'},
      {id:'lunge', name:'Reverse Lunges', sets:2, min:8, max:12, rest:120, suffix:'/leg', note:'Smooth reps, stable knee, full control.', progress:'12/12 twice → add backpack load.'},
      {id:'revcrunch', name:'Reverse Crunch', sets:2, min:10, max:15, rest:90, note:'Curl pelvis up; don’t just swing the legs.', progress:'15/15 twice → slower tempo or longer pause at the top.'}
    ]
  }
};

const SCHEDULE = {1:'A',2:'B',4:'A',6:'B'}; // Mon Tue Thu Sat
const DAY_NAMES = ['Duminică','Luni','Marți','Miercuri','Joi','Vineri','Sâmbătă'];
const SHORT_DAYS = ['D','L','M','M','J','V','S'];

const defaultState = () => ({
  version:1,
  baselineDate:'2026-09-09',
  baseline:{pushups:10,pullups:0,deadhang:15},
  workouts:[],
  activeWorkout:null,
  completion:null,
  badDayNext:false,
  settings:{wakeLock:true,haptics:true},
  progression:{},
  skill:{stage:0,bestHold:0,sessions:[]},
  weights:[],
  photoSessions:[],
  stretchLogs:[]
});

let state = loadState();
let activeTab = 'today';
let restTimer = null;
let restRemaining = 0;
let wakeLock = null;
let deferredInstallPrompt = null;
let actionStack = [];
let photoDraft = {front:null,side:null,back:null};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const view = $('#view');

function loadState(){
  try {
    const raw = JSON.parse(localStorage.getItem(APP_KEY));
    return raw ? {...defaultState(), ...raw, settings:{...defaultState().settings,...(raw.settings||{})}, skill:{...defaultState().skill,...(raw.skill||{})}} : defaultState();
  } catch { return defaultState(); }
}
function saveState(){ localStorage.setItem(APP_KEY, JSON.stringify(state)); }
function isoDate(d=new Date()){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function prettyDate(d=new Date()){ return new Intl.DateTimeFormat('ro-RO',{weekday:'long',day:'numeric',month:'long'}).format(d); }
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function toast(msg){
  let t = document.querySelector('.toast');
  if(!t){ t=document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
  t.textContent=msg; t.classList.add('show'); clearTimeout(t._to); t._to=setTimeout(()=>t.classList.remove('show'),1800);
}
function haptic(ms=25){ if(state.settings.haptics && navigator.vibrate) navigator.vibrate(ms); }
function dayWorkout(date=new Date()){ return SCHEDULE[date.getDay()] || null; }
function workoutCount(){ return state.workouts.length; }
function totalReps(arr){ return (arr||[]).reduce((a,b)=>a+(Number(b)||0),0); }
function lastExercise(exId){
  for(let i=state.workouts.length-1;i>=0;i--){
    const e=state.workouts[i].exercises?.find(x=>x.id===exId);
    if(e) return e;
  }
  return null;
}
function lastWorkoutType(type){ return [...state.workouts].reverse().find(w=>w.type===type); }
function nextScheduledDate(from=new Date()){
  const d=new Date(from); d.setHours(12,0,0,0);
  for(let i=0;i<8;i++){ if(SCHEDULE[d.getDay()]) return {date:new Date(d),type:SCHEDULE[d.getDay()]}; d.setDate(d.getDate()+1); }
}
function weeklyDays(){
  const now=new Date(); const monday=new Date(now); const diff=(now.getDay()+6)%7; monday.setDate(now.getDate()-diff); monday.setHours(12,0,0,0);
  return Array.from({length:7},(_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);return d;});
}
function progressionReady(id){ return (state.progression[id]?.topHits||0)>=2; }

function navInit(){
  $$('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{
    activeTab=btn.dataset.tab;
    $$('.nav-item').forEach(b=>b.classList.toggle('active',b===btn));
    render();
  }));
  $('#dateLabel').textContent = prettyDate().toUpperCase();
  $('#restPlus').onclick=()=>{restRemaining+=30; updateRestUI();};
  $('#restSkip').onclick=()=>stopRestTimer();
  $('#installBtn').onclick=showInstall;
}

async function render(){
  $('#dateLabel').textContent = prettyDate().toUpperCase();
  if(activeTab==='today') renderToday();
  if(activeTab==='plan') renderPlan();
  if(activeTab==='skill') renderSkill();
  if(activeTab==='progress') await renderProgress();
}

function renderToday(){
  if(state.activeWorkout){ renderActiveWorkout(); return; }
  if(state.completion){ renderCompletion(); return; }

  const todayType = dayWorkout();
  const next = nextScheduledDate(new Date());
  const type = todayType || next.type;
  const cfg = WORKOUTS[type];
  const today = new Date();
  const isTraining = !!todayType;

  view.innerHTML = `
    <section class="hero">
      <div class="kicker">${isTraining ? 'TODAY · TRAIN' : 'TODAY · RECOVER'}</div>
      <h2>${isTraining ? cfg.title : 'Recovery day.'}</h2>
      <p>${isTraining ? cfg.subtitle : `Next: ${DAY_NAMES[next.date.getDay()]} · ${WORKOUTS[next.type].title}. Nu înghesui workout-uri ratate.`}</p>
      <div class="pill-row">
        ${isTraining ? `<span class="pill accent">${cfg.estimate}</span><span class="pill">${cfg.exercises.length} exercises</span><span class="pill">+ 6–8 min handstand</span>` : `<span class="pill">Sleep · food · move a little</span>`}
      </div>
    </section>

    <section class="timeline">
      ${weeklyDays().map(d=>{
        const wt=SCHEDULE[d.getDay()]; const isToday=isoDate(d)===isoDate(today);
        return `<div class="day-chip ${isToday?'today':''} ${wt?'train':''}"><b>${SHORT_DAYS[d.getDay()]}</b><span>${wt||'REST'}</span></div>`;
      }).join('')}
    </section>

    ${isTraining ? `
      <section class="card">
        <div class="card-header"><div><h3>${cfg.title}</h3><p>${cfg.subtitle}</p></div><span class="pill">${cfg.estimate}</span></div>
        <div class="plan-list">
          ${cfg.exercises.map(e=>`<div class="plan-item"><b>${e.name}</b><span>${e.sets}×${e.min}–${e.max}${e.suffix||''}</span></div>`).join('')}
        </div>
      </section>
      <section class="card toggle">
        <div><h3 style="margin-bottom:4px">Low Energy Mode</h3><p>Taie ultimul set din fiecare exercițiu. Pentru zilele în care școala te-a terminat.</p></div>
        <button id="badDaySwitch" class="switch ${state.badDayNext?'on':''}" aria-label="Low energy mode"></button>
      </section>
      <button class="primary full" id="startWorkout">START ${cfg.title.toUpperCase()}</button>
    ` : `
      <section class="card"><h3>5 min posture / stretch</h3><p>Poți face rutina scurtă azi. Nu te „face mai înalt”; te ajută la mobilitate și postură.</p><button class="ghost full" style="margin-top:12px" id="stretchOpen">OPEN STRETCH</button></section>
      <section class="card"><h3>Want to train anyway?</h3><p>Dacă ai mutat programul intenționat, poți porni următorul workout manual. Nu face asta doar ca să recuperezi obsesiv o zi ratată.</p><button class="ghost full" style="margin-top:12px" id="manualStart">START ${cfg.title.toUpperCase()}</button></section>
    `}

    <section class="card">
      <div class="card-header"><div><h3>Essentials</h3><p>Lucrurile care chiar mișcă fizicul.</p></div></div>
      <div class="grid2">
        <div class="metric"><b>8–10h</b><span>Sleep target</span></div>
        <div class="metric"><b>4×</b><span>Training / week</span></div>
      </div>
      <div class="note" style="margin-top:10px"><strong>Food:</strong> mănâncă suficient, mese normale, proteină regulat. Fără cut agresiv. <strong>Pain rule:</strong> sharp joint pain = stop/regress, nu ego reps.</div>
    </section>
  `;

  if(isTraining){
    $('#badDaySwitch').onclick=()=>{state.badDayNext=!state.badDayNext;saveState();renderToday();};
    $('#startWorkout').onclick=()=>startWorkout(type);
  } else {
    $('#manualStart').onclick=()=>startWorkout(type);
    $('#stretchOpen').onclick=showStretchModal;
  }
}

function startWorkout(type){
  const cfg=WORKOUTS[type];
  const bad=state.badDayNext;
  const exercises=cfg.exercises.map(e=>{
    const sets=Math.max(1,e.sets-(bad?1:0));
    const last=lastExercise(e.id);
    const prev=(last?.reps||[]).slice(0,sets);
    const reps=Array.from({length:sets},(_,i)=>Number(prev[i] ?? e.min));
    return {...e, sets, reps, complete:Array(sets).fill(false)};
  });
  state.activeWorkout={id:Date.now(),type,date:isoDate(),startedAt:new Date().toISOString(),badDay:bad,exercises};
  state.badDayNext=false; actionStack=[]; saveState(); requestWakeLock(); render();
}

function renderActiveWorkout(){
  const w=state.activeWorkout, cfg=WORKOUTS[w.type];
  const totalSets=w.exercises.reduce((n,e)=>n+e.complete.length,0);
  const doneSets=w.exercises.reduce((n,e)=>n+e.complete.filter(Boolean).length,0);
  const pct=totalSets?Math.round(doneSets/totalSets*100):0;
  view.innerHTML=`
    <section class="hero">
      <div class="kicker">LIVE · ${w.badDay?'LOW ENERGY':'NORMAL'}</div>
      <h2>${cfg.title}</h2>
      <p>${doneSets}/${totalSets} sets complete · keep reps clean.</p>
      <div class="progressbar"><i style="width:${pct}%"></i></div>
      <div class="workout-tools">
        <button class="ghost small" id="undoSet">↶ Undo set</button>
        <button class="ghost small" id="wakeToggle">${state.settings.wakeLock?'◉ Screen awake':'○ Screen awake'}</button>
        <button class="danger small" id="cancelWorkout">Cancel</button>
      </div>
    </section>
    <section class="card"><h3>4 min warm-up</h3><p>30s jumping jacks · wrist circles · arm circles · 10 scapular push-ups · a few easy reps of exercise #1.</p></section>
    ${w.exercises.map((e,ei)=>exerciseCard(e,ei)).join('')}
    <div class="sticky-actions"><button class="primary" id="finishWorkout">FINISH WORKOUT</button></div>
  `;
  bindWorkoutControls();
}

function exerciseCard(e,ei){
  const last=lastExercise(e.id);
  const lastText=last ? last.reps.join(' / ') : '—';
  const ready=progressionReady(e.id);
  const all=e.complete.every(Boolean);
  const maxTotal=e.sets*e.max;
  const prevTotal=last?totalReps(last.reps):0;
  const goal=!last ? `Start around ${e.min} clean reps/set` : prevTotal>=maxTotal ? `Repeat top range clean` : `Try to beat ${prevTotal} total reps`;
  return `<section class="exercise ${all?'done':''}" data-ei="${ei}">
    <div class="card-header"><div><div class="name">${e.name}</div><div class="meta">${e.sets}×${e.min}–${e.max}${e.suffix||''} · rest ${Math.round(e.rest/60*10)/10} min</div></div>${ready?'<span class="pill accent">READY ↑</span>':''}</div>
    <div class="note">${esc(e.note)} ${ready?`<br><strong>Progress next:</strong> ${esc(e.progress)}`:''}</div>
    <div class="last"><strong>Last:</strong> ${lastText} · <strong>Goal:</strong> ${goal}</div>
    <div class="set-row">
      ${e.reps.map((r,si)=>`<div style="display:flex;gap:5px"><div class="set-control ${e.complete[si]?'complete':''}"><button data-act="minus" data-ei="${ei}" data-si="${si}">−</button><input inputmode="numeric" pattern="[0-9]*" value="${r}" data-rep data-ei="${ei}" data-si="${si}"><button data-act="plus" data-ei="${ei}" data-si="${si}">+</button></div><button class="set-check ${e.complete[si]?'checked':''}" data-act="check" data-ei="${ei}" data-si="${si}">${e.complete[si]?'✓':si+1}</button></div>`).join('')}
    </div>
  </section>`;
}

function bindWorkoutControls(){
  $$('[data-act]').forEach(btn=>btn.onclick=()=>{
    const ei=+btn.dataset.ei, si=+btn.dataset.si, e=state.activeWorkout.exercises[ei];
    if(btn.dataset.act==='minus'){e.reps[si]=Math.max(0,(+e.reps[si]||0)-1);saveState();renderActiveWorkout();return;}
    if(btn.dataset.act==='plus'){e.reps[si]=(+e.reps[si]||0)+1;saveState();renderActiveWorkout();return;}
    if(btn.dataset.act==='check'){
      e.complete[si]=!e.complete[si];
      if(e.complete[si]){
        actionStack.push({ei,si}); haptic(); startRestTimer(e.rest);
      } else actionStack=actionStack.filter(a=>!(a.ei===ei&&a.si===si));
      saveState(); renderActiveWorkout();
    }
  });
  $$('[data-rep]').forEach(inp=>inp.onchange=()=>{
    const ei=+inp.dataset.ei,si=+inp.dataset.si;
    state.activeWorkout.exercises[ei].reps[si]=Math.max(0,parseInt(inp.value||0,10));saveState();
  });
  $('#undoSet').onclick=undoLastSet;
  $('#wakeToggle').onclick=()=>{state.settings.wakeLock=!state.settings.wakeLock;saveState();state.settings.wakeLock?requestWakeLock():releaseWakeLock();renderActiveWorkout();};
  $('#cancelWorkout').onclick=confirmCancelWorkout;
  $('#finishWorkout').onclick=finishWorkout;
}

function undoLastSet(){
  const a=actionStack.pop(); if(!a){toast('Nimic de dat undo.');return;}
  state.activeWorkout.exercises[a.ei].complete[a.si]=false; saveState(); stopRestTimer(); renderActiveWorkout(); toast('Set undone.');
}
function confirmCancelWorkout(){
  openModal(`<h3>Cancel workout?</h3><p>Seturile din sesiunea asta nu vor intra în istoric.</p><div class="actions"><button class="ghost" data-close>Keep training</button><button class="danger" id="cancelYes">Cancel workout</button></div>`);
  $('#cancelYes').onclick=()=>{state.activeWorkout=null;saveState();releaseWakeLock();closeModal();render();};
}

function finishWorkout(){
  const w=state.activeWorkout;
  const incomplete=w.exercises.some(e=>e.complete.some(c=>!c));
  if(incomplete){
    openModal(`<h3>Ai seturi nebifate.</h3><p>Poți salva workout-ul așa cum e sau te întorci să-l termini.</p><div class="actions"><button class="ghost" data-close>Back</button><button class="primary" id="savePartial">Save anyway</button></div>`);
    $('#savePartial').onclick=()=>{closeModal();commitWorkout();};
  } else commitWorkout();
}
function commitWorkout(){
  const w=state.activeWorkout;
  const saved={...w,finishedAt:new Date().toISOString(),exercises:w.exercises.map(e=>({id:e.id,name:e.name,reps:e.reps.slice(),complete:e.complete.slice()}))};
  state.workouts.push(saved);
  for(const e of w.exercises){
    const allDone=e.complete.every(Boolean); const top=allDone && e.reps.every(r=>Number(r)>=e.max);
    const p=state.progression[e.id]||{topHits:0}; p.topHits=top?p.topHits+1:0; state.progression[e.id]=p;
  }
  state.completion={type:w.type,date:w.date,workoutId:w.id};
  state.activeWorkout=null; saveState(); stopRestTimer(); releaseWakeLock(); haptic([30,50,30]); render();
}

function renderCompletion(){
  const c=state.completion;
  view.innerHTML=`
    <section class="completion">
      <div class="big">✓</div><h2>Workout done.</h2><p>Ai terminat ${WORKOUTS[c.type].title}. Acum partea scurtă.</p>
      <div class="quote">BAG PL ÎN ĂLA CARE A INVENTAT BULGARIAN SPLIT SQUATS.</div>
      <button class="primary full" id="startHandstand">6–8 MIN HANDSTAND</button>
      <button class="ghost full" style="margin-top:8px" id="openStretch">5 MIN POSTURE / STRETCH</button>
      <button class="ghost full" style="margin-top:8px" id="doneForToday">DONE FOR TODAY</button>
    </section>`;
  $('#startHandstand').onclick=showHandstandModal;
  $('#openStretch').onclick=showStretchModal;
  $('#doneForToday').onclick=()=>{state.completion=null;saveState();renderToday();};
}

function renderPlan(){
  view.innerHTML=`
    <section class="hero"><div class="kicker">4 DAYS · SIMPLE</div><h2>Short enough to follow. Hard enough to matter.</h2><p>A / B / rest / A / rest / B / rest. Main workout ~30–35 min, then 6–8 min handstand.</p></section>
    <section class="card"><h3>Weekly schedule</h3><div class="plan-list">
      <div class="plan-item"><b>Luni</b><span>Workout A + Handstand</span></div>
      <div class="plan-item"><b>Marți</b><span>Workout B + Handstand</span></div>
      <div class="plan-item"><b>Miercuri</b><span>Rest / stretch</span></div>
      <div class="plan-item"><b>Joi</b><span>Workout A + Handstand</span></div>
      <div class="plan-item"><b>Vineri</b><span>Rest</span></div>
      <div class="plan-item"><b>Sâmbătă</b><span>Workout B + Handstand</span></div>
      <div class="plan-item"><b>Duminică</b><span>Rest</span></div>
    </div></section>
    ${['A','B'].map(t=>{
      const w=WORKOUTS[t]; return `<section class="card"><div class="card-header"><div><h3>${w.title}</h3><p>${w.subtitle}</p></div><span class="pill">${w.estimate}</span></div><div class="plan-list">${w.exercises.map(e=>`<div class="plan-item"><div><b>${e.name}</b><div style="font-size:11px;color:var(--muted);margin-top:3px">${esc(e.note)}</div></div><span>${e.sets}×${e.min}–${e.max}${e.suffix||''}</span></div>`).join('')}</div></section>`;
    }).join('')}
    <section class="card"><h3>Progression rule</h3><p>Țintești intervalul de reps cu formă clean și ~1–2 reps în rezervă. Când atingi capătul de sus la toate seturile de <strong>două ori</strong>, crești dificultatea — nu adaugi seturi la infinit.</p></section>
    <section class="card"><h3>Rest</h3><p>~2 min la push-ups, rows și pike. 2–3 min la dips și Bulgarian split squats dacă ai nevoie. Core: ~90 sec.</p></section>
    <section class="card"><h3>5 min posture / stretch</h3><div class="plan-list">
      <div class="plan-item"><b>Hip-flexor stretch</b><span>30s / side</span></div>
      <div class="plan-item"><b>Hamstring stretch</b><span>30s / side</span></div>
      <div class="plan-item"><b>Child’s pose</b><span>45s</span></div>
      <div class="plan-item"><b>Sphinx / gentle cobra</b><span>30s</span></div>
      <div class="plan-item"><b>Doorway chest stretch</b><span>30s / side</span></div>
      <div class="plan-item"><b>Wall posture hold</b><span>45s</span></div>
    </div><div class="note"><strong>Important:</strong> stretching-ul nu îți lungește oasele și nu garantează centimetri. Îl folosim pentru mobilitate și postură.</div></section>
    <section class="card"><h3>One equipment upgrade</h3><p><strong>Pull-up bar.</strong> Când ai una, adăugăm dead hang → scapular pull-ups → assisted/foot-assisted reps → controlled negatives → first pull-up. Rows rămân.</p></section>
    <section class="card"><h3>Non-negotiables</h3><div class="plan-list"><div class="plan-item"><b>Sleep</b><span>8–10h target</span></div><div class="plan-item"><b>Food</b><span>Enough food · no aggressive cut</span></div><div class="plan-item"><b>Technique</b><span>Clean reps > ego reps</span></div><div class="plan-item"><b>Sharp joint pain</b><span>Stop / regress</span></div></div></section>
  `;
}

const SKILL_STAGES=[
  {name:'Wall confidence',desc:'Comfortable wall handstand practice; learn a safe exit.'},
  {name:'Chest-to-wall 30s',desc:'Straight body, controlled shoulders, no banana back.'},
  {name:'Heel pulls',desc:'Small balance releases from the wall, 3–5 clean reps.'},
  {name:'Kick-up control',desc:'Consistent entries without smashing into the wall.'},
  {name:'Freestanding 5s',desc:'Own a real 5-second hold.'},
  {name:'Freestanding 10–20s',desc:'Long-term clean handstand target.'}
];

function renderSkill(){
  view.innerHTML=`
    <section class="hero"><div class="kicker">MAIN SKILL</div><h2>Handstand.</h2><p>6–8 minute micro-sessions after workouts. Enough to practice, not enough to turn the plan into a circus.</p><div class="pill-row"><span class="pill accent">Best: ${state.skill.bestHold||0}s</span><span class="pill">${state.skill.sessions.length} sessions</span></div></section>
    <button class="primary full" id="skillStart">START QUICK SESSION</button>
    <section class="card"><h3>Progression</h3>${SKILL_STAGES.map((s,i)=>`<div class="stage ${i<state.skill.stage?'done':''} ${i===state.skill.stage?'current':''}" data-stage="${i}"><div class="stage-dot">${i<state.skill.stage?'✓':i+1}</div><div><h4>${s.name}</h4><p>${s.desc}</p></div></div>`).join('')}<div class="note" style="margin-top:10px">Tap a stage to set your current level manually. Dacă ești prea obosit după workout și forma se rupe, fă doar wall holds sau mută practica pe o zi fresh.</div></section>
    <section class="card"><h3>Quick session</h3><div class="plan-list"><div class="plan-item"><b>Wrists</b><span>~1 min</span></div><div class="plan-item"><b>Wall handstand</b><span>2×20–30s</span></div><div class="plan-item"><b>Chest-to-wall</b><span>2×15–25s if comfortable</span></div><div class="plan-item"><b>Freestanding kick-ups</b><span>3–5 attempts</span></div></div></section>
  `;
  $('#skillStart').onclick=showHandstandModal;
  $$('[data-stage]').forEach(el=>el.onclick=()=>{state.skill.stage=+el.dataset.stage;saveState();renderSkill();});
}

async function renderProgress(){
  const latestWeight=state.weights.at(-1)?.value;
  const photoDue=photoReminderDue();
  view.innerHTML=`
    <section class="hero"><div class="kicker">PROGRESS</div><h2>Numbers + photos.</h2><p>Nu te baza pe oglinda de azi. Compară săptămâni și luni.</p></section>
    <section class="metric-grid">
      <div class="metric"><b>10</b><span>Baseline push-ups</span></div>
      <div class="metric"><b>0</b><span>Baseline pull-ups</span></div>
      <div class="metric"><b>${workoutCount()}</b><span>Workouts done</span></div>
      <div class="metric"><b>${state.skill.bestHold||0}s</b><span>Best handstand</span></div>
    </section>
    <section class="card"><div class="card-header"><div><h3>Bodyweight</h3><p>${latestWeight?`Latest: ${latestWeight} kg`:'Optional, but useful to track.'}</p></div></div><div class="form-row"><input id="weightInput" class="text-input" inputmode="decimal" placeholder="e.g. 47.2"><button class="primary" id="addWeight">ADD</button></div></section>
    <section class="card"><div class="card-header"><div><h3>Progress Photos</h3><p>Front · side · back. Same light, distance and posture every 4 weeks.</p></div>${photoDue?'<span class="pill accent">DUE</span>':''}</div><button class="primary full" id="photoAdd">${state.photoSessions.length?'ADD NEW CHECK-IN':'TAKE BASELINE PHOTOS'}</button><div class="note" style="margin-top:10px"><strong>Privacy:</strong> photos stay on this device in the app’s local storage. They are not uploaded by this app.</div></section>
    <section class="card" id="compareCard"><h3>Before ↔ Now</h3><div class="empty">${state.photoSessions.length<2?'Add at least two photo check-ins to compare.':'Loading photos…'}</div></section>
    <section class="card"><h3>Backup</h3><p>Export your workout history, settings and progress photos to one JSON backup file. Import it later if you move devices.</p><div class="grid2" style="margin-top:12px"><button class="ghost" id="exportBackup">EXPORT</button><button class="ghost" id="importBackup">IMPORT</button></div></section>
  `;
  $('#addWeight').onclick=()=>{
    const v=parseFloat($('#weightInput').value.replace(',','.')); if(!v||v<20||v>250){toast('Enter a valid weight.');return;}
    state.weights.push({date:isoDate(),value:Math.round(v*10)/10});saveState();renderProgress();toast('Weight saved.');
  };
  $('#photoAdd').onclick=showPhotoModal;
  $('#exportBackup').onclick=exportBackup;
  $('#importBackup').onclick=()=>$('#importInput').click();
  if(state.photoSessions.length>=2) await buildCompareCard();
}

function photoReminderDue(){
  if(!state.photoSessions.length) return true;
  const last=new Date(state.photoSessions.at(-1).date+'T12:00:00'); return (Date.now()-last.getTime())/(86400000)>=28;
}

function showHandstandModal(){
  openModal(`<h3>6–8 min Handstand</h3><p>Short. Clean. Stop if wrists/shoulders feel sketchy.</p>
    <div class="plan-list" style="margin-top:12px"><div class="plan-item"><b>Wrists</b><span>~1 min</span></div><div class="plan-item"><b>Wall handstand</b><span>2×20–30s</span></div><div class="plan-item"><b>Chest-to-wall</b><span>2×15–25s</span></div><div class="plan-item"><b>Kick-up attempts</b><span>3–5</span></div></div>
    <hr><label style="font-size:12px;color:var(--muted)">Best freestanding hold today (seconds)</label><input id="handstandBest" class="text-input" inputmode="numeric" value="0" style="margin-top:7px">
    <div class="actions"><button class="ghost" data-close>Cancel</button><button class="primary" id="logHandstand">LOG SESSION</button></div>`);
  $('#logHandstand').onclick=()=>{
    const best=Math.max(0,parseInt($('#handstandBest').value||0,10)); state.skill.bestHold=Math.max(state.skill.bestHold||0,best); state.skill.sessions.push({date:isoDate(),best});
    if(best>=10) state.skill.stage=Math.max(state.skill.stage,5); else if(best>=5) state.skill.stage=Math.max(state.skill.stage,4);
    saveState();closeModal();toast('Handstand logged.');
    if(state.completion) renderCompletion(); else render();
  };
}
function showStretchModal(){
  openModal(`<h3>5 min Posture / Stretch</h3><p>Mobility + posture. Nu este un “height hack”.</p><div class="plan-list" style="margin-top:12px"><div class="plan-item"><b>Hip-flexor</b><span>30s / side</span></div><div class="plan-item"><b>Hamstrings</b><span>30s / side</span></div><div class="plan-item"><b>Child’s pose</b><span>45s</span></div><div class="plan-item"><b>Sphinx / gentle cobra</b><span>30s</span></div><div class="plan-item"><b>Doorway chest</b><span>30s / side</span></div><div class="plan-item"><b>Wall posture hold</b><span>45s</span></div></div><div class="actions"><button class="ghost" data-close>Close</button><button class="primary" id="logStretch">DONE</button></div>`);
  $('#logStretch').onclick=()=>{state.stretchLogs.push({date:isoDate()});saveState();closeModal();toast('Stretch logged.');};
}

function openModal(html){ const m=$('#modal'); m.innerHTML=html; m.showModal(); $$('[data-close]').forEach(b=>b.onclick=closeModal); }
function closeModal(){ const m=$('#modal'); if(m.open)m.close(); }

function startRestTimer(seconds){
  stopRestTimer(false); restRemaining=seconds; $('#restDock').classList.remove('hidden'); updateRestUI();
  restTimer=setInterval(()=>{restRemaining--;updateRestUI();if(restRemaining<=0){stopRestTimer();haptic([60,80,60]);toast('Rest done.');}},1000);
}
function updateRestUI(){ const m=Math.floor(Math.max(0,restRemaining)/60),s=Math.max(0,restRemaining)%60; $('#restTime').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
function stopRestTimer(hide=true){ if(restTimer)clearInterval(restTimer);restTimer=null;if(hide)$('#restDock').classList.add('hidden'); }

async function requestWakeLock(){
  if(!state.settings.wakeLock || !('wakeLock' in navigator)) return;
  try{ wakeLock=await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release',()=>wakeLock=null);}catch{}
}
async function releaseWakeLock(){ try{await wakeLock?.release();}catch{} wakeLock=null; }
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.activeWorkout&&state.settings.wakeLock)requestWakeLock();});

function showInstall(){
  if(deferredInstallPrompt){ deferredInstallPrompt.prompt(); deferredInstallPrompt=null; return; }
  openModal(`<h3>Add FRAME to Home Screen</h3><p><strong>iPhone:</strong> open this site in Safari → tap Share → <strong>Add to Home Screen</strong> → Add.</p><p style="margin-top:10px">After that it opens like a standalone app and keeps the UI clean.</p><div class="actions"><button class="primary" data-close>Got it</button></div>`);
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;});

function dbOpen(){
  return new Promise((res,rej)=>{ const r=indexedDB.open(DB_NAME,1); r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(DB_STORE))r.result.createObjectStore(DB_STORE,{keyPath:'id'});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error); });
}
async function dbPut(rec){ const db=await dbOpen(); return new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(rec);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);}); }
async function dbGetAll(){ const db=await dbOpen(); return new Promise((res,rej)=>{const r=db.transaction(DB_STORE,'readonly').objectStore(DB_STORE).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);}); }
async function dbClear(){ const db=await dbOpen(); return new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).clear();tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);}); }

function showPhotoModal(){
  photoDraft={front:null,side:null,back:null};
  openModal(`<h3>${state.photoSessions.length?'New progress check-in':'Baseline photos'}</h3><p>Same light, same distance, relaxed posture. Front · side · back.</p>
    <div class="photo-grid">
      ${['front','side','back'].map(v=>`<label class="photo-slot" id="slot-${v}"><span>${v.toUpperCase()}<br>tap to add</span><input type="file" accept="image/*" capture="environment" data-photo="${v}"></label>`).join('')}
    </div>
    <label style="display:block;margin-top:12px;font-size:12px;color:var(--muted)">Weight (optional)</label><input id="photoWeight" class="text-input" inputmode="decimal" placeholder="kg" style="margin-top:6px">
    <div class="actions"><button class="ghost" data-close>Cancel</button><button class="primary" id="savePhotos">SAVE CHECK-IN</button></div>`);
  $$('[data-photo]').forEach(inp=>inp.onchange=()=>{
    const file=inp.files?.[0]; if(!file)return; const v=inp.dataset.photo; photoDraft[v]=file; const url=URL.createObjectURL(file); const slot=$(`#slot-${v}`); slot.querySelector('img')?.remove(); const im=document.createElement('img');im.src=url;slot.appendChild(im);
  });
  $('#savePhotos').onclick=savePhotoSession;
}
async function savePhotoSession(){
  if(!photoDraft.front||!photoDraft.side||!photoDraft.back){toast('Add front, side and back.');return;}
  const sid=Date.now(); const date=isoDate();
  for(const v of ['front','side','back']) await dbPut({id:`${sid}_${v}`,sessionId:sid,view:v,date,blob:photoDraft[v]});
  const weight=parseFloat(($('#photoWeight').value||'').replace(',','.'));
  state.photoSessions.push({id:sid,date,weight:Number.isFinite(weight)?Math.round(weight*10)/10:null});
  if(Number.isFinite(weight)) state.weights.push({date,value:Math.round(weight*10)/10});
  saveState(); closeModal(); toast('Progress photos saved locally.'); renderProgress();
}

async function buildCompareCard(){
  const card=$('#compareCard'); if(!card)return;
  const sessions=state.photoSessions;
  const all=await dbGetAll();
  const first=sessions[0], last=sessions.at(-1);
  card.innerHTML=`<h3>Before ↔ Now</h3>
    <div class="grid2" style="margin-bottom:8px"><select class="select" id="beforeSel">${sessions.map(s=>`<option value="${s.id}" ${s.id===first.id?'selected':''}>${s.date}</option>`).join('')}</select><select class="select" id="afterSel">${sessions.map(s=>`<option value="${s.id}" ${s.id===last.id?'selected':''}>${s.date}</option>`).join('')}</select></div>
    <select class="select" id="viewSel" style="margin-bottom:10px"><option value="front">Front</option><option value="side">Side</option><option value="back">Back</option></select>
    <div id="compareMount"></div>`;
  const refresh=()=>renderCompareImage(all,+$('#beforeSel').value,+$('#afterSel').value,$('#viewSel').value);
  $('#beforeSel').onchange=refresh;$('#afterSel').onchange=refresh;$('#viewSel').onchange=refresh;refresh();
}
function renderCompareImage(all,beforeId,afterId,viewName){
  const mount=$('#compareMount');
  const b=all.find(r=>r.sessionId===beforeId&&r.view===viewName), a=all.find(r=>r.sessionId===afterId&&r.view===viewName);
  if(!b||!a){mount.innerHTML='<div class="empty">Photo missing for this view.</div>';return;}
  const bu=URL.createObjectURL(b.blob), au=URL.createObjectURL(a.blob);
  mount.innerHTML=`<div class="compare-wrap"><img src="${bu}" alt="Before"><img src="${au}" alt="After" class="compare-after" id="afterImg"><div class="compare-line" id="compareLine"></div></div><input type="range" min="0" max="100" value="50" class="range" id="compareRange"><div class="form-row" style="justify-content:space-between;font-size:11px;color:var(--muted)"><span>BEFORE</span><span>NOW</span></div>`;
  $('#compareRange').oninput=e=>{const v=e.target.value;$('#afterImg').style.clipPath=`inset(0 ${100-v}% 0 0)`;$('#compareLine').style.left=`${v}%`;};
}

function blobToDataURL(blob){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(blob);});}
function dataURLToBlob(dataURL){const [meta,data]=dataURL.split(',');const mime=(meta.match(/data:(.*?);/)||[])[1]||'image/jpeg';const bin=atob(data);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:mime});}
async function exportBackup(){
  toast('Preparing backup…'); const photos=await dbGetAll(); const packed=[];
  for(const p of photos)packed.push({...p,blob:await blobToDataURL(p.blob)});
  const payload={app:'FRAME',exportedAt:new Date().toISOString(),state,photos:packed};
  const blob=new Blob([JSON.stringify(payload)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=`frame-backup-${isoDate()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('Backup exported.');
}
$('#importInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0]; if(!file)return;
  try{const data=JSON.parse(await file.text());if(data.app!=='FRAME'||!data.state)throw new Error('bad');await dbClear();for(const p of data.photos||[])await dbPut({...p,blob:dataURLToBlob(p.blob)});state={...defaultState(),...data.state};saveState();toast('Backup imported.');render();}catch{toast('Invalid FRAME backup.');} e.target.value='';
});

if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
navInit();render();
