// Find the elements on the page we want to control
const message = document.getElementById("message");
const winButton = document.getElementById("win-button");
const resetButton = document.getElementById("reset-button");
const winsLabel = document.getElementById("wins");

// Load saved wins from the browser (survives page reloads)
let wins = Number(localStorage.getItem("wins")) || 0;
winsLabel.textContent = wins;

function win() {
  wins += 1;
  localStorage.setItem("wins", wins);
  winsLabel.textContent = wins;

  message.textContent = "YOU WIN!";
  document.body.classList.add("won");
  winButton.hidden = true;
  resetButton.hidden = false;
  playWinSound();
}

function reset() {
  message.textContent = "Press the button to win";
  document.body.classList.remove("won");
  winButton.hidden = false;
  resetButton.hidden = true;
}

// A short retro "ding-ding" made in code, so no sound file is needed
function playWinSound() {
  const audio = new AudioContext();
  [523, 784].forEach((frequency, i) => {
    const oscillator = audio.createOscillator();
    const volume = audio.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = frequency;
    volume.gain.value = 0.1;
    oscillator.connect(volume).connect(audio.destination);
    oscillator.start(audio.currentTime + i * 0.12);
    oscillator.stop(audio.currentTime + i * 0.12 + 0.1);
  });
}

winButton.addEventListener("click", win);
resetButton.addEventListener("click", reset);
