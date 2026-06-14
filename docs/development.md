# Development

## Running the app

PyScript requires serving over HTTP (`file://` doesn't work). Start a local server if none is running:

```bash
python3 -m http.server 8787   # any free port works
```

No build step, no package manager. Dependencies load from CDN.

## Tests

Node-side only — no server needed:

```bash
npm test          # Python + JS
npm run test:js   # JS only
npm run test:py   # MicroPython only (via WebAssembly)
```
