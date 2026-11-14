# Clipmine29

Clipmine29 is a browser-based video clip editor. Add a video from your device, select moments up to 90 seconds long, choose a portrait, square, or landscape layout, then export clips as WebM or MP4 when supported by your browser.

## Run locally

Open `index.html` in a recent browser, or serve this folder over HTTP:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. Video editing and exporting happen in the browser; videos are not uploaded to a server. Export requires a browser that supports `MediaRecorder`, canvas capture, and video capture (current Chrome or Firefox recommended). Clips are saved individually.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` publishes the site on pushes to `main` and on manual workflow dispatch. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. After a successful deployment, the site is available at `https://<owner>.github.io/<repository>/`.

## Limitations

- Clip selection is manual; automatic AI highlight detection and captions are not included.
- Export is performed in real time in the browser. Large videos may require a capable device and a tab kept open until export finishes.
- Exported clips are individual files. Browser support determines whether the output is WebM or MP4.

This project is distributed under the Apache-2.0 license; see [LICENSE](./LICENSE).
