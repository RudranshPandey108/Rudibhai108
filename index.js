// ====== Canvas + Game State ======
const cvs = document.getElementById("game");
const ctx = cvs.getContext("2d");

const timeEl = document.getElementById("time");
const bestEl = document.getElementById("best");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const retryBtn = document.getElementById("retryBtn");
const soundBtn = document.getElementById("soundBtn");

const bg = document.getElementById("bg");
const hit = document.getElementById("hit");
const tick = document.getElementById("tick");

let best = +(localStorage.getItem("night_escape_best") || 0);
bestEl.textContent = best.toFixed(1);

let running = false, paused = false, over = false;
let startTime = 0, elapsed = 0, lastFrame = 0;

const player = { x: cvs.width/2, y: cvs.height*0.78, r: 14, speed: 5 };
const ghosts = [];
let spawnTimer = 0;
const lightRadius = 110; // flashlight radius

// ====== Utility ======
function rand(min, max){ return Math.random()*(max-min)+min; }
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

// ====== Ghost Factory ======
function spawnGhost(){
  // spawn around top/edges, drift toward player
  const side = Math.floor(rand(0,4));
  let gx, gy;
  if (side === 0) { gx = rand(0, cvs.width); gy = -40; }
  else if (side === 1) { gx = cvs.width+40; gy = rand(0, cvs.height*0.6); }
  else if (side === 2) { gx = rand(0, cvs.width); gy = cvs.height+40; }
  else { gx = -40; gy = rand(0, cvs.height*0.6); }

  const speed = rand(0.8, 1.8);
  ghosts.push({ x: gx, y: gy, speed, r: rand(10, 22), wob: rand(0, Math.PI*2) });
}

// ====== Drawing ======
function drawBackground(){
  // subtle noise / gradient already in CSS background
  // we draw darkness layer & carve flashlight hole using composite
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.92)";
  ctx.fillRect(0,0,cvs.width,cvs.height);

  // flashlight hole
  ctx.globalCompositeOperation = "destination-out";
  const grad = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, lightRadius);
  grad.addColorStop(0, "rgba(0,0,0,1)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(player.x, player.y, lightRadius, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  // faint red haze (fear)
  ctx.fillStyle = "rgba(179,0,27,0.06)";
  ctx.fillRect(0,0,cvs.width,cvs.height);
}

function drawPlayer(){
  ctx.fillStyle = "#8ef";
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.r, 0, Math.PI*2);
  ctx.fill();
}

