const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Sizes are relative to the screen, so everything scales when the window resizes
const ARENA_SIZE = 0.75;   // arena takes 3/4 of the screen width and height
const PLAYER_SIZE = 0.15;  // player is 15% of the arena's shorter side (height)
const PLAYER_SPEED = 0.5;  // arena's shorter side per second

// Player position as a fraction (0..1) of the space it can move in.
// Storing it this way keeps the player in the same relative spot after a resize.
const player = { x: 0.5, y: 0.5 };

// Which arrow keys are currently held down
const keys = {};

let arena = { x: 0, y: 0, width: 0, height: 0 };
let playerW = 0;
let playerH = 0;

// The character picture. It faces left as drawn; we mirror it when walking right.
const sprite = new Image();
sprite.src = "player.png";
// Shown instead while the character is touching a wall of the arena
const wallSprite = new Image();
wallSprite.src = "player-wall.png";
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
}

function update(seconds) {
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

// Points: +100 each time the character bumps into a wall.
// Staying against the wall doesn't add more; you have to leave and come back.
const WALL_POINTS = 100;
const POPUP_SECONDS = 1;   // how long a "+100" stays visible
const POPUP_RISE = 40;     // how far (in pixels) it floats up while fading
let score = 0;
let wasTouchingWall = false;
const popups = []; // floating "+100" messages: { x, y, age }
const scoreText = document.getElementById("score");

function isTouchingWall() {
  return player.x <= 0 || player.x >= 1 || player.y <= 0 || player.y >= 1;
}

function playerPosition() {
  return {
    x: arena.x + player.x * (arena.width - playerW),
    y: arena.y + player.y * (arena.height - playerH),
  };
}

function updateScore(seconds) {
  const touching = isTouchingWall();
  if (touching && !wasTouchingWall) {
    score += WALL_POINTS;
    scoreText.textContent = "Points: " + score;
    const pos = playerPosition();
    popups.push({ x: pos.x + playerW / 2, y: pos.y, age: 0 });
  }
  wasTouchingWall = touching;

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
    ctx.fillStyle = "#ffd700";
    ctx.fillText("+" + WALL_POINTS, popup.x, popup.y - 4 - progress * POPUP_RISE);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  // Arena outline
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.strokeRect(arena.x, arena.y, arena.width, arena.height);

  // Player
  const { x: px, y: py } = playerPosition();
  const image = isTouchingWall() ? wallSprite : sprite;
  if (image.complete && image.naturalWidth) {
    ctx.save();
    if (facingRight) {
      // Mirror around the character's own center
      ctx.translate(px + playerW, py);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0, playerW, playerH);
    } else {
      ctx.drawImage(image, px, py, playerW, playerH);
    }
    ctx.restore();
  }

  drawPopups();
}

// The game loop: runs once per screen refresh (usually 60 times a second)
let lastTime = performance.now();
function loop(now) {
  // Time since last frame, so speed is the same on fast and slow computers
  const seconds = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  update(seconds);
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
