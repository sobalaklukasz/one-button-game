const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Sizes are relative to the screen, so everything scales when the window resizes
const ARENA_SIZE = 0.75;   // arena takes 3/4 of the screen width and height
const PLAYER_SIZE = 0.15;  // player is 15% of the arena's shorter side (height)
const PLAYER_SPEED = 0.5;  // arena's shorter side per second

const GOLD = "#ffd700";
const ARENA_FILL = "#555";

// Player position as a fraction (0..1) of the space it can move in.
// Storing it this way keeps the player in the same relative spot after a resize.
const player = { x: 0.5, y: 0.5 };

// Which arrow keys are currently held down
const keys = {};

let arena = { x: 0, y: 0, width: 0, height: 0 };
let playerW = 0;
let playerH = 0;

function loadImage(src) {
  const image = new Image();
  image.src = src;
  return image;
}
const isReady = (image) => image.complete && image.naturalWidth > 0;

// The character picture. It faces left as drawn; we mirror it when walking right.
const sprite = loadImage("player.png");
// Shown while touching the golden award
const transformSprite = loadImage("player-transform.png");
// The transformed picture is drawn smaller in its source image, so it's scaled
// up by this much to keep the body the same size as the normal character
const TRANSFORM_SCALE = 1.19;
let facingRight = false;

// Phones and tablets get on-screen arrows (their main pointer is a finger)
const isTouch = window.matchMedia("(pointer: coarse)").matches;
document.body.classList.toggle("touch", isTouch);

function resize() {
  // Match the canvas pixels to the real screen pixels so it stays sharp
  const scale = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * scale;
  canvas.height = window.innerHeight * scale;
  // Size the canvas to the visible area (on phones "100vh" can reach behind the browser bars)
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  // The arena must fit below the title and, on touch screens, above the arrows
  const gap = 16;
  const top = document.getElementById("header").getBoundingClientRect().bottom + gap;
  const bottom = isTouch
    ? document.getElementById("dpad").getBoundingClientRect().top - gap
    : window.innerHeight - gap;

  arena.width = window.innerWidth * ARENA_SIZE;
  arena.height = Math.min(window.innerHeight * ARENA_SIZE, bottom - top);
  arena.x = (window.innerWidth - arena.width) / 2;
  // Centered on the screen, unless that would overlap the title
  arena.y = isTouch
    ? top
    : Math.max(top, (window.innerHeight - arena.height) / 2);
  playerH = Math.min(arena.width, arena.height) * PLAYER_SIZE;
  playerW = playerH * (306 / 558); // keep the picture's proportions
  awardH = playerH;
  awardW = awardH * (339 / 521);

  if (awards.length === 0) spawnAwards();
}

function updatePlayer(seconds) {
  let dx = 0;
  let dy = 0;
  if (keys.ArrowLeft) dx -= 1;
  if (keys.ArrowRight) dx += 1;
  if (keys.ArrowUp) dy -= 1;
  if (keys.ArrowDown) dy += 1;

  // Moving diagonally should not be faster than moving straight
  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }

  if (dx > 0) facingRight = true;
  if (dx < 0) facingRight = false;

  const speed = Math.min(arena.width, arena.height) * PLAYER_SPEED * seconds;
  const roomX = arena.width - playerW;
  const roomY = arena.height - playerH;

  // Window too small (e.g. minimized): skip, or the math below divides by zero
  if (roomX <= 0 || roomY <= 0) return;

  // Move, then clamp so the player never leaves the arena
  player.x = Math.min(1, Math.max(0, player.x + (dx * speed) / roomX));
  player.y = Math.min(1, Math.max(0, player.y + (dy * speed) / roomY));
}

