const API = 'http://127.0.0.1:5000';
let currentState = [], solution = null, pathIdx = 0, playing = false, playTimer = null;

// for utility logging
function log(msg, type='info') {
  const el = document.getElementById('log');
  const d  = document.createElement('div');
  d.className = `log-entry ${type}`;
  const now = new Date();
  const ts  = [now.getHours(),now.getMinutes(),now.getSeconds()].map(n=>String(n).padStart(2,'0')).join(':');
  d.innerHTML = `<span class="ts">${ts}</span><span class="msg">${msg}</span>`;
  el.prepend(d);
}

function showLoading(msg='Processing...') {
  document.getElementById('loadingText').textContent = msg;
  document.getElementById('loading').classList.add('show');
}
function hideLoading() { document.getElementById('loading').classList.remove('show'); }

//Manhattan distance for live display
const GOAL_POS = {1:0,2:1,3:2,4:3,5:4,6:5,7:6,8:7,0:8};
function manhattanOf(state) {
  return state.reduce((acc,v,i) => {
    if (v===0) return acc;
    const gi = GOAL_POS[v];
    return acc + Math.abs(Math.floor(i/3)-Math.floor(gi/3)) + Math.abs(i%3-gi%3);
  }, 0);
}

//Board rendering
function renderBoard(containerId, state, movedIdx=-1) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  state.forEach((v,i) => {
    const d = document.createElement('div');
    d.className = 'tile'+(v===0?' blank':'')+(i===movedIdx?' moved':'');
    d.textContent = v===0 ? '' : v;
    el.appendChild(d);
  });
}

function renderGoal() {
  const el = document.getElementById('boardGoal');
  el.innerHTML = '';
  [1,2,3,4,5,6,7,8,0].forEach(v => {
    const d = document.createElement('div');
    d.className = 'tile'+(v===0?' blank':' goal-match');
    d.textContent = v===0 ? '' : v;
    el.appendChild(d);
  });
}

// ── Cost display 
function updateCosts(h, g) {
  const maxH = 24;
  document.getElementById('hVal').textContent  = h;
  document.getElementById('hBadge').textContent = `h = ${h}`;
  document.getElementById('hFill').style.width  = Math.min(100,(h/maxH)*100)+'%';
  document.getElementById('hVal2').textContent  = h;
  document.getElementById('gVal').textContent   = g===undefined ? '—' : g;
  document.getElementById('fVal').textContent   = g===undefined ? '—' : (g+h);
}

// for mini boards
function renderMiniBoard(state, activeClass='') {
  const grid = document.createElement('div');
  grid.className = 'mini-grid';
  state.forEach(v => {
    const t = document.createElement('div');
    t.className = 'mini-tile'+(v===0?' blank':'')+(activeClass?` ${activeClass}`:'');
    t.textContent = v===0 ? '' : v;
    grid.appendChild(t);
  });
  return grid;
}

// for reset ui
function resetUI() {
  ['sVisited','sPath','sStep','sMove'].forEach(id=>document.getElementById(id).textContent='—');
  ['gVal','hVal2','fVal'].forEach(id=>document.getElementById(id).textContent='—');
  document.getElementById('pathInfo').textContent  = 'run A* solver to see optimal solution path';
  document.getElementById('moveChip').textContent  = '—';
  document.getElementById('moveChip').className    = 'move-chip start';
  document.getElementById('pathScroll').innerHTML  = '';
  document.getElementById('visitedGrid').innerHTML = '';
  document.getElementById('visitedBadge').textContent = '0 states';
  document.getElementById('solvedBadge').style.display = 'none';
  ['btnPrev','btnNext','btnPlay'].forEach(id=>document.getElementById(id).disabled=true);
}

// ── Server check 
async function checkServer() {
  try {
    const r = await fetch(`${API}/api/new-puzzle`);
    if (r.ok) {
      document.getElementById('serverBadge').textContent = 'flask: connected';
      document.getElementById('serverBadge').className   = 'badge green';
      log('Connected to Flask A* server','success');
    }
  } catch {
    document.getElementById('serverBadge').textContent = 'server offline';
    document.getElementById('serverBadge').className   = 'badge';
    log('Cannot reach Flask server — run: python app.py','err');
  }
}

// ── New Puzzle 
async function newPuzzle() {
  stopPlay();
  solution = null; pathIdx = 0;
  resetUI();
  showLoading('Generating puzzle...');
  try {
    const r    = await fetch(`${API}/api/new-puzzle`);
    const data = await r.json();
    currentState = data.state;
    renderBoard('boardCurrent', currentState);
    updateCosts(data.heuristic, 0);
    document.getElementById('btnSolve').disabled = false;
    log(`New puzzle generated — h(n) = ${data.heuristic}`,'info');
  } catch(e) {
    log('Failed to reach server: '+e.message,'err');
  }
  hideLoading();
}

