const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const analyser = audioCtx.createAnalyser();

const fileInput = document.getElementById("file-input");
const audioElement = document.getElementById("audio");

let fileSource = null;
let currentSource = null;

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  audioElement.src = url;
  audioElement.load();

  if (!fileSource) fileSource = audioCtx.createMediaElementSource(audioElement);

  if (currentSource && currentSource !== fileSource) {
    try {
      currentSource.disconnect();
    } catch (e) {}
  }

  fileSource.connect(analyser);
  analyser.connect(audioCtx.destination);
  currentSource = fileSource;

  if (audioCtx.state === "suspended") audioCtx.resume();
  audioElement.play();
});

const micButton = document.getElementById("use-mic");
micButton.addEventListener("click", useMic);

let micSource = null;
async function useMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micSource = audioCtx.createMediaStreamSource(stream);

    if (currentSource && currentSource !== micSource) {
      try {
        currentSource.disconnect();
      } catch (e) {}
    }

    micSource.connect(analyser);
    currentSource = micSource;

    if (audioCtx.state === "suspended") await audioCtx.resume();
    console.log("Mic input ACTIVE");
  } catch (err) {
    console.error("Microphone access denied:", err);
  }
}

analyser.fftSize = 2048;
const bufferLength = analyser.frequencyBinCount;
const dataArray = new Uint8Array(bufferLength);

const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d", { alpha: false });

canvas.width = 600;
canvas.height = 600;

const W = canvas.width;
const H = canvas.height;
const N = W * H;

const img = ctx.createImageData(W, H);
const pixels = img.data;

const zField = new Float32Array(N);       
const energyField = new Float32Array(N);  
const newEnergy = new Float32Array(N);    
const sand = new Float32Array(N);         

let sinMx = new Float32Array(W);
let sinNx = new Float32Array(W);
let sinNy = new Float32Array(H);
let sinMy = new Float32Array(H);

const PARTICLE_COUNT = 14000; 
const px = new Float32Array(PARTICLE_COUNT);
const py = new Float32Array(PARTICLE_COUNT);
const vx = new Float32Array(PARTICLE_COUNT);
const vy = new Float32Array(PARTICLE_COUNT);

for (let i = 0; i < PARTICLE_COUNT; i++) {
  px[i] = Math.random() * (W - 1);
  py[i] = Math.random() * (H - 1);
  vx[i] = 0;
  vy[i] = 0;
}


let FIELD_LERP = 0.10; 

const EPS = 1.0;

const SAND_FADE = 0.978;

const SAND_SCALE = 7.0;
const SAND_GAMMA = 0.85;

const DRIFT_STRENGTH = 12.0;  
const AGITATION = 2.4;        
const AGITATION_BIAS = 0.02;  

const DAMP_NODE = 0.992;      
const DAMP_ANTI = 0.90;       
const BOUNCE = 0.25;


const DEPOSIT = 1.0;


const SHOW_FAINT_EQUATION = false;


let smoothFreq = 0;
let smoothAmp = 0; 


function modesFromFreq(freq) {
  const base = Math.max(1, freq / 150);
  let m = 1 + Math.floor(base % 5);
  let n = 1 + Math.floor((base + 1.5) % 5);
  if (m === n) n = (n % 5) + 1;
  return { m, n };
}

function sampleField(field, x, y) {
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x > W - 1.001) x = W - 1.001;
  if (y > H - 1.001) y = H - 1.001;

  const x0 = x | 0;
  const y0 = y | 0;
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const tx = x - x0;
  const ty = y - y0;

  const i00 = x0 + y0 * W;
  const i10 = x1 + y0 * W;
  const i01 = x0 + y1 * W;
  const i11 = x1 + y1 * W;

  const a = field[i00] * (1 - tx) + field[i10] * tx;
  const b = field[i01] * (1 - tx) + field[i11] * tx;
  return a * (1 - ty) + b * ty;
}

function sampleGrad(field, x, y) {
  const eL = sampleField(field, x - EPS, y);
  const eR = sampleField(field, x + EPS, y);
  const eU = sampleField(field, x, y - EPS);
  const eD = sampleField(field, x, y + EPS);
  return {
    gx: (eR - eL) / (2 * EPS),
    gy: (eD - eU) / (2 * EPS),
  };
}