function playerBox() {
  return {
    x: arena.x + player.x * (arena.width - playerW),
    y: arena.y + player.y * (arena.height - playerH),
    w: playerW,
    h: playerH,
  };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// ---------------------------------------------------------------------------
// Awards: characters that wander around and bump into each other.
// One of them at a time has a gold outline; touching that one gives points.
// ---------------------------------------------------------------------------
const AWARD_COUNT = 5;
const AWARD_SPEED = 0.2;       // arena's shorter side per second, at 0 points
const SPEED_UP_PER_100 = 0.1;  // +10% speed for every 100 points...
const MAX_SPEED_UP = 3;        // ...up to 3 times as fast
const GOLD_SECONDS = 5;        // how long one award stays golden
const awardImage = loadImage("award.png");
let awardW = 0;
let awardH = 0;
// Each award: position as a fraction (0..1) like the player, a direction to
// walk in, and how long until it picks a new random direction
const awards = [];
let goldIndex = 0;
let goldTimer = GOLD_SECONDS;

function randomDirection() {
  const angle = Math.random() * Math.PI * 2;
  return { vx: Math.cos(angle), vy: Math.sin(angle) };
}

function awardBox(award) {
  return {
    x: arena.x + award.x * (arena.width - awardW),
    y: arena.y + award.y * (arena.height - awardH),
    w: awardW,
    h: awardH,
  };
}

function spawnAwards() {
  if (arena.width <= awardW || arena.height <= awardH) return;
  const taken = [playerBox()];
  for (let i = 0; i < AWARD_COUNT; i++) {
    // Try random spots until one doesn't overlap anything already placed
    let award;
    for (let attempt = 0; attempt < 200; attempt++) {
      award = { x: Math.random(), y: Math.random(), ...randomDirection(), turnIn: 1 + Math.random() * 2 };
      if (!taken.some((box) => overlaps(box, awardBox(award)))) break;
    }
    awards.push(award);
    taken.push(awardBox(award));
  }
  goldIndex = Math.floor(Math.random() * awards.length);
  goldTimer = GOLD_SECONDS;
}

function pickNewGold() {
  if (awards.length < 2) return;
  let next;
  do {
    next = Math.floor(Math.random() * awards.length);
  } while (next === goldIndex);
  goldIndex = next;
  goldTimer = GOLD_SECONDS;
}

function updateAwards(seconds) {
  // Place the awards once there's room (the page may start out tiny or hidden)
  if (awards.length === 0) spawnAwards();
  const roomX = arena.width - awardW;
  const roomY = arena.height - awardH;
  if (roomX <= 0 || roomY <= 0 || awards.length === 0) return;

  goldTimer -= seconds;
  if (goldTimer <= 0) pickNewGold();

  const speedUp = Math.min(MAX_SPEED_UP, 1 + (score / 100) * SPEED_UP_PER_100);
  const step = Math.min(arena.width, arena.height) * AWARD_SPEED * speedUp * seconds;
  const boxes = awards.map(awardBox);

  // Walk, now and then turning in a new random direction
  awards.forEach((award, i) => {
    award.turnIn -= seconds;
    if (award.turnIn <= 0) {
      Object.assign(award, randomDirection());
      award.turnIn = 1 + Math.random() * 2;
    }
    boxes[i].x += award.vx * step;
    boxes[i].y += award.vy * step;
  });

  // Bump into each other: push apart and walk away from each other
  for (let i = 0; i < awards.length; i++) {
    for (let j = i + 1; j < awards.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (!overlaps(a, b)) continue;
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      // Separate along the side where they overlap least
      if (overlapX < overlapY) {
        const left = a.x < b.x ? i : j;
        const right = left === i ? j : i;
        boxes[left].x -= overlapX / 2;
        boxes[right].x += overlapX / 2;
        awards[left].vx = -Math.abs(awards[left].vx);
        awards[right].vx = Math.abs(awards[right].vx);
      } else {
        const upper = a.y < b.y ? i : j;
        const lower = upper === i ? j : i;
        boxes[upper].y -= overlapY / 2;
        boxes[lower].y += overlapY / 2;
        awards[upper].vy = -Math.abs(awards[upper].vy);
        awards[lower].vy = Math.abs(awards[lower].vy);
      }
    }
  }

  // Bounce off the arena walls, and store positions back as fractions
  awards.forEach((award, i) => {
    let fx = (boxes[i].x - arena.x) / roomX;
    let fy = (boxes[i].y - arena.y) / roomY;
    if (fx < 0) { fx = 0; award.vx = Math.abs(award.vx); }
    if (fx > 1) { fx = 1; award.vx = -Math.abs(award.vx); }
    if (fy < 0) { fy = 0; award.vy = Math.abs(award.vy); }
    if (fy > 1) { fy = 1; award.vy = -Math.abs(award.vy); }
    award.x = fx;
    award.y = fy;
  });
}

// A gold-colored copy of the award's shape, used to draw its outline
let goldSilhouette = null;
function makeGoldSilhouette() {
  const c = document.createElement("canvas");
  c.width = awardImage.naturalWidth;
  c.height = awardImage.naturalHeight;
  const g = c.getContext("2d");
  g.drawImage(awardImage, 0, 0);
  g.globalCompositeOperation = "source-in"; // keep the shape, replace the colors
  g.fillStyle = GOLD;
  g.fillRect(0, 0, c.width, c.height);
  goldSilhouette = c;
}
awardImage.addEventListener("load", makeGoldSilhouette);
if (isReady(awardImage)) makeGoldSilhouette();

function drawAwards() {
  if (!isReady(awardImage)) return;
  awards.forEach((award, i) => {
    const box = awardBox(award);
    if (i === goldIndex && goldSilhouette) {
      // Outline: the gold shape drawn slightly shifted all around, then the award on top
      const t = 3;
      for (const [ox, oy] of [[-t, 0], [t, 0], [0, -t], [0, t], [-t, -t], [t, -t], [-t, t], [t, t]]) {
        ctx.drawImage(goldSilhouette, box.x + ox, box.y + oy, box.w, box.h);
      }
    }
    ctx.drawImage(awardImage, box.x, box.y, box.w, box.h);
  });
}

// ---------------------------------------------------------------------------
// Sound: plays on a loop while touching the golden award, getting louder the
// longer the touch lasts. Uses Web Audio, because iPhones ignore the volume
// setting of plain <audio> elements.
// ---------------------------------------------------------------------------
const SOUND_START_VOLUME = 0.15;
const SOUND_MAX_VOLUME = 1;
const SOUND_RAMP_SECONDS = 4; // time to go from start to max volume
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const audio = AudioContextClass ? new AudioContextClass() : null;
let touchSound = null;  // the decoded sound
let playing = null;     // { source, gain } while the sound is playing

if (audio) {
  fetch("touch.mp3")
    .then((response) => response.arrayBuffer())
    .then((data) => audio.decodeAudioData(data))
    .then((buffer) => { touchSound = buffer; })
    .catch(() => {}); // no sound is better than a broken game
  // Browsers only allow sound after the player has pressed something
  const unlock = () => { if (audio.state === "suspended") audio.resume(); };
  window.addEventListener("keydown", unlock);
  window.addEventListener("pointerdown", unlock);
}

function startSound() {
  if (!audio || !touchSound || playing) return;
  const source = audio.createBufferSource();
  source.buffer = touchSound;
  source.loop = true;
  const gain = audio.createGain();
  const now = audio.currentTime;
  gain.gain.value = SOUND_START_VOLUME;
  gain.gain.setValueAtTime(SOUND_START_VOLUME, now);
  gain.gain.linearRampToValueAtTime(SOUND_MAX_VOLUME, now + SOUND_RAMP_SECONDS);
  source.connect(gain).connect(audio.destination);
  source.start();
  playing = { source, gain };
}

function stopSound() {
  if (!playing) return;
  playing.source.stop();
  playing = null;
}

// ---------------------------------------------------------------------------
// Points: +100 when you start touching the golden award. While you keep
// touching it the character stays transformed and the sound grows louder.
// ---------------------------------------------------------------------------
const AWARD_POINTS = 100;
const POPUP_SECONDS = 1;   // how long a "+100" stays visible
const POPUP_RISE = 40;     // how far (in pixels) it floats up while fading
let score = 0;
let touchingGold = false;
let lastGoldIndex = -1;
const popups = []; // floating "+100" messages: { x, y, age }
const scoreText = document.getElementById("score");

function updateScore(seconds) {
  const gold = awards[goldIndex];
  const me = playerBox();
  const touching = Boolean(gold && overlaps(me, awardBox(gold)));
  // A new touch (or the gold just moved onto the award you're touching) scores
  if (touching && (!touchingGold || goldIndex !== lastGoldIndex)) {
    score += AWARD_POINTS;
    scoreText.textContent = "Points: " + score;
    popups.push({ x: me.x + me.w / 2, y: me.y, age: 0 });
  }
  if (touching) startSound();
  else stopSound();
  touchingGold = touching;
  lastGoldIndex = goldIndex;

  // Age the popups and drop the ones that have faded out
  for (const popup of popups) popup.age += seconds;
  while (popups.length && popups[0].age >= POPUP_SECONDS) popups.shift();
}

function drawPopups() {
  ctx.font = "bold 18px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (const popup of popups) {
    const progress = popup.age / POPUP_SECONDS; // 0 → 1
    ctx.globalAlpha = 1 - progress;
    ctx.fillStyle = GOLD;
    ctx.fillText("+" + AWARD_POINTS, popup.x, popup.y - 4 - progress * POPUP_RISE);
  }
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  const box = playerBox();
  const transformed = touchingGold;
  const image = transformed ? transformSprite : sprite;
  if (!isReady(image)) return;

  // Draw size, from the same pixel scale for both pictures, so the body
  // stays the same size; both stand on the bottom of the player's box
  const pixel = playerH / 558;
  const extra = transformed ? TRANSFORM_SCALE : 1;
  const w = image.naturalWidth * pixel * extra;
  const h = image.naturalHeight * pixel * extra;
  const centerX = box.x + box.w / 2;
  const top = box.y + box.h - h;

  ctx.save();
  ctx.translate(centerX, top);
  if (facingRight) ctx.scale(-1, 1); // mirror around the character's center
  ctx.drawImage(image, -w / 2, 0, w, h);
  ctx.restore();
}

