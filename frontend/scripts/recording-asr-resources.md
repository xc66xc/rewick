# Local recording transcription resources

`npm run prepare:recording` prepares the current host; `npm run dev` runs it automatically before starting Electron. Packaging invokes the same preparation with `mac arm64` or `win x64`. This downloads resources at build/development preparation time, not while processing a user's recording.

- Python: pinned standalone CPython 3.12.14, existing runtime manifest in `prepare-recording-python.mjs`.
- ASR: faster-whisper 1.2.1, CTranslate2 4.7.0, CPU int8; all transitive wheel URLs and SHA256 hashes are frozen in `recording-asr-wheels.json`.
- Model: Systran/faster-whisper-small, multilingual, immutable revision `536b0662742c02347bc0e980a01041f333bce120`; each file's SHA256 is in `recording-asr-model.json`.
- Runtime path: `build/python-runtime/python`; model path: `build/asr-model`. Electron copies both into application resources. Model and wheel binaries are ignored by Git.
- Bundled model is approximately 486 MB; macOS Python plus installed dependencies is approximately 270 MB. Packaging fails if a download or hash check fails. Repeated preparation reuses checked resources.
- Downloader honors `HTTPS_PROXY`/`https_proxy`, and otherwise macOS HTTPS system proxy configuration. It never needs a Hugging Face token.

To update dependencies, regenerate a Python 3.12 universal hash lock with `uv pip compile --universal --python-version 3.12 --generate-hashes`, then resolve each pinned package's compatible CPython 3.12 wheel for macOS ARM64 (minimum macOS 14) and Windows AMD64 using PyPI's version JSON metadata. Update `recording-asr-wheels.json` with the exact official wheel URL and SHA256; do not leave floating versions or use source distributions. Keep optional platform packages in both targets when cross-packaging. Run local offline inference and Windows validation before shipping new pins.

Model MIT license is copied into the model directory. Wheel `.dist-info` directories retain their dependency licenses. Official sources:

- https://github.com/SYSTRAN/faster-whisper
- https://opennmt.net/CTranslate2/installation.html
- https://huggingface.co/Systran/faster-whisper-small/tree/536b0662742c02347bc0e980a01041f333bce120
- https://github.com/openai/whisper/blob/v20250625/LICENSE

Validation on macOS ARM64: real synthetic Chinese speech transcribed by the bundled Python/model with socket connections disabled; silence yielded no text. All Windows wheel downloads/hashes were checked, but Windows execution must be verified on a Windows machine.