function updateFields(freq) {
  const { m, n } = modesFromFreq(freq);
  const alpha = 1.0;
  const phi = Math.PI / 2;

  for (let x = 0; x < W; x++) {
    const xNorm = x / W;
    sinMx[x] = Math.sin(Math.PI * m * xNorm);
    sinNx[x] = Math.sin(Math.PI * n * xNorm + phi);
  }
  for (let y = 0; y < H; y++) {
    const yNorm = y / H;
    sinNy[y] = Math.sin(Math.PI * n * yNorm);
    sinMy[y] = Math.sin(Math.PI * m * yNorm + phi);
  }

  let idx = 0;
  for (let y = 0; y < H; y++) {
    const sNy = sinNy[y];
    const sMy = sinMy[y];
    for (let x = 0; x < W; x++) {
      const z1 = sinMx[x] * sNy;
      const z2 = sinNx[x] * sMy;
      const z = z1 + alpha * z2;

      zField[idx] = z;
      const e = z * z;
      newEnergy[idx] = e;
      idx++;
    }
  }

  const t = FIELD_LERP;
  const it = 1 - t;
  for (let i = 0; i < N; i++) {
    energyField[i] = energyField[i] * it + newEnergy[i] * t;
  }
}

function updateParticlesAndSand() {
  for (let i = 0; i < N; i++) sand[i] *= SAND_FADE;

  const musicBoost = 0.6 + 1.4 * smoothAmp;        
  const depositBoost = 0.7 + 1.6 * smoothAmp;     

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const x = px[i];
    const y = py[i];

    const e = sampleField(energyField, x, y);

    let shake = e * AGITATION * musicBoost;
    if (shake > 1) shake = 1;
    shake += AGITATION_BIAS;

    const { gx, gy } = sampleGrad(energyField, x, y);
    vx[i] += (-gx) * DRIFT_STRENGTH * (0.7 + 0.6 * smoothAmp);
    vy[i] += (-gy) * DRIFT_STRENGTH * (0.7 + 0.6 * smoothAmp);

    const ang = Math.random() * Math.PI * 2;
    vx[i] += Math.cos(ang) * shake * 2.0;
    vy[i] += Math.sin(ang) * shake * 2.0;

    const damp = DAMP_NODE * (1 - shake) + DAMP_ANTI * shake;
    vx[i] *= damp;
    vy[i] *= damp;

    let nx = x + vx[i];
    let ny = y + vy[i];

    if (nx < 0) {
      nx = 0;
      vx[i] *= -BOUNCE;
    } else if (nx > W - 1) {
      nx = W - 1;
      vx[i] *= -BOUNCE;
    }

    if (ny < 0) {
      ny = 0;
      vy[i] *= -BOUNCE;
    } else if (ny > H - 1) {
      ny = H - 1;
      vy[i] *= -BOUNCE;
    }

    px[i] = nx;
    py[i] = ny;

    const ix = nx | 0;
    const iy = ny | 0;
    sand[ix + iy * W] += DEPOSIT * depositBoost;
  }
}

function render() {
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    let s = sand[i] / SAND_SCALE;
    if (s < 0) s = 0;
    if (s > 1) s = 1;
    s = Math.pow(s, SAND_GAMMA);

    const I = (255 - s * 255) | 0;
    pixels[p] = I;
    pixels[p + 1] = I;
    pixels[p + 2] = I;
    pixels[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}


function animate() {
  requestAnimationFrame(animate);

  analyser.getByteFrequencyData(dataArray);

  let maxIndex = 0;
  let maxValue = -Infinity;
  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i];
    if (v > maxValue) {
      maxValue = v;
      maxIndex = i;
    }
  }

  let num = 0, den = 0;
  const span = 6;
  for (let j = -span; j <= span; j++) {
    const k = maxIndex + j;
    if (k < 0 || k >= bufferLength) continue;
    const v = dataArray[k];
    const w = v * v; 
    num += k * w;
    den += w;
  }
  const peakIndex = den > 0 ? num / den : maxIndex;

  const nyquist = audioCtx.sampleRate / 2;
  const freq = (peakIndex / bufferLength) * nyquist;

  const amp = Math.min(1, Math.max(0, (maxValue - 15) / 120));
  smoothAmp = smoothAmp * 0.85 + amp * 0.15;

  const freqLerp = 0.06 + 0.22 * smoothAmp;   
  const target = (maxValue < 25) ? smoothFreq : freq;
  smoothFreq = smoothFreq * (1 - freqLerp) + target * freqLerp;

  FIELD_LERP = 0.06 + 0.22 * smoothAmp;      

  updateFields(smoothFreq);
  updateParticlesAndSand();
  render();
}

animate();
