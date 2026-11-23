const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Sizes are relative to the screen, so everything scales when the window resizes
const ARENA_SIZE = 0.75;   // arena takes 3/4 of the screen width and height
const PLAYER_SIZE = 0.04;  // player is 4% of the arena's shorter side
const PLAYER_SPEED = 0.5;  // arena's shorter side per second

// Player position as a fraction (0..1) of the space it can move in.
// Storing it this way keeps the player in the same relative spot after a resize.
const player = { x: 0.5, y: 0.5 };

// Which arrow keys are currently held down
const keys = {};

let arena = { x: 0, y: 0, width: 0, height: 0 };
let playerPx = 0;

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
  playerPx = Math.min(arena.width, arena.height) * PLAYER_SIZE;
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

  const speed = Math.min(arena.width, arena.height) * PLAYER_SPEED * seconds;
  const roomX = arena.width - playerPx;
  const roomY = arena.height - playerPx;

  // Window too small (e.g. minimized): skip, or the math below divides by zero
  if (roomX <= 0 || roomY <= 0) return;

  // Move, then clamp so the player never leaves the arena
  player.x = Math.min(1, Math.max(0, player.x + (dx * speed) / roomX));
  player.y = Math.min(1, Math.max(0, player.y + (dy * speed) / roomY));
}

function draw() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  // Arena outline
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.strokeRect(arena.x, arena.y, arena.width, arena.height);

  // Player
  const px = arena.x + player.x * (arena.width - playerPx);
  const py = arena.y + player.y * (arena.height - playerPx);
  ctx.fillStyle = "#fff";
  ctx.fillRect(px, py, playerPx, playerPx);
}

// The game loop: runs once per screen refresh (usually 60 times a second)
let lastTime = performance.now();
function loop(now) {
  // Time since last frame, so speed is the same on fast and slow computers
  const seconds = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  update(seconds);
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
// off releases it and sliding onto another arrow switches direction.
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

dpad.addEventListener("pointerdown", (event) => {
  // Browsers "lock" a touch to the element it started on; undo that so we
  // keep getting moves after the finger slides off the button
  if (event.target.hasPointerCapture(event.pointerId)) {
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
