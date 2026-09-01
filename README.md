# Image Classification Agent

An interactive workflow index for the `T5_Photo_Copilot_Offline` image
classification system. It documents the parent workflow, the L1/L2/L3
sub-agents, prompt methodology, RCA triggers, and the nine RCA decision rules.

## Run locally

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

## Project structure

```text
.
├── index.html
├── styles.css
└── app.js
```

This is a static site. It does not require a backend service or build step.

## Privacy

The site contains workflow and taxonomy implementation details. Keep the
repository private unless the content has been approved for public release.
