# Audio Scrambler (browser prototype)

## Run it
1. Extract the ZIP.
2. Open `index.html` in a modern browser (Edge or Chrome recommended).
3. Choose an audio file, leave the seed at `613026` for the default, and click **Scramble audio**.
4. Adjust any scrambling parameter if desired, then click **Scramble audio**. Preview the result or click **Download WAV**.

No Python, libraries, server, or upload is required. The browser processes the file locally.

## Adjustable parameters
- **Random seed**: integer seed for repeatable random choices (default `613026`).
- **Sample rate**: output/resampling rate (22,050, 32,000, 44,100, or 48,000 Hz).
- **Clip seconds**: base clip size in seconds (default `2`).
- **Ratio**: controls iteration count (default `3.5`).
- **Reverse chance**: probability of reversing a clip, as a percentage (default `25%`).
- **Empty chance**: probability of reducing a clip to 10% volume, as a percentage (default `2%`).
- **Fade seconds**: maximum fade length (default `0.01`).
- **Silence seconds**: maximum silence appended to a clip (default `0.04`).
- **Distance seconds**: maximum random offset used when choosing the second clip position (default `10`).

Use **Reset defaults** to restore the original parameter values.

## Notes and limitations
- Stereo is preserved for stereo inputs; mono remains mono. For inputs with more than two channels, only the first two channels are used.
- The output is 44.1 kHz, 16-bit PCM WAV.
- The MT19937 random generator aims to match Python's `random.Random` behavior for integer seeds, so edit choices should be comparable/repeatable.
- Exact audio samples may differ from Python because browser audio decoding/resampling and floating-point operations differ from librosa/NumPy, and the stereo/normalization behavior intentionally differs from the supplied mono script.
- Very long files can use substantial memory. The prototype uses the Web Audio API and browser support for the input format varies.
- This is a prototype; the array slicing/fade logic is a practical port of the supplied script, not a formally validated bit-for-bit translation.
