# Clipmine29

Clipmine29 makes short AI videos from text prompts with Replicate's official MiniMax Video-01 model. It also includes a browser-based clip studio for trimming a local video into short portrait, square, or landscape clips.

The AI generator creates one video of approximately six seconds. Model availability, output, generation time, and content restrictions are controlled by the provider; results are not guaranteed. Each generation may incur a charge to the site's Replicate account.

## Deploy on Vercel

GitHub Pages only serves static files and cannot run the private API functions this generator needs. Deploy the repository to Vercel instead:

1. Create a [Replicate account](https://replicate.com/) and add billing credits.
2. Create a Replicate API token from your account settings.
3. Import this GitHub repository into [Vercel](https://vercel.com/).
4. In the Vercel project's **Settings → Environment Variables**, add:
   - `REPLICATE_API_TOKEN` — your Replicate API token.
   - `GENERATOR_ACCESS_CODE` — a private, random access code with at least 24 characters. Generate one with `openssl rand -base64 32`.
5. Add the variables to the **Production** environment and redeploy.
6. Open the Vercel deployment URL and enter the app access code to generate a video.

Keep both values private. Never put the Replicate token in browser code, commit it to Git, or paste it into chat. The access code is a shared gate for a private MVP, not individual accounts or strong public-site authentication. Do not distribute the deployment publicly without adding proper user authentication, abuse prevention, and spending limits.

## Run locally

Install the Vercel CLI, create `.env.local` with the two environment variables above, then run:

```sh
npx vercel dev
```

Open the local URL printed by Vercel. The API key remains on the server; the browser sends only the app access code to the same-origin API.

## Features and limitations

- Text-to-video generation through Replicate's MiniMax Video-01 model.
- Live generation status, video preview, and download link.
- Optional Replicate prompt optimizer and example prompts.
- Local clip editor with manual trim ranges and browser-based exports.
- Generated videos are hosted by the provider. Download results soon; provider links may expire.
- Generated clips are not saved to a user account. Jobs and prompt history are not persisted by this app.
- The clip studio works locally in a modern browser. It does not upload source videos.
- A generation can fail due to provider availability, billing, input, or safety rules. Review the provider's [model details](https://replicate.com/minimax/video-01) and [pricing](https://replicate.com/pricing).

Run API tests with `node --test`.

This project is distributed under the Apache-2.0 license; see [LICENSE](./LICENSE).
