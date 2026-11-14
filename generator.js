"use strict";

const form = document.querySelector("#generator-form");
const promptInput = document.querySelector("#video-prompt");
const accessCodeInput = document.querySelector("#generator-access-code");
const generateButton = document.querySelector("#generate-button");
const generationError = document.querySelector("#generation-error");
const generationResult = document.querySelector("#generation-result");
const generationStatus = document.querySelector("#generation-status");
const generationDetail = document.querySelector("#generation-detail");
const generationElapsed = document.querySelector("#generation-elapsed");
const progress = document.querySelector("#generation-progress");
const generatedVideo = document.querySelector("#generated-video");
const downloadLink = document.querySelector("#download-video");
const checkButton = document.querySelector("#check-generation");
const promptCount = document.querySelector("#prompt-count");
const generatorTab = document.querySelector("#generator-tab");
const clipsTab = document.querySelector("#clips-tab");
const generatorMode = document.querySelector("#generator-mode");
const clipsMode = document.querySelector("#clips-mode");
const breadcrumbCurrent = document.querySelector("#breadcrumb-current");
const generatorPanel = document.querySelector("#generator-panel");
const clipStudio = document.querySelector("#clip-studio");

let activePredictionId = null;
let generationStartedAt = 0;
let activePoll = false;
let elapsedTimer = 0;

promptInput.addEventListener("input", updatePromptCount);

document.querySelectorAll(".example-prompt").forEach((button) => {
  button.addEventListener("click", () => {
    promptInput.value = button.dataset.prompt || "";
    updatePromptCount();
    promptInput.focus();
  });
});

generatorTab.addEventListener("click", () => setMode("generator"));
clipsTab.addEventListener("click", () => setMode("clips"));
generatorMode.addEventListener("click", () => setMode("generator"));
clipsMode.addEventListener("click", () => setMode("clips"));
checkButton.addEventListener("click", () => {
  if (activePredictionId && !activePoll) void pollPrediction(activePredictionId, accessCodeInput.value);
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  void generateVideo();
});

function setMode(mode) {
  const showGenerator = mode === "generator";
  generatorPanel.hidden = !showGenerator;
  clipStudio.hidden = showGenerator;
  generatorTab.classList.toggle("active", showGenerator);
  clipsTab.classList.toggle("active", !showGenerator);
  if (showGenerator) generatorTab.setAttribute("aria-current", "page");
  else generatorTab.removeAttribute("aria-current");
  if (!showGenerator) clipsTab.setAttribute("aria-current", "page");
  else clipsTab.removeAttribute("aria-current");
  generatorMode.classList.toggle("active", showGenerator);
  clipsMode.classList.toggle("active", !showGenerator);
  generatorMode.setAttribute("aria-pressed", String(showGenerator));
  clipsMode.setAttribute("aria-pressed", String(!showGenerator));
  breadcrumbCurrent.textContent = showGenerator ? "AI video maker" : "Clip studio";
}

function updatePromptCount() {
  promptCount.textContent = `${promptInput.value.length} / 1200`;
}

function setError(message) {
  generationError.textContent = message;
  generationError.hidden = !message;
}

function setBusy(isBusy) {
  generateButton.disabled = isBusy;
  generateButton.innerHTML = isBusy ? "<span>◌</span> Working…" : "<span>✳</span> Generate video";
}

function setStatus(status, detail) {
  generationStatus.textContent = status;
  generationDetail.textContent = detail;
}

function startElapsedTimer() {
  window.clearInterval(elapsedTimer);
  const update = () => {
    const seconds = Math.max(0, Math.floor((Date.now() - generationStartedAt) / 1000));
    generationElapsed.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  };
  update();
  elapsedTimer = window.setInterval(update, 1000);
}

