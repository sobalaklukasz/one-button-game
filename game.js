const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Sizes are relative to the screen, so everything scales when the window resizes
const ARENA_SIZE = 0.75;   // arena takes 3/4 of the screen width and height
const PLAYER_SIZE = 0.15;  // player is 15% of the arena's shorter side (height)
const PLAYER_SPEED = 0.5;  // arena's shorter side per second

const GOLD = "#ffd700";
const ARENA_FILL = "#3a3a3a";

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

  // The arena must fit below the title and above the buttons and, on touch
  // screens, the joystick (measured at its resting spot, even if a finger is
  // currently moving it)
  const gap = 16;
  const top = document.getElementById("header").getBoundingClientRect().bottom + gap;
  let bottom = document.getElementById("controls").getBoundingClientRect().top - gap;
  if (isTouch) {
    const moved = joystick.style.cssText;
    joystick.style.cssText = "";
    bottom = Math.min(bottom, joystick.getBoundingClientRect().top - gap);
    joystick.style.cssText = moved;
  }

  arena.width = window.innerWidth * ARENA_SIZE;
  arena.height = Math.min(window.innerHeight * ARENA_SIZE, bottom - top);
  arena.x = (window.innerWidth - arena.width) / 2;
  // Centered on the screen, unless that would overlap the title or buttons
  arena.y = isTouch
    ? top
    : Math.max(top, Math.min((window.innerHeight - arena.height) / 2, bottom - arena.height));
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

  // The joystick, when held, overrides the keys. Pushing it only a little
  // walks slowly; pushing it to the edge walks at full speed.
  if (stick.active) {
    dx = stick.x;
    dy = stick.y;
  }

  // The first move starts the game
  if (!started && (dx !== 0 || dy !== 0)) setStarted(true);

  if (dx > 0.1) facingRight = true;
  if (dx < -0.1) facingRight = false;

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
// How many awards each difficulty has. One is golden at a time, so harder
// levels mean more non-golden ones to dodge.
const DIFFICULTY_AWARDS = { easy: 4, normal: 6, hard: 9 };
let difficulty = "normal";
try {
  // Remember the last chosen difficulty on this device
  const saved = localStorage.getItem("difficulty");
  if (saved in DIFFICULTY_AWARDS) difficulty = saved;
} catch (e) { /* storage blocked: just use the default */ }
const AWARD_SPEED = 0.2;       // arena's shorter side per second, at 0 points
const SPEED_UP_PER_100 = 0.1;  // +10% speed for every 100 points...
const MAX_SPEED_UP = 3;        // ...up to 3 times as fast
const GOLD_SECONDS = 5;        // how long one award stays golden
const BLINK_SECONDS = 1;       // the outline blinks during the last second
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
  for (let i = 0; i < DIFFICULTY_AWARDS[difficulty]; i++) {
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
    // In its last second the outline blinks quickly (5 times a second)
    const blinkOff = goldTimer < BLINK_SECONDS && Math.floor(goldTimer * 10) % 2 === 1;
    if (i === goldIndex && goldSilhouette && !blinkOff) {
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
const SOUND_START_VOLUME = 0.6;
const SOUND_MAX_VOLUME = 1;
const SOUND_RAMP_SECONDS = 4; // time to go from start to max volume
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const audio = AudioContextClass ? new AudioContextClass() : null;
let touchSound = null;  // the decoded sound
let playing = null;     // { source, gain } while the sound is playing

// iPhones mute web page sound when the ring/silent switch is on silent.
// "playback" tells iOS (17 and newer) this is game audio that should play anyway.
if (navigator.audioSession) {
  try { navigator.audioSession.type = "playback"; } catch (e) { /* older iOS */ }
}

if (audio) {
  fetch("touch.mp3")
    .then((response) => response.arrayBuffer())
    // (callback form also works on older Safari versions)
    .then((data) => new Promise((resolve, reject) => audio.decodeAudioData(data, resolve, reject)))
    .then((buffer) => { touchSound = buffer; })
    .catch(() => {}); // no sound is better than a broken game

  // Browsers only allow sound after the player has really pressed something.
  // On touch screens only the END of a touch counts (not the start), so listen
  // to all of these. iPhones can also pause audio after switching apps
  // ("interrupted"), so try again on every press, not just the first.
  const unlock = () => {
    if (audio.state !== "running") audio.resume().catch(() => {});
    if (!unlock.primed) {
      // Playing a tiny silent sound during the press makes iPhones fully unlock audio
      const silent = audio.createBufferSource();
      silent.buffer = audio.createBuffer(1, 1, 22050);
      silent.connect(audio.destination);
      silent.start();
      unlock.primed = true;
    }
  };
  for (const type of ["keydown", "pointerdown", "pointerup", "touchend", "click"]) {
    window.addEventListener(type, unlock, true);
  }
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
// Points: +100 when you start touching the golden award, then another +100
// every half second for as long as you keep touching it. Meanwhile the
// character stays transformed and the sound grows louder.
// Bumping into any other award costs 200 points (but never below 0).
// ---------------------------------------------------------------------------
const AWARD_POINTS = 100;
const AWARD_REPEAT_SECONDS = 0.5; // how often points keep coming while touching
let goldTouchTime = 0;            // time since the last points from the gold one
const PENALTY_POINTS = 200;
const POPUP_SECONDS = 1;   // how long a "+100" stays visible
const POPUP_RISE = 40;     // how far (in pixels) it floats up while fading
let score = 0;
let touchingGold = false;
let wasTouching = [];      // which awards the player touched last frame
let lastGoldIndex = -1;
const popups = []; // floating "+100" / "-200" messages: { x, y, age, text, color }
const scoreText = document.getElementById("score");

function addPoints(amount, box) {
  amount = Math.max(amount, -score); // can't lose more than you have
  if (amount === 0) return;
  score += amount;
  scoreText.textContent = "Points: " + score;
  noteScore();
  popups.push({
    x: box.x + box.w / 2,
    y: box.y,
    age: 0,
    text: (amount > 0 ? "+" : "") + amount,
    color: amount > 0 ? GOLD : "#ff4040",
  });
}

function updateScore(seconds) {
  const me = playerBox();
  const touchingNow = awards.map((award) => overlaps(me, awardBox(award)));
  const touching = Boolean(touchingNow[goldIndex]);

  // A new touch of the gold one (or the gold just moved onto the award
  // you're touching) scores
  if (touching && (!touchingGold || goldIndex !== lastGoldIndex)) {
    addPoints(AWARD_POINTS, me);
    goldTouchTime = 0;
  } else if (touching) {
    // Still touching: keep the money coming
    goldTouchTime += seconds;
    while (goldTouchTime >= AWARD_REPEAT_SECONDS) {
      goldTouchTime -= AWARD_REPEAT_SECONDS;
      addPoints(AWARD_POINTS, me);
    }
  }
  // Starting to touch any other award costs points, or with perma death
  // switched on, ends the game (but not while you have 0 points: there's
  // nothing to lose yet)
  const bumped = touchingNow.some((now, i) => now && !wasTouching[i] && i !== goldIndex);
  if (bumped && permadeath.checked && score > 0) {
    gameOver();
    return;
  }
  touchingNow.forEach((now, i) => {
    if (now && !wasTouching[i] && i !== goldIndex) addPoints(-PENALTY_POINTS, me);
  });

  if (touching) startSound();
  else stopSound();
  touchingGold = touching;
  wasTouching = touchingNow;
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
    ctx.fillStyle = popup.color;
    ctx.fillText(popup.text, popup.x, popup.y - 4 - progress * POPUP_RISE);
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

// The floor picture, repeated like tiles to cover the whole arena
const FLOOR_TILE_SIZE = 1.2; // one tile is 1.2 × the arena's shorter side wide
const floorImage = loadImage("money.jpg");
let floorPattern = null;

function floorFill() {
  if (!isReady(floorImage)) return ARENA_FILL;
  if (!floorPattern) floorPattern = ctx.createPattern(floorImage, "repeat");
  // Scale the tiles with the arena and start them at its top-left corner
  const scale = (Math.min(arena.width, arena.height) * FLOOR_TILE_SIZE) / floorImage.naturalWidth;
  floorPattern.setTransform(new DOMMatrix().translateSelf(arena.x, arena.y).scaleSelf(scale));
  return floorPattern;
}

function draw() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  // Arena: money floor (grey until the picture loads) with a gold border
  ctx.fillStyle = floorFill();
  ctx.fillRect(arena.x, arena.y, arena.width, arena.height);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.strokeRect(arena.x, arena.y, arena.width, arena.height);

  drawAwards();
  drawPlayer();
  drawPopups();
}

// ---------------------------------------------------------------------------
// Perma death: a black "GAME OVER" screen for a few seconds, then a new game
// ---------------------------------------------------------------------------
const GAME_OVER_SECONDS = 3;
const permadeath = document.getElementById("permadeath");
let gameOverTimer = 0; // > 0 while the game over screen is showing

try {
  permadeath.checked = localStorage.getItem("permadeath") === "1";
} catch (e) { /* storage blocked: starts unticked */ }
permadeath.addEventListener("change", () => {
  try { localStorage.setItem("permadeath", permadeath.checked ? "1" : "0"); } catch (e) { /* ignore */ }
  permadeath.blur();
  showRecord(); // perma death has its own ranking
});

// ---------------------------------------------------------------------------
// Waiting to start: after loading or restarting, the awards stand still until
// the player makes their first move. Perma death can only be switched before that.
// ---------------------------------------------------------------------------
let started = false;

function setStarted(value) {
  started = value;
  permadeath.disabled = value;
  if (value) gameKey = rankingKey();
}

function drawStartHint() {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 18px 'Courier New', monospace";
  const x = arena.x + arena.width / 2;
  const y = arena.y + arena.height * 0.3;
  // Dark outline so it reads on the money floor
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#000";
  ctx.strokeText("Move to start", x, y);
  ctx.fillStyle = GOLD;
  ctx.fillText("Move to start", x, y);
}

function gameOver() {
  rememberLastScore();
  gameKey = null; // already remembered; the restart afterwards shouldn't again
  gameOverTimer = GAME_OVER_SECONDS;
  stopSound();
  uploadRecords(); // don't make a new record wait
}

const gameOverImage = loadImage("game-over.jpg");

// Text with a black outline, so it stays readable on top of the picture
function outlinedText(text, x, y, color) {
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawGameOver() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  // The picture, as big as fits inside the arena, centered
  if (isReady(gameOverImage)) {
    const fit = Math.min(arena.width / gameOverImage.naturalWidth, arena.height / gameOverImage.naturalHeight);
    const w = gameOverImage.naturalWidth * fit;
    const h = gameOverImage.naturalHeight * fit;
    ctx.drawImage(gameOverImage, arena.x + (arena.width - w) / 2, arena.y + (arena.height - h) / 2, w, h);
  }

  // Text in the lower part, below the glowing eyes
  const centerX = arena.x + arena.width / 2;
  const textY = arena.y + arena.height * 0.78;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.round(Math.min(arena.width / 7, 56))}px 'Courier New', monospace`;
  outlinedText("GAME OVER", centerX, textY - 20, "#ff4040");
  ctx.font = "bold 18px 'Courier New', monospace";
  outlinedText("Points: " + score, centerX, textY + 30, GOLD);
  ctx.font = "14px 'Courier New', monospace";
  outlinedText("Restarting in " + Math.ceil(gameOverTimer) + "...", centerX, textY + 60, "#fff");
}

// The game loop: runs once per screen refresh (usually 60 times a second)
let lastTime = performance.now();
function loop(now) {
  // Time since last frame, so speed is the same on fast and slow computers
  const seconds = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (confirmingRestart) {
    // Paused: show the game as it was, with the question on top
    draw();
    drawRestartQuestion();
  } else if (gameOverTimer > 0) {
    // Everything stands still while the game over screen shows
    gameOverTimer -= seconds;
    if (gameOverTimer <= 0) restart();
    else drawGameOver();
  } else {
    updatePlayer(seconds);
    if (started) {
      updateAwards(seconds);
      updateScore(seconds);
    }
    draw();
    if (!started) drawStartHint();
  }
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  if (event.key.startsWith("Arrow")) {
    cancelRestart(); // moving means "keep playing"
    keys[event.key] = true;
    event.preventDefault(); // stop arrows from scrolling the page
  }
});

window.addEventListener("keyup", (event) => {
  keys[event.key] = false;
});

// ---------------------------------------------------------------------------
// Records: the best score ever for each difficulty, with and without perma
// death, shared by everyone who plays. Stored in a Firebase Realtime Database;
// its rules only accept a new record if it's higher than the old one. Without
// a database URL the records are kept on this device only.
// ---------------------------------------------------------------------------
const RECORDS_DB_URL = "https://auuuuu-83d66-default-rtdb.europe-west1.firebasedatabase.app";
// "_pd" = perma death ranking
const records = { easy: 0, normal: 0, hard: 0, easy_pd: 0, normal_pd: 0, hard_pd: 0 };
const recordLabel = document.getElementById("record-label");
const recordValue = document.getElementById("record-value");
const pendingUploads = new Set(); // rankings with a new record to send

// Which ranking the current game counts for
function rankingKey() {
  return difficulty + (permadeath.checked ? "_pd" : "");
}
let uploadTimer = null;

try {
  Object.assign(records, JSON.parse(localStorage.getItem("records")) || {});
} catch (e) { /* no saved records yet, or storage blocked */ }

function saveRecordsLocally() {
  try { localStorage.setItem("records", JSON.stringify(records)); } catch (e) { /* ignore */ }
}

// Personal stats, kept only on this device: your best and your last game's
// score, for each ranking (difficulty, with or without perma death)
const personal = { best: {}, last: {} };
const personalBest = document.getElementById("personal-best");
const personalLast = document.getElementById("personal-last");
let gameKey = null; // the ranking the current game counts for (set when it starts)

try {
  const saved = JSON.parse(localStorage.getItem("personal"));
  if (saved) Object.assign(personal, saved);
} catch (e) { /* nothing saved yet, or storage blocked */ }

function savePersonal() {
  try { localStorage.setItem("personal", JSON.stringify(personal)); } catch (e) { /* ignore */ }
}

function showPersonal() {
  const key = rankingKey();
  personalBest.textContent = personal.best[key] || 0;
  personalLast.textContent = "Last: " + (key in personal.last ? personal.last[key] : "–");
}

// Remember the score of a game that's ending (game over, restart, leaving)
function rememberLastScore() {
  if (!gameKey) return; // no game was played since the last restart
  personal.last[gameKey] = score;
  savePersonal();
  showPersonal();
}

function showRecord() {
  showPersonal();
  const name = difficulty[0].toUpperCase() + difficulty.slice(1);
  recordLabel.textContent = (permadeath.checked ? "☠ " : "") + name + " record";
  recordValue.textContent = records[rankingKey()];
}

// Called whenever the score changes
function noteScore() {
  const key = rankingKey();
  if (score > (personal.best[key] || 0)) {
    personal.best[key] = score;
    savePersonal();
    showPersonal();
  }
  if (score <= records[key]) return;
  records[key] = score;
  saveRecordsLocally();
  showRecord();
  // Send it, but at most about once a second while points keep coming
  pendingUploads.add(key);
  if (!uploadTimer) uploadTimer = setTimeout(uploadRecords, 1000);
}

function uploadRecords(keepalive = false) {
  clearTimeout(uploadTimer);
  uploadTimer = null;
  if (!RECORDS_DB_URL) return pendingUploads.clear();
  for (const level of pendingUploads) {
    fetch(`${RECORDS_DB_URL}/records/${level}.json`, {
      method: "PUT",
      body: JSON.stringify(records[level]),
      keepalive, // lets the last upload finish even if the page is closing
    }).catch(() => {}); // offline: the next record will try again
  }
  pendingUploads.clear();
}

// Take the shared records, keeping our own if ours is higher (and sending it)
function mergeRemoteRecords(remote) {
  for (const level in records) {
    const theirs = Number(remote && remote[level]) || 0;
    if (theirs > records[level]) records[level] = theirs;
    else if (records[level] > theirs) pendingUploads.add(level);
  }
  saveRecordsLocally();
  showRecord();
  if (pendingUploads.size) uploadRecords();
}

function listenForRecords() {
  if (!RECORDS_DB_URL) return;
  const url = `${RECORDS_DB_URL}/records.json`;
  fetch(url).then((r) => r.json()).then(mergeRemoteRecords).catch(() => {});
  if (!window.EventSource) {
    setInterval(() => fetch(url).then((r) => r.json()).then(mergeRemoteRecords).catch(() => {}), 15000);
    return;
  }
  // Live updates: Firebase pushes every change as it happens
  const stream = new EventSource(url);
  const onChange = (event) => {
    const { path, data } = JSON.parse(event.data);
    if (path === "/") mergeRemoteRecords(data);
    else mergeRemoteRecords({ ...records, [path.slice(1)]: data });
  };
  stream.addEventListener("put", onChange);
  stream.addEventListener("patch", (event) => {
    const { data } = JSON.parse(event.data);
    mergeRemoteRecords({ ...records, ...data });
  });
}

// Send any waiting record when the player leaves or switches apps
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && pendingUploads.size) uploadRecords(true);
});

// Closing or reloading the page ends the game too: remember its score
window.addEventListener("pagehide", rememberLastScore);

listenForRecords();

// ---------------------------------------------------------------------------
// Restart and difficulty buttons
// ---------------------------------------------------------------------------
const difficultyButtons = document.querySelectorAll("#difficulty button");

function showDifficulty() {
  for (const button of difficultyButtons) {
    button.classList.toggle("selected", button.dataset.level === difficulty);
  }
  showRecord();
}

function restart() {
  rememberLastScore();
  gameKey = null;
  cancelRestart();
  gameOverTimer = 0;
  setStarted(false); // wait for the first move again
  score = 0;
  scoreText.textContent = "Points: 0";
  player.x = 0.5;
  player.y = 0.5;
  facingRight = false;
  popups.length = 0;
  stopSound();
  touchingGold = false;
  wasTouching = [];
  lastGoldIndex = -1;
  awards.length = 0;
  spawnAwards(); // fresh random spots (and the right number for the difficulty)
}

// Restart asks for a second press while a game is running, so a stray tap
// doesn't throw your points away. The game is paused while it asks.
const restartButton = document.getElementById("restart");
let confirmingRestart = false;

function cancelRestart() {
  if (!confirmingRestart) return;
  confirmingRestart = false;
  restartButton.classList.remove("confirm");
  lastTime = performance.now(); // don't count the paused time as a big jump
}

restartButton.addEventListener("click", () => {
  const nothingToLose = !started || gameOverTimer > 0;
  if (confirmingRestart || nothingToLose) {
    restart();
  } else {
    confirmingRestart = true;
    restartButton.classList.add("confirm");
    stopSound();
  }
  restartButton.blur(); // so the keyboard doesn't keep "pressing" it
});

function drawRestartQuestion() {
  // Dim the paused game and ask
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(arena.x, arena.y, arena.width, arena.height);
  const x = arena.x + arena.width / 2;
  const y = arena.y + arena.height / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = GOLD;
  ctx.font = "bold 20px 'Courier New', monospace";
  ctx.fillText("Press Restart", x, y - 28);
  ctx.fillText("once more to restart", x, y);
  ctx.fillStyle = "#fff";
  ctx.font = "14px 'Courier New', monospace";
  ctx.fillText("Move to keep playing", x, y + 36);
}

for (const button of difficultyButtons) {
  button.addEventListener("click", () => {
    difficulty = button.dataset.level;
    try { localStorage.setItem("difficulty", difficulty); } catch (e) { /* ignore */ }
    showDifficulty();
    restart();
    button.blur();
  });
}
showDifficulty();

// ---------------------------------------------------------------------------
// Joystick (touch screens): put a finger down anywhere (except on a button)
// and the joystick jumps under it; drag to walk in that direction. Lift the
// finger and it goes back to its resting spot at the bottom right.
// ---------------------------------------------------------------------------
const STICK_RADIUS = 50;   // how far (px) the knob can move from the center
const STICK_DEADZONE = 0.15; // tiny movements near the center are ignored
const joystick = document.getElementById("joystick");
const knob = document.getElementById("knob");
const stick = { active: false, pointerId: null, centerX: 0, centerY: 0, x: 0, y: 0 };

function moveStick(event) {
  let dx = event.clientX - stick.centerX;
  let dy = event.clientY - stick.centerY;
  const distance = Math.hypot(dx, dy);
  if (distance > STICK_RADIUS) {
    dx = (dx / distance) * STICK_RADIUS;
    dy = (dy / distance) * STICK_RADIUS;
  }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  // Direction and strength, each -1..1
  const strength = Math.min(distance, STICK_RADIUS) / STICK_RADIUS;
  if (strength < STICK_DEADZONE) {
    stick.x = 0;
    stick.y = 0;
  } else {
    stick.x = dx / STICK_RADIUS;
    stick.y = dy / STICK_RADIUS;
  }
}

function releaseStick() {
  stick.active = false;
  stick.pointerId = null;
  stick.x = 0;
  stick.y = 0;
  knob.style.transform = "";
  joystick.style.cssText = ""; // back to the resting spot
  joystick.classList.remove("active");
}

window.addEventListener("pointerdown", (event) => {
  if (event.target.closest("#controls")) return; // let buttons be buttons
  cancelRestart(); // touching the game area means "keep playing"
  if (!isTouch || stick.active) return; // one finger steers at a time
  // Browsers "lock" a touch to the element it started on; undo that so we
  // keep getting moves wherever the finger goes
  if (event.target.hasPointerCapture && event.target.hasPointerCapture(event.pointerId)) {
    event.target.releasePointerCapture(event.pointerId);
  }
  const size = joystick.offsetWidth;
  stick.active = true;
  stick.pointerId = event.pointerId;
  stick.centerX = event.clientX;
  stick.centerY = event.clientY;
  joystick.style.left = event.clientX - size / 2 + "px";
  joystick.style.top = event.clientY - size / 2 + "px";
  joystick.style.right = "auto";
  joystick.style.bottom = "auto";
  joystick.classList.add("active");
  moveStick(event);
});
window.addEventListener("pointermove", (event) => {
  if (stick.active && event.pointerId === stick.pointerId) moveStick(event);
});
const endTouch = (event) => {
  if (event.pointerId === stick.pointerId) releaseStick();
};
window.addEventListener("pointerup", endTouch);
window.addEventListener("pointercancel", endTouch);

// Let go of everything if the window loses focus, so the player doesn't keep walking
window.addEventListener("blur", () => {
  for (const key in keys) keys[key] = false;
  releaseStick();
});

window.addEventListener("resize", resize);

resize();
requestAnimationFrame(loop);
