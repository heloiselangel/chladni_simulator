const audioCtx = new (window.AudioContext || window.webkitAudioContext) () ;
const audioElement = document.querySelector('audio');
const track = audioCtx.createMediaElementSource(audioElement);
const analyser = audioCtx.createAnalyser();

track.connect(analyser);
analyser.connect(audioCtx.destination);

analyser.fftSize = 2048;
const bufferLength = analyser.frequencyBinCount;
const dataArray = new Uint8Array(bufferLength);

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 600;
canvas.height = 600;

const w = canvas.width;
const h = canvas.height;
const img = ctx.createImageData(w, h);
const pixels = img.data;
      

function animate() {
    requestAnimationFrame(animate);

    analyser.getByteFrequencyData(dataArray);

    let maxIndex = 0, maxValue = -Infinity;
    for (let i = 0; i < bufferLength; i++ ) {
        if (dataArray[i] > maxValue) {
            maxValue = dataArray[i];
            maxIndex = i;
        }
    }

    const nyquist = audioCtx.sampleRate / 2;
    const freq = (maxIndex / bufferLength) * nyquist;


    drawPattern(freq);
}

function modesFromFreq(freq) {
    const base = Math.max(1, freq / 150);
    let m = 1 + Math.floor(base % 5);
    let n = 1 + Math.floor((base + 1.5) % 5);
    if (m === n) n = (n % 5) + 1;
    return { m, n };
}

function drawPattern(freq) {
    const w = canvas.width;
    const h = canvas.height;

    const { m, n } = modesFromFreq(freq);
    const alpha = 1.0;
    const phi = Math.PI / 2;

    const img = ctx.createImageData(w, h);
    const pixels = img.data;

    const k = freq / 100;

    for (let y = 0; y < h; y++) {
        const yNorm = y / h;
        const yy_m = Math.PI * m * yNorm;
        const yy_n = Math.PI * n * yNorm;

        for (let x = 0; x < w; x++) {
            const xNorm = x / w;
            const xx_m = Math.PI * m * xNorm;
            const xx_n = Math.PI * n * xNorm;

            const z1 = Math.sin(xx_m) * Math.sin(yy_n) ;
            const z2 = Math.sin(xx_n + phi) * Math.sin(yy_m + phi);

            const z = z1 + alpha * z2;

            const intensity = 255 - Math.min(255, Math.abs(z) * 255);

            const index = (y * w + x) * 4;
            pixels[index] = intensity;
            pixels[index + 1] = intensity;
            pixels[index + 2] = intensity;
            pixels[index + 3] = 255;
        }
    }

    ctx.putImageData(img, 0,0);
}

animate();