function drawGhost(g){
  // glowing ghost orb
  const glow = ctx.createRadialGradient(g.x, g.y, 2, g.x, g.y, g.r*2.2);
  glow.addColorStop(0, "rgba(255,255,255,0.9)");
  glow.addColorStop(1, "rgba(179,0,27,0.0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(g.x, g.y, g.r*2.2, 0, Math.PI*2); ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI*2); ctx.fill();
}

// ====== Update ======
function update(dt){
  // spawn faster over time
  spawnTimer -= dt;
  if (spawnTimer <= 0){
    spawnGhost();
    spawnTimer = Math.max(0.18, 0.8 - elapsed*0.02);
  }

  // update ghosts (home toward player with wobble)
  for (let i=ghosts.length-1; i>=0; i--){
    const g = ghosts[i];
    const dx = player.x - g.x;
    const dy = player.y - g.y;
    const d = Math.hypot(dx,dy) || 1;
    g.x += (dx/d) * g.speed * (1 + elapsed*0.02);
    g.y += (dy/d) * g.speed * (1 + elapsed*0.02);
    g.wob += 0.08;
    g.x += Math.cos(g.wob) * 0.6;

    // collide?
    if (Math.hypot(player.x-g.x, player.y-g.y) < player.r + g.r*0.75){
      gameOver();
      return;
    }

    // purge if somehow far off
    if (g.x<-80||g.x>cvs.width+80||g.y<-80||g.y>cvs.height+80) ghosts.splice(i,1);
  }
}

// ====== Main Loop ======
function frame(ts){
  if (!running || paused) return;
  if (!lastFrame) lastFrame = ts;
  const dt = (ts - lastFrame)/1000;
  lastFrame = ts;

  elapsed = (performance.now() - startTime)/1000;
  timeEl.textContent = elapsed.toFixed(1);

  ctx.clearRect(0,0,cvs.width,cvs.height);
  drawBackground();
  drawPlayer();
  ghosts.forEach(drawGhost);
  update(dt);

  requestAnimationFrame(frame);
}

// ====== Controls: Joystick (mobile + desktop drag) ======
const joy = document.getElementById("joystick");
const stick = document.getElementById("stick");
const center = { x: 60, y: 60 };
let active = false;

function setStick(dx){
  // limit radius 40
  const len = Math.hypot(dx.x, dx.y) || 1;
  const max = 40;
  let mx = dx.x, my = dx.y;
  if (len > max){ mx = dx.x/len*max; my = dx.y/len*max; }
  stick.style.left = (center.x - 21 + mx) + "px";
  stick.style.top  = (center.y - 21 + my) + "px";

  // move player horizontally; vertical fixed (more horror feel)
  player.x = clamp(player.x + (mx/8), player.r+4, cvs.width - player.r - 4);
}

function resetStick(){
  stick.style.left = (center.x - 21) + "px";
  stick.style.top  = (center.y - 21) + "px";
}

function joyPos(e){
  const rect = joy.getBoundingClientRect();
  const px = (e.touches? e.touches[0].clientX : e.clientX) - rect.left;
  const py = (e.touches? e.touches[0].clientY : e.clientY) - rect.top;
  return { x: px - center.x, y: py - center.y };
}

["mousedown","touchstart"].forEach(ev=>joy.addEventListener(ev, e=>{ active=true; setStick(joyPos(e)); e.preventDefault(); }, {passive:false}));
["mousemove","touchmove"].forEach(ev=>joy.addEventListener(ev, e=>{ if(active){ setStick(joyPos(e)); e.preventDefault(); }}, {passive:false}));
["mouseup","mouseleave","touchend","touchcancel"].forEach(ev=>joy.addEventListener(ev, ()=>{ active=false; resetStick(); }));

// ====== Buttons ======
startBtn.onclick = () => {
  if (running) return;
  running = true; paused = false; over = false;
  startTime = performance.now(); elapsed = 0; lastFrame = 0;
  ghosts.length = 0; spawnTimer = 0;
  // user gesture unlocks audio
  try { bg.volume = 0.4; bg.play(); } catch(e){}
  pauseBtn.disabled = false; retryBtn.disabled = true;
  requestAnimationFrame(frame);
};

pauseBtn.onclick = () => {
  if (!running || over) return;
  paused = !paused;
  pauseBtn.textContent = paused ? "▶ Resume" : "⏸ Pause";
  if (paused) { bg.pause(); }
  else { try{ bg.play(); }catch(e){} requestAnimationFrame(frame); }
};

retryBtn.onclick = () => {
  over = false; running = false; paused = false;
  pauseBtn.textContent = "⏸ Pause"; pauseBtn.disabled = true;
  timeEl.textContent = "0.0"; startBtn.click();
};

let muted = false;
soundBtn.onclick = ()=>{
  muted = !muted;
  [bg, hit, tick].forEach(a=> a.muted = muted);
  soundBtn.textContent = muted ? "🔇" : "🔊";
};

// ====== Game Over ======
const jumpscare = document.getElementById("jumpscare");
function gameOver(){
  over = true; running = false;
  pauseBtn.disabled = true; retryBtn.disabled = false;
  try { hit.currentTime = 0; hit.play(); } catch(e){}
  bg.pause();

  // update best time
  if (elapsed > best){ best = elapsed; localStorage.setItem("night_escape_best", best); bestEl.textContent = best.toFixed(1); }

  // quick jumpscare flash
  jumpscare.style.display = "flex";
  setTimeout(()=>{ jumpscare.style.display = "none"; }, 400);
    }
