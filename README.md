# CLV Segmented

High-fidelity clickable prototype for a segmented creative editor. The app recreates the supplied product mockup as a production-feeling React surface with local-state AI, SAM-style segment overlays, aesthetic scalar controls, contextual scoring, chat, and remix variants.

## Run Locally

```bash
npm install
npm run dev
```

Local preview:

```text
http://127.0.0.1:5173/clv-segmented/
```

## Build

```bash
npm run build
npm run lint
```

## Deploy

GitHub Pages deploys from the `main` branch via `.github/workflows/deploy-pages.yml`.

Public frontend endpoint variables can be set as GitHub Actions repository variables:

```text
VITE_IMAGE_GENERATION_ENDPOINT
VITE_IMAGE_SEGMENTATION_ENDPOINT
VITE_CHAT_ENDPOINT
```

Live URL:

```text
https://adamrotmil.github.io/clv-segmented/
```