// for solv btn
async function solvePuzzle() {
  stopPlay();
  document.getElementById('btnSolve').disabled = true;
  showLoading('Running A* Search…');
  log('Starting A* Search  f(n) = g(n) + h(n)…','info');
  try {
    // Use query parameter — avoids any URL routing issue with commas
    const url  = `${API}/api/solve?state=${currentState.join(',')}`;
    const r    = await fetch(url);
    const data = await r.json();

    if (!data.solved) {
      log('No solution found — puzzle may be unsolvable','err');
      document.getElementById('btnSolve').disabled = false;
      hideLoading(); return;
    }

    solution = data;
    const pathSet = new Set(data.path.map(s=>s.join(',')));

    document.getElementById('sVisited').textContent     = data.stats.visited_count;
    document.getElementById('sPath').textContent        = data.stats.path_length;
    document.getElementById('visitedBadge').textContent = `${data.stats.visited_count} states`;

    // Render all visited states
    const vGrid = document.getElementById('visitedGrid');
    vGrid.innerHTML = '';
    const frag = document.createDocumentFragment();
    data.visited.forEach((s,i) => {
      const onPath = pathSet.has(s.join(','));
      const item   = document.createElement('div');
      item.className = 'visited-item'+(onPath?' on-path':'');
      item.appendChild(renderMiniBoard(s, onPath?'active':''));
      const lbl = document.createElement('div');
      lbl.className   = 'visited-num';
      lbl.textContent = `#${i+1}`;
      item.appendChild(lbl);
      frag.appendChild(item);
    });
    vGrid.appendChild(frag);

    pathIdx = 0;
    renderPathStep(0);
    buildPathThumbs();

    ['btnPrev','btnNext','btnPlay'].forEach(id=>document.getElementById(id).disabled=false);

    const badge = document.getElementById('solvedBadge');
    badge.textContent   = `optimal: ${data.stats.path_length} moves`;
    badge.className     = 'badge green';
    badge.style.display = '';

    log(`A* solved! Optimal path: ${data.stats.path_length} moves · visited: ${data.stats.visited_count} states`,'success');
    startPlay();
  } catch(e) {
    log('Solver error: '+e.message,'err');
    document.getElementById('btnSolve').disabled = false;
  }
  hideLoading();
}

//path thumbnails
function buildPathThumbs() {
  const scroll = document.getElementById('pathScroll');
  scroll.innerHTML = '';
  solution.path.forEach((s,i) => {
    const isGoal = i===solution.path.length-1;
    const thumb  = document.createElement('div');
    thumb.className   = 'path-thumb'+(isGoal?' goal-thumb':'');
    thumb.dataset.idx = i;
    thumb.appendChild(renderMiniBoard(s, i===pathIdx?'active':(isGoal?'goal-tile':'')));
    const lbl = document.createElement('div');
    lbl.className   = 'thumb-label';
    lbl.textContent = i===0?'start':isGoal?'goal':`s${i}`;
    thumb.appendChild(lbl);
    thumb.onclick = ()=>{ stopPlay(); renderPathStep(i); scrollThumb(i); };
    scroll.appendChild(thumb);
  });
}

function scrollThumb(idx) {
  const scroll = document.getElementById('pathScroll');
  const thumb  = scroll.children[idx];
  if (thumb) thumb.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
}

//render path step
function renderPathStep(idx) {
  if (!solution) return;
  pathIdx = Math.max(0, Math.min(solution.path.length-1, idx));
  const s    = solution.path[pathIdx];
  const move = solution.moves[pathIdx];

  let movedIdx = -1;
  if (pathIdx > 0) {
    const prev = solution.path[pathIdx-1];
    for (let i=0;i<9;i++) { if (s[i]!==prev[i]&&s[i]!==0){movedIdx=i;break;} }
  }
  renderBoard('boardCurrent', s, movedIdx);

  const g = pathIdx;
  const h = manhattanOf(s);
  updateCosts(h, g);

  const chip = document.getElementById('moveChip');
  if (pathIdx===0)                          { chip.textContent='START'; chip.className='move-chip start'; }
  else if (pathIdx===solution.path.length-1){ chip.textContent='GOAL';  chip.className='move-chip goal';  }
  else { chip.textContent = move?move.dir.toUpperCase():'—'; chip.className='move-chip'; }

  document.getElementById('sStep').textContent = pathIdx;
  document.getElementById('sMove').textContent = move?move.dir:'start';
  document.getElementById('pathInfo').textContent = `step ${pathIdx} / ${solution.path.length-1}`;

  document.getElementById('btnPrev').disabled = pathIdx===0;
  document.getElementById('btnNext').disabled = pathIdx===solution.path.length-1;

  const scrollEl = document.getElementById('pathScroll');
  Array.from(scrollEl.children).forEach((thumb,i)=>{
    const isGoal = i===solution.path.length-1;
    thumb.className = 'path-thumb'+(i===pathIdx?' active':'')+(isGoal?' goal-thumb':'');
    thumb.querySelectorAll('.mini-tile:not(.blank)').forEach(t=>{
      t.classList.remove('active','goal-tile');
      if (i===pathIdx)  t.classList.add('active');
      else if (isGoal)  t.classList.add('goal-tile');
    });
  });
  scrollThumb(pathIdx);
}

// playback
function stepPath(d) { stopPlay(); renderPathStep(pathIdx+d); }

function startPlay() {
  if (!solution) return;
  playing = true;
  document.getElementById('btnPlay').textContent = '⏸ Pause';
  const speed = parseInt(document.getElementById('speedSlider').value);
  playTimer = setInterval(()=>{
    if (pathIdx < solution.path.length-1) renderPathStep(pathIdx+1);
    else stopPlay();
  }, speed);
}

function stopPlay() {
  playing = false; clearInterval(playTimer);
  document.getElementById('btnPlay').textContent = '▶ Play';
}

function togglePlay() { if(playing) stopPlay(); else startPlay(); }

document.getElementById('speedSlider').addEventListener('input', function(){
  document.getElementById('speedVal').textContent = this.value+'ms';
  if(playing){ stopPlay(); startPlay(); }
});

// init
renderGoal();
checkServer();
newPuzzle();