async function generateVideo() {
  const prompt = promptInput.value.trim();
  const accessCode = accessCodeInput.value;
  setError("");

  if (prompt.length < 8) {
    setError("Add a little more detail to your prompt (at least 8 characters).");
    promptInput.focus();
    return;
  }
  if (!accessCode) {
    setError("Enter the app access code provided by the site owner.");
    accessCodeInput.focus();
    return;
  }

  setBusy(true);
  activePredictionId = null;
  generationResult.hidden = false;
  generatedVideo.hidden = true;
  generatedVideo.removeAttribute("src");
  downloadLink.hidden = true;
  checkButton.hidden = true;
  progress.hidden = false;
  generationElapsed.textContent = "";
  setStatus("Sending your prompt…", "Starting a new video generation. This may incur a charge.");

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Generator-Access-Code": accessCode,
      },
      body: JSON.stringify({
        prompt,
        prompt_optimizer: document.querySelector("#prompt-optimizer").checked,
      }),
      signal: AbortSignal.timeout(25000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `The generation request failed (${response.status}).`);
    if (typeof data.id !== "string" || !data.id) {
      throw new Error("The video service did not return a job ID. Check your Replicate account before submitting again.");
    }

    activePredictionId = data.id;
    generationStartedAt = Date.now();
    startElapsedTimer();
    setStatus("Making your video…", "Replicate is generating your video. Keep this tab open while it finishes.");
    await pollPrediction(activePredictionId, accessCode);
  } catch (error) {
    progress.hidden = true;
    setBusy(false);
    setStatus("Couldn’t start generation", "");
    setError(error instanceof Error
      ? `${error.message} If the request timed out, check your Replicate dashboard before trying again to avoid a duplicate charge.`
      : "Something went wrong while starting generation. Check your Replicate dashboard before retrying.");
  }
}

async function pollPrediction(predictionId, accessCode) {
  if (activePoll) return;
  activePoll = true;
  checkButton.hidden = true;
  progress.hidden = false;
  setError("");
  setBusy(true);
  setStatus("Checking generation status…", "Reconnecting to Replicate to retrieve your video.");
  const deadline = Date.now() + 6 * 60 * 1000;
  let transientFailures = 0;

  try {
    while (Date.now() < deadline) {
      await delay(2500);
      let response;
      try {
        response = await fetch(`/api/predictions/${encodeURIComponent(predictionId)}`, {
          headers: { "X-Generator-Access-Code": accessCode },
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        transientFailures += 1;
        if (transientFailures >= 4) {
          throw new Error("The connection to the video service was interrupted. Check the job status and try again.");
        }
        continue;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Couldn’t check generation status (${response.status}).`);
      transientFailures = 0;

      if (data.status === "succeeded") {
        if (typeof data.output !== "string" || !isSafeVideoUrl(data.output)) {
          throw new Error("The provider finished, but returned an invalid video link. Check your Replicate dashboard.");
        }
        showVideo(data.output);
        return;
      }
      if (data.status === "failed" || data.status === "canceled") {
        throw new Error(data.error || `The video generation ${data.status}. Check the prompt and try again.`);
      }
      if (data.status !== "starting" && data.status !== "processing") {
        throw new Error("The video provider returned an unknown job status.");
      }
      setStatus(
        data.status === "starting" ? "Waiting for a video model…" : "Making your video…",
        "Replicate is working on your video. Generation time varies with service load.",
      );
    }
    throw new Error("This is taking longer than expected. You can check the job status again in a moment.");
  } catch (error) {
    progress.hidden = true;
    setBusy(false);
    window.clearInterval(elapsedTimer);
    setStatus("Generation needs attention", "");
    setError(error instanceof Error ? error.message : "Could not check the video generation.");
    checkButton.hidden = !activePredictionId;
  } finally {
    activePoll = false;
  }
}

function showVideo(url) {
  window.clearInterval(elapsedTimer);
  progress.hidden = true;
  setBusy(false);
  setStatus("Your video is ready", "Preview it here or download it. Provider video links may expire, so save your result.");
  generatedVideo.src = url;
  generatedVideo.hidden = false;
  downloadLink.href = url;
  downloadLink.download = "clipmine29-ai-video.mp4";
  downloadLink.target = "_blank";
  downloadLink.rel = "noopener noreferrer";
  downloadLink.hidden = false;
  checkButton.hidden = true;
}

function isSafeVideoUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "replicate.delivery" || url.hostname.endsWith(".replicate.delivery"));
  } catch {
    return false;
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
