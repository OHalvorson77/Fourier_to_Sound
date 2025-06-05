let drawing = [];
let fourier = [];
let path = [];
let time = 0;
let state = -1;

let audioCtx;
let oscillators = [];

function setup() {
  createCanvas(800, 600);
  background(0);
}

function mouseDragged() {
  if (state === -1) {
    drawing.push(createVector(mouseX - width / 2, mouseY - height / 2));
  }
}

function mouseReleased() {
  if (state === -1 && drawing.length > 0) {
    const complex = drawing.map(v => ({ x: v.x, y: v.y }));
    fourier = dft(complex);
    fourier.sort((a, b) => b.amp - a.amp);
    state = 0;

    playSound(fourier); // 🎵 play tones
  }
}

function drawEpicycles(x, y, rotation, fourier) {
  for (let i = 0; i < fourier.length; i++) {
    let prevx = x;
    let prevy = y;

    let freq = fourier[i].freq;
    let radius = fourier[i].amp;
    let phase = fourier[i].phase;

    x += radius * cos(freq * time + phase + rotation);
    y += radius * sin(freq * time + phase + rotation);

    stroke(255, 100);
    noFill();
    ellipse(prevx, prevy, radius * 2);
    line(prevx, prevy, x, y);
  }

  return createVector(x, y);
}

function draw() {
  background(0);
  translate(width / 2, height / 2);

  if (state === -1) {
    noFill();
    stroke(255);
    beginShape();
    for (let pt of drawing) {
      vertex(pt.x, pt.y);
    }
    endShape();
  } else if (state === 0) {
    let v = drawEpicycles(0, 0, 0, fourier);
    path.unshift(v);

    stroke(0, 255, 0);
    noFill();
    beginShape();
    for (let i = 0; i < path.length; i++) {
      vertex(path[i].x, path[i].y);
    }
    endShape();

    const dt = TWO_PI / fourier.length;
    time += dt;

    if (time > TWO_PI) {
      time = 0;
      path = [];
    }
  }
}

function dft(x) {
  const N = x.length;
  let X = [];
  for (let k = 0; k < N; k++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < N; n++) {
      let phi = (TWO_PI * k * n) / N;
      re += x[n].x * cos(phi) + x[n].y * sin(phi);
      im += x[n].y * cos(phi) - x[n].x * sin(phi);
    }
    re /= N;
    im /= N;

    X.push({
      re,
      im,
      freq: k,
      amp: sqrt(re * re + im * im),
      phase: atan2(im, re)
    });
  }
  return X;
}

function playSound(fourier) {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  
  for (let osc of oscillators) {
    try {
      osc.stop();
    } catch {}
  }
  oscillators = [];

  const duration = 3; // seconds
  const now = audioCtx.currentTime;

  fourier.slice(0, 10).forEach(({ freq, amp, phase }, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.frequency.value = 100 + freq * 30;
    osc.type = 'sine';
    gain.gain.value = amp / 100;

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + duration);
    oscillators.push(osc);
  });
}

function exportWaveform() {
  const sampleRate = 44100;
  const duration = 2;
  const ctx = new OfflineAudioContext(1, sampleRate * duration, sampleRate);

  fourier.slice(0, 10).forEach(({ freq, amp, phase }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = 100 + freq * 30;
    osc.type = 'sine';
    gain.gain.value = amp / 100;

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    osc.stop(duration);
  });

  ctx.startRendering().then(renderedBuffer => {
    const wav = bufferToWav(renderedBuffer);
    const blob = new Blob([new DataView(wav)], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fourier_waveform.wav';
    a.click();
  });
}

function bufferToWav(buffer) {
  const numOfChan = buffer.numberOfChannels,
    length = buffer.length * numOfChan * 2 + 44,
    buffer2 = new ArrayBuffer(length),
    view = new DataView(buffer2),
    channels = [],
    sampleRate = buffer.sampleRate;

  let offset = 0;
  function writeString(str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    offset += str.length;
  }

  writeString('RIFF');
  view.setUint32(offset, length - 8, true); offset += 4;
  writeString('WAVE');
  writeString('fmt ');
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, numOfChan, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * 2, true); offset += 4;
  view.setUint16(offset, numOfChan * 2, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;
  writeString('data');
  view.setUint32(offset, length - offset - 4, true); offset += 4;

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let interleaved = new Float32Array(buffer.length * numOfChan);
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numOfChan; channel++) {
      interleaved[i * numOfChan + channel] = channels[channel][i];
    }
  }

  let index = 44;
  for (let i = 0; i < interleaved.length; i++, index += 2) {
    const s = Math.max(-1, Math.min(1, interleaved[i]));
    view.setInt16(index, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return buffer2;
}

function restart() {
  drawing = [];
  fourier = [];
  path = [];
  time = 0;
  state = -1;
}

function loadSVG(event) {
  const file = event.target.files[0];
  const reader = new FileReader();

  reader.onload = function(e) {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(e.target.result, "image/svg+xml");
    const pathEl = svgDoc.querySelector('path');
    if (!pathEl) return;

    const d = pathEl.getAttribute("d");
    const tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    tempPath.setAttribute("d", d);
    tempSvg.appendChild(tempPath);

    document.body.appendChild(tempSvg);
    const length = tempPath.getTotalLength();
    const points = [];

    for (let i = 0; i < length; i += 2) {
      const pt = tempPath.getPointAtLength(i);
      points.push(createVector(pt.x - width / 2, pt.y - height / 2));
    }

    drawing = points;
    document.body.removeChild(tempSvg);

    const complex = drawing.map(v => ({ x: v.x, y: v.y }));
    fourier = dft(complex);
    fourier.sort((a, b) => b.amp - a.amp);
    state = 0;

    playSound(fourier);
  };

  reader.readAsText(file);
}