function draw() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  // Arena: grey floor with a gold border
  ctx.fillStyle = ARENA_FILL;
  ctx.fillRect(arena.x, arena.y, arena.width, arena.height);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.strokeRect(arena.x, arena.y, arena.width, arena.height);

  drawAwards();
  drawPlayer();
  drawPopups();
}

// The game loop: runs once per screen refresh (usually 60 times a second)
let lastTime = performance.now();
function loop(now) {
  // Time since last frame, so speed is the same on fast and slow computers
  const seconds = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  updatePlayer(seconds);
  updateAwards(seconds);
  updateScore(seconds);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  if (event.key.startsWith("Arrow")) {
    keys[event.key] = true;
    event.preventDefault(); // stop arrows from scrolling the page
  }
});

window.addEventListener("keyup", (event) => {
  keys[event.key] = false;
});

// On-screen arrows press the same "keys" as the keyboard.
// An arrow counts as pressed only while a finger is on top of it, so sliding
// off releases it, sliding onto another arrow switches direction, and a finger
// that first touches elsewhere starts pressing once it slides onto an arrow.
const dpad = document.getElementById("dpad");
const dpadButtons = dpad.querySelectorAll("button");
const fingers = new Map(); // finger id -> key under that finger (or null)

function updateDpad() {
  const held = new Set(fingers.values());
  for (const button of dpadButtons) {
    const key = button.dataset.key;
    keys[key] = held.has(key);
    button.classList.toggle("pressed", held.has(key));
  }
}

function trackFinger(event) {
  const under = document.elementFromPoint(event.clientX, event.clientY);
  const button = under && under.closest("#dpad button");
  fingers.set(event.pointerId, button ? button.dataset.key : null);
  updateDpad();
}

function releaseFinger(event) {
  if (fingers.delete(event.pointerId)) updateDpad();
}

// Track every finger that touches the screen, wherever it lands
window.addEventListener("pointerdown", (event) => {
  if (!isTouch) return;
  // Browsers "lock" a touch to the element it started on; undo that so we
  // keep getting moves as the finger slides between elements
  if (event.target.hasPointerCapture && event.target.hasPointerCapture(event.pointerId)) {
    event.target.releasePointerCapture(event.pointerId);
  }
  trackFinger(event);
});
window.addEventListener("pointermove", (event) => {
  if (fingers.has(event.pointerId)) trackFinger(event);
});
window.addEventListener("pointerup", releaseFinger);
window.addEventListener("pointercancel", releaseFinger);

// Release all keys if the window loses focus, so the player doesn't keep sliding
window.addEventListener("blur", () => {
  for (const key in keys) keys[key] = false;
  fingers.clear();
  updateDpad();
});

window.addEventListener("resize", resize);

resize();
requestAnimationFrame(loop);
