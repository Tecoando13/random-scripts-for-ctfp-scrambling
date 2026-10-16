(() => {
  "use strict";

  const DEFAULTS = {
    seed: 613026,
    sampleRate: 44100,
    clipSeconds: 2,
    reverseChance: 0.25,
    ratio: 3.5,
    fadeSeconds: 0.01,
    silenceSeconds: 0.04,
    emptyChance: 0.02,
    distanceSeconds: 10
  };

  const fileInput = document.querySelector("#audioFile");
  const fileName = document.querySelector("#fileName");
  const processButton = document.querySelector("#process");
  const status = document.querySelector("#status");
  const progress = document.querySelector("#progress");
  const result = document.querySelector("#result");
  const preview = document.querySelector("#preview");
  const download = document.querySelector("#download");
  const details = document.querySelector("#details");
  let selectedFile = null;
  let currentUrl = null;

  // Python random.Random-compatible MT19937 for integer seeds.
  // random(), getrandbits(), and randrange() follow CPython's common integer-seed path.
  class PythonRandom {
    constructor(seed) {
      this.mt = new Uint32Array(624);
      this.index = 624;
      this.seed(seed);
    }
    seed(seed) {
      if (!Number.isSafeInteger(seed)) throw new Error("Seed must be a whole number within JavaScript's safe integer range.");
      let n = BigInt(seed);
      if (n < 0n) n = -n;
      const key = [];
      do { key.push(Number(n & 0xffffffffn)); n >>= 32n; } while (n > 0n);
      this.initByArray(key);
    }
    initGenrand(s) {
      this.mt[0] = s >>> 0;
      for (let i = 1; i < 624; i++) {
        const x = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
        this.mt[i] = (Math.imul(1812433253, x) + i) >>> 0;
      }
      this.index = 624;
    }
    initByArray(key) {
      this.initGenrand(19650218);
      let i = 1, j = 0;
      for (let k = Math.max(624, key.length); k > 0; k--) {
        const x = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
        this.mt[i] = ((this.mt[i] ^ Math.imul(x, 1664525)) + key[j] + j) >>> 0;
        i++; j++;
        if (i >= 624) { this.mt[0] = this.mt[623]; i = 1; }
        if (j >= key.length) j = 0;
      }
      for (let k = 623; k > 0; k--) {
        const x = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
        this.mt[i] = ((this.mt[i] ^ Math.imul(x, 1566083941)) - i) >>> 0;
        i++;
        if (i >= 624) { this.mt[0] = this.mt[623]; i = 1; }
      }
      this.mt[0] = 0x80000000;
      this.index = 624;
    }
    uint32() {
      const mag01 = [0, 0x9908b0df];
      if (this.index >= 624) {
        let y, kk = 0;
        for (; kk < 227; kk++) {
          y = (this.mt[kk] & 0x80000000) | (this.mt[kk + 1] & 0x7fffffff);
          this.mt[kk] = (this.mt[kk + 397] ^ (y >>> 1) ^ mag01[y & 1]) >>> 0;
        }
        for (; kk < 623; kk++) {
          y = (this.mt[kk] & 0x80000000) | (this.mt[kk + 1] & 0x7fffffff);
          this.mt[kk] = (this.mt[kk - 227] ^ (y >>> 1) ^ mag01[y & 1]) >>> 0;
        }
        y = (this.mt[623] & 0x80000000) | (this.mt[0] & 0x7fffffff);
        this.mt[623] = (this.mt[396] ^ (y >>> 1) ^ mag01[y & 1]) >>> 0;
        this.index = 0;
      }
      let y = this.mt[this.index++];
      y ^= y >>> 11;
      y ^= (y << 7) & 0x9d2c5680;
      y ^= (y << 15) & 0xefc60000;
      y ^= y >>> 18;
      return y >>> 0;
    }
    random() {
      const a = this.uint32() >>> 5;
      const b = this.uint32() >>> 6;
      return (a * 67108864 + b) / 9007199254740992;
    }
    getrandbits(k) {
      if (k <= 0) return 0;
      if (k <= 32) return this.uint32() >>> (32 - k);
      throw new Error("This prototype only needs getrandbits values up to 32 bits.");
    }
    randrange(n) {
      if (!Number.isSafeInteger(n) || n <= 0) throw new Error("Invalid random range.");
      const k = Math.floor(Math.log2(n)) + 1;
      let r;
      do { r = this.getrandbits(k); } while (r >= n);
      return r;
    }
  }

  function concatFloat(parts) {
    const total = parts.reduce((sum, p) => sum + p.length, 0);
    const out = new Float32Array(total);
    let offset = 0;
    for (const p of parts) { out.set(p, offset); offset += p.length; }
    return out;
  }

  function normalizeTogether(channels) {
    let peak = 0;
    for (const ch of channels) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
    if (peak > 0) for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] /= peak;
  }

  function distortStereo(inputChannels, rng, onProgress, settings) {
    let channels = inputChannels.map(ch => new Float32Array(ch));
    const initialLength = channels[0].length;
    const sampleRate = settings.sampleRate;
    const clipSize = Math.max(1, Math.floor(settings.clipSeconds * sampleRate));
    const iterations = Math.floor(initialLength * settings.ratio / clipSize);

    for (let i = 0; i < iterations; i++) {
      const len = channels[0].length;
      const size1 = Math.floor(clipSize * Math.pow(1.1, rng.random() * 2 - 1));
      const size2 = Math.floor(clipSize * Math.pow(1.1, rng.random() * 2 - 1));

      if (Math.floor(len - Math.max(size2, size1) * 2 - sampleRate * 5) <= 0) break;

      let id1 = rng.randrange(Math.floor(len - Math.max(size2, size1) * 2 - sampleRate * 5));
      let id2 = Math.min(id1 + Math.floor(sampleRate * settings.distanceSeconds * rng.random()), len - 1 - Math.max(size2, size1));

      if (rng.random() > 0.5) { const tmp = id2; id2 = id1; id1 = tmp; }

      const silenceLength = Math.floor(sampleRate * settings.silenceSeconds * rng.random());
      const reverse = rng.random() < settings.reverseChance;
      const empty = rng.random() < settings.emptyChance;
      const fs = settings.fadeSeconds * rng.random();

      let edgesize;
      let clip2Length = size2 + silenceLength;
      edgesize = Math.min(Math.floor(sampleRate * fs), Math.floor(clip2Length / 2));
      const unfadedlen = clip2Length - edgesize * 2;

      // Build the output layout once, applying identical edit positions to each channel.
      const nextChannels = [];
      for (let c = 0; c < channels.length; c++) {
        const source = channels[c];
        let clip2 = new Float32Array(clip2Length);
        clip2.set(source.subarray(id2, id2 + size2), 0);
        if (reverse) clip2 = clip2.reverse();
        if (empty) for (let j = 0; j < clip2.length; j++) clip2[j] *= 0.1;

        // Match numpy's fade arrays: fade-in [0..1], fade-out [1..1/edgesize].
        for (let j = 0; j < edgesize; j++) {
          clip2[j] *= edgesize > 1 ? j / (edgesize - 1) : 0;
          clip2[clip2Length - edgesize + j] *= (edgesize - j) / edgesize;
        }

        const next = concatFloat([
          source.subarray(0, id1),
          new Float32Array(unfadedlen),
          source.subarray(id1 + size1)
        ]);

        // Approximate the original NumPy edge crossfades, including its slice-length checks.
        const leftStart = id1 - edgesize;
        const leftEnd = id1;
        if (leftStart >= 0 && leftEnd <= next.length && leftEnd - leftStart === edgesize) {
          for (let j = 0; j < edgesize; j++) next[leftStart + j] *= edgesize > 1 ? (edgesize - 1 - j) / (edgesize - 1) : 0;
        }
        const rightStart = id1 + unfadedlen;
        if (rightStart >= 0 && rightStart + edgesize <= next.length) {
          for (let j = 0; j < edgesize; j++) next[rightStart + j] *= (j + 1) / edgesize;
        }

        // Add the replacement clip over the inserted gap and its fade edges.
        const addStart = id1 - edgesize;
        const addEnd = id1 + unfadedlen + edgesize;
        if (addStart >= 0 && addEnd <= next.length && addEnd - addStart === clip2.length) {
          for (let j = 0; j < clip2.length; j++) next[addStart + j] += clip2[j];
        }
        nextChannels.push(next);
      }
      channels = nextChannels;
      if (i % 4 === 0 || i === iterations - 1) onProgress((i + 1) / Math.max(1, iterations));
    }
    return channels;
  }

  function encodeWav(channels, sampleRate) {
    const channelCount = channels.length;
    const length = channels[0].length;
    const bytesPerSample = 2;
    const dataSize = length * channelCount * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeString = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
    writeString(0, "RIFF"); view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE"); writeString(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, channelCount, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
    view.setUint16(32, channelCount * bytesPerSample, true); view.setUint16(34, 16, true);
    writeString(36, "data"); view.setUint32(40, dataSize, true);
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let c = 0; c < channelCount; c++) {
        const s = Math.max(-1, Math.min(1, channels[c][i]));
        view.setInt16(offset, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
        offset += 2;
      }
    }
    return new Blob([buffer], { type: "audio/wav" });
  }

  async function decodeAndResample(file, targetSampleRate) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("This browser does not support the Web Audio API.");
    const ctx = new AudioContextClass();
    try {
      const bytes = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(bytes);
      const channelsToKeep = Math.min(2, decoded.numberOfChannels);
      if (decoded.numberOfChannels > 2) {
        status.textContent = "Input has more than two channels; keeping the first two.";
      }
      const frameCount = Math.ceil(decoded.duration * targetSampleRate);
      const offline = new OfflineAudioContext(channelsToKeep, frameCount, targetSampleRate);
      const source = offline.createBufferSource();
      const trimmed = offline.createBuffer(channelsToKeep, decoded.length, decoded.sampleRate);
      for (let c = 0; c < channelsToKeep; c++) trimmed.copyToChannel(decoded.getChannelData(c), c);
      source.buffer = trimmed;
      source.connect(offline.destination);
      source.start(0);
      const rendered = await offline.startRendering();
      const channels = [];
      for (let c = 0; c < channelsToKeep; c++) channels.push(new Float32Array(rendered.getChannelData(c)));
      return channels;
    } finally {
      await ctx.close();
    }
  }

  const settingsInputs = {
    seed: document.querySelector("#seed"),
    sampleRate: document.querySelector("#sampleRate"),
    clipSeconds: document.querySelector("#clipSeconds"),
    reverseChance: document.querySelector("#reverseChance"),
    ratio: document.querySelector("#ratio"),
    fadeSeconds: document.querySelector("#fadeSeconds"),
    silenceSeconds: document.querySelector("#silenceSeconds"),
    emptyChance: document.querySelector("#emptyChance"),
    distanceSeconds: document.querySelector("#distanceSeconds")
  };

  function readSettings() {
    const number = key => Number(settingsInputs[key].value);
    const settings = {
      seed: number("seed"),
      sampleRate: number("sampleRate"),
      clipSeconds: number("clipSeconds"),
      reverseChance: number("reverseChance") / 100,
      ratio: number("ratio"),
      fadeSeconds: number("fadeSeconds"),
      silenceSeconds: number("silenceSeconds"),
      emptyChance: number("emptyChance") / 100,
      distanceSeconds: number("distanceSeconds")
    };
    for (const [key, input] of Object.entries(settingsInputs)) {
      if (!input.checkValidity() || input.value.trim() === "") {
        input.reportValidity();
        throw new Error(`Please enter a valid value for ${key}.`);
      }
    }
    if (!Number.isSafeInteger(settings.seed)) throw new Error("Random seed must be a whole number within JavaScript's safe integer range.");
    return settings;
  }

  document.querySelector("#resetSettings").addEventListener("click", () => {
    settingsInputs.seed.value = DEFAULTS.seed;
    settingsInputs.sampleRate.value = String(DEFAULTS.sampleRate);
    settingsInputs.clipSeconds.value = DEFAULTS.clipSeconds;
    settingsInputs.reverseChance.value = DEFAULTS.reverseChance * 100;
    settingsInputs.ratio.value = DEFAULTS.ratio;
    settingsInputs.fadeSeconds.value = DEFAULTS.fadeSeconds;
    settingsInputs.silenceSeconds.value = DEFAULTS.silenceSeconds;
    settingsInputs.emptyChance.value = DEFAULTS.emptyChance * 100;
    settingsInputs.distanceSeconds.value = DEFAULTS.distanceSeconds;
  });

  fileInput.addEventListener("change", () => {
    selectedFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    fileName.textContent = selectedFile ? `${selectedFile.name} · ${(selectedFile.size / 1048576).toFixed(2)} MB` : "MP3, WAV, OGG, FLAC, M4A (depending on browser support)";
    processButton.disabled = !selectedFile;
    result.hidden = true;
    status.textContent = selectedFile ? "Ready to process. Audio stays on this device." : "Choose an audio file to begin.";
    if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null; }
  });

  processButton.addEventListener("click", async () => {
    if (!selectedFile) return;
    processButton.disabled = true;
    fileInput.disabled = true;
    progress.hidden = false;
    progress.value = 0;
    result.hidden = true;
    const start = performance.now();
    try {
      const settings = readSettings();
      status.textContent = "Decoding and resampling audio…";
      let channels = await decodeAndResample(selectedFile, settings.sampleRate);
      normalizeTogether(channels);
      const rng = new PythonRandom(settings.seed);
      status.textContent = `Scrambling ${channels.length === 2 ? "stereo" : "mono"} audio…`;
      channels = distortStereo(channels, rng, p => { progress.value = Math.round(p * 100); }, settings);
      const wav = encodeWav(channels, settings.sampleRate);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = URL.createObjectURL(wav);
      preview.src = currentUrl;
      download.href = currentUrl;
      download.download = `${selectedFile.name.replace(/\.[^.]+$/, "") || "audio"}_scrambled.wav`;
      const seconds = (channels[0].length / settings.sampleRate).toFixed(2);
      details.textContent = `${channels.length === 2 ? "Stereo" : "Mono"} · ${settings.sampleRate.toLocaleString()} Hz · ${seconds} seconds · ${(wav.size / 1048576).toFixed(2)} MB · ${(performance.now() - start) / 1000 < 60 ? ((performance.now() - start) / 1000).toFixed(1) + " s processing time" : "processing complete"}.`;
      result.hidden = false;
      status.textContent = "Done! Preview the result or download the WAV file.";
      progress.value = 100;
    } catch (error) {
      console.error(error);
      status.textContent = `Could not process this file: ${error.message || error}`;
    } finally {
      processButton.disabled = !selectedFile;
      fileInput.disabled = false;
    }
  });
})();
