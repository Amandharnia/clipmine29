"use strict";

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
const MAX_CLIP_SECONDS = 90;
const OUTPUTS = {
  portrait: { width: 720, height: 1280, label: "9:16 PORTRAIT" },
  square: { width: 1080, height: 1080, label: "1:1 SQUARE" },
  landscape: { width: 1280, height: 720, label: "16:9 LANDSCAPE" },
};

const elements = {
  uploadPanel: document.querySelector("#upload-panel"),
  fileInput: document.querySelector("#video-input"),
  browseButton: document.querySelector("#browse-button"),
  uploadError: document.querySelector("#upload-error"),
  editor: document.querySelector("#editor"),
  video: document.querySelector("#video-preview"),
  placeholder: document.querySelector("#video-placeholder"),
  fileName: document.querySelector("#file-name"),
  duration: document.querySelector("#video-duration"),
  start: document.querySelector("#clip-start"),
  end: document.querySelector("#clip-end"),
  clipLength: document.querySelector("#clip-length"),
  selection: document.querySelector("#timeline-selection"),
  aspect: document.querySelector("#aspect-ratio"),
  previewButton: document.querySelector("#preview-clip"),
  addButton: document.querySelector("#add-clip"),
  clipError: document.querySelector("#clip-error"),
  clipsList: document.querySelector("#clips-list"),
  emptyClips: document.querySelector("#empty-clips"),
  clipCount: document.querySelector("#clip-count"),
  changeVideo: document.querySelector("#change-video"),
  toast: document.querySelector("#toast"),
};

let sourceFile = null;
let sourceUrl = null;
let clips = [];
let nextClipId = 1;
let toastTimeout = 0;
let previewTimeout = 0;
let exportInProgress = false;

elements.browseButton.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", () => {
  const [file] = elements.fileInput.files;
  if (file) loadVideo(file);
});
elements.changeVideo.addEventListener("click", () => elements.fileInput.click());
elements.start.addEventListener("input", updateTrimControls);
elements.end.addEventListener("input", updateTrimControls);
elements.addButton.addEventListener("click", addClip);
elements.previewButton.addEventListener("click", previewClip);

for (const eventName of ["dragenter", "dragover"]) {
  elements.uploadPanel.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.uploadPanel.classList.add("drag-over");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  elements.uploadPanel.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.uploadPanel.classList.remove("drag-over");
  });
}
elements.uploadPanel.addEventListener("drop", (event) => {
  const file = [...event.dataTransfer.files].find(isVideoFile);
  if (!file) {
    showError(elements.uploadError, "Drop a video file to get started.");
    return;
  }
  loadVideo(file);
});
elements.video.addEventListener("timeupdate", () => {
  if (previewTimeout && elements.video.currentTime >= Number(elements.end.value)) {
    elements.video.pause();
    window.clearInterval(previewTimeout);
    previewTimeout = 0;
  }
});
elements.video.addEventListener("loadedmetadata", () => {
  const duration = elements.video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    showError(elements.uploadError, "This video has no readable duration. Try another video file.");
    releaseVideo();
    return;
  }
  elements.duration.textContent = formatTime(duration);
  elements.start.value = "0";
  elements.end.value = Math.min(15, duration).toFixed(1);
  elements.uploadPanel.hidden = true;
  elements.editor.hidden = false;
  elements.placeholder.hidden = true;
  elements.uploadError.hidden = true;
  updateTrimControls();
  elements.editor.scrollIntoView({ behavior: "smooth", block: "start" });
});
elements.video.addEventListener("error", () => {
  if (!sourceFile) return;
  showError(elements.uploadError, "This video could not be opened by your browser. Try an MP4, MOV, or WebM file.");
  releaseVideo();
});

function showError(target, message) {
  target.textContent = message;
  target.hidden = false;
}

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.classList.add("visible");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => elements.toast.classList.remove("visible"), 3500);
}

function loadVideo(file) {
  elements.uploadError.hidden = true;
  if (!isVideoFile(file)) {
    showError(elements.uploadError, "Choose a video file to get started.");
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    showError(elements.uploadError, "This file is over 2 GB. Choose a smaller video so it can play smoothly in your browser.");
    return;
  }
  releaseVideo();
  sourceFile = file;
  sourceUrl = URL.createObjectURL(file);
  elements.fileName.textContent = file.name;
  elements.editor.hidden = true;
  elements.uploadPanel.hidden = false;
  elements.video.src = sourceUrl;
  elements.video.load();
  elements.fileInput.value = "";
}

function releaseVideo() {
  elements.video.pause();
  elements.video.removeAttribute("src");
  elements.video.load();
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = null;
  sourceFile = null;
  clips = [];
  renderClips();
  elements.editor.hidden = true;
  elements.placeholder.hidden = false;
}

function updateTrimControls() {
  const duration = Number.isFinite(elements.video.duration) ? elements.video.duration : 0;
  const start = clamp(Number(elements.start.value) || 0, 0, duration);
  const end = clamp(Number(elements.end.value) || 0, 0, duration);
  const length = Math.max(0, end - start);
  elements.clipLength.textContent = `${length.toFixed(1)} sec`;
  const left = duration ? (start / duration) * 100 : 0;
  const width = duration ? (length / duration) * 100 : 0;
  elements.selection.style.left = `${left}%`;
  elements.selection.style.width = `${width}%`;
}

function addClip() {
  elements.clipError.hidden = true;
  const start = Number(elements.start.value);
  const end = Number(elements.end.value);
  const duration = elements.video.duration;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration) {
    showError(elements.clipError, "Enter a start and end time within the video. The end must be after the start.");
    return;
  }
  if (end - start > MAX_CLIP_SECONDS) {
    showError(elements.clipError, `Keep each clip to ${MAX_CLIP_SECONDS} seconds or less.`);
    return;
  }
  const clip = {
    id: nextClipId++,
    start,
    end,
    format: elements.aspect.value,
    status: "ready",
  };
  clips.push(clip);
  renderClips();
  elements.start.value = end.toFixed(1);
  elements.end.value = Math.min(end + 15, duration).toFixed(1);
  if (Number(elements.end.value) <= Number(elements.start.value)) {
    elements.start.value = Math.max(0, duration - Math.min(15, duration)).toFixed(1);
    elements.end.value = duration.toFixed(1);
  }
  updateTrimControls();
  showToast("Clip added to your list.");
}

function renderClips() {
  elements.clipsList.querySelectorAll(".clip-card").forEach((card) => card.remove());
  elements.emptyClips.hidden = clips.length > 0;
  elements.clipCount.textContent = `${clips.length} ${clips.length === 1 ? "clip" : "clips"}`;
  for (const clip of clips) {
    const card = document.createElement("article");
    card.className = "clip-card";
    card.dataset.clipId = String(clip.id);

    const top = document.createElement("div");
    top.className = "clip-card-top";
    const details = document.createElement("div");
    const title = document.createElement("h4");
    title.className = "clip-card-title";
    title.textContent = `Clip ${String(clip.id).padStart(2, "0")}`;
    const time = document.createElement("p");
    time.className = "clip-card-time";
    time.textContent = `${formatTime(clip.start)} — ${formatTime(clip.end)} · ${(clip.end - clip.start).toFixed(1)} sec`;
    details.append(title, time);

    const remove = document.createElement("button");
    remove.className = "remove-clip";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove clip ${clip.id}`);
    remove.addEventListener("click", () => {
      clips = clips.filter((item) => item.id !== clip.id);
      renderClips();
    });
    top.append(details, remove);

    const bottom = document.createElement("div");
    bottom.className = "clip-card-bottom";
    const format = document.createElement("span");
    format.className = "clip-format";
    format.textContent = OUTPUTS[clip.format].label;
    const exportButton = document.createElement("button");
    exportButton.className = "primary-button export-button";
    exportButton.type = "button";
    exportButton.innerHTML = "<span>↓</span> Export";
    exportButton.addEventListener("click", () => exportClip(clip, card, exportButton));
    bottom.append(format, exportButton);
    card.append(top, bottom);
    elements.clipsList.append(card);
  }
}

function previewClip() {
  elements.clipError.hidden = true;
  const start = Number(elements.start.value);
  const end = Number(elements.end.value);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > elements.video.duration) {
    showError(elements.clipError, "Choose a valid start and end time before previewing.");
    return;
  }
  window.clearInterval(previewTimeout);
  elements.video.pause();
  const onSeeked = () => {
    elements.video.removeEventListener("seeked", onSeeked);
    elements.video.play().then(() => {
      previewTimeout = window.setInterval(() => {
        if (elements.video.currentTime >= end) {
          elements.video.pause();
          window.clearInterval(previewTimeout);
          previewTimeout = 0;
        }
      }, 100);
    }).catch(() => showToast("Press play on the video preview to start playback.", true));
  };
  elements.video.addEventListener("seeked", onSeeked, { once: true });
  elements.video.currentTime = start;
  if (Math.abs(elements.video.currentTime - start) < 0.01) onSeeked();
}

async function exportClip(clip, card, button) {
  if (exportInProgress) {
    showToast("Export one clip at a time so the preview stays in sync.", true);
    return;
  }
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    showToast("Video export needs a browser with MediaRecorder and canvas capture support. Try current Chrome or Firefox.", true);
    return;
  }
  const sourceCapture = elements.video.captureStream || elements.video.mozCaptureStream;
  if (typeof sourceCapture !== "function") {
    showToast("This browser cannot capture the video's audio. Try current Chrome or Firefox.", true);
    return;
  }
  const output = OUTPUTS[clip.format];
  const canvas = document.createElement("canvas");
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    showToast("Could not start the video renderer in this browser.", true);
    return;
  }
  const canvasStream = canvas.captureStream(30);
  const previousTime = elements.video.currentTime;
  let sourceStream = null;
  let recorder = null;
  let animationFrame = 0;
  let stopTimeout = 0;
  let progressBar = null;

  exportInProgress = true;
  elements.changeVideo.disabled = true;
  elements.clipsList.querySelectorAll(".export-button, .remove-clip").forEach((control) => {
    control.disabled = true;
  });
  button.disabled = true;
  button.innerHTML = "<span>◌</span> Preparing";
  clip.status = "exporting";

  try {
    sourceStream = sourceCapture.call(elements.video);
    for (const track of sourceStream.getAudioTracks()) canvasStream.addTrack(track);
    const mimeType = getRecordingMimeType();
    if (!mimeType) throw new Error("This browser does not support WebM or MP4 video recording.");
    recorder = new MediaRecorder(canvasStream, { mimeType });
    const chunks = [];
    const recording = new Promise((resolve, reject) => {
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunks.push(event.data);
      });
      recorder.addEventListener("error", (event) => reject(event.error || new Error("The browser could not export this clip.")), { once: true });
      recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType })), { once: true });
    });

    progressBar = document.createElement("div");
    progressBar.className = "export-progress";
    const progressFill = document.createElement("span");
    progressBar.append(progressFill);
    card.append(progressBar);

    elements.video.pause();
    await seekVideo(clip.start);
    drawVideoFrame(context, canvas, elements.video);
    recorder.start(250);
    button.innerHTML = "<span>◌</span> Exporting";
    await elements.video.play();

    const startedAt = performance.now();
    const draw = () => {
      if (recorder.state !== "recording") return;
      drawVideoFrame(context, canvas, elements.video);
      progressFill.style.width = `${clamp(((elements.video.currentTime - clip.start) / (clip.end - clip.start)) * 100, 0, 100)}%`;
      if (elements.video.currentTime >= clip.end || performance.now() - startedAt > (clip.end - clip.start) * 2500 + 30000) {
        elements.video.pause();
        recorder.stop();
        return;
      }
      animationFrame = requestAnimationFrame(draw);
    };
    animationFrame = requestAnimationFrame(draw);
    stopTimeout = window.setTimeout(() => {
      if (recorder.state === "recording") {
        elements.video.pause();
        recorder.stop();
      }
    }, (clip.end - clip.start) * 2500 + 30000);

    const blob = await recording;
    if (!blob.size) throw new Error("The exported clip is empty. Try exporting it again.");
    const extension = mimeType.includes("mp4") ? "mp4" : "webm";
    downloadBlob(blob, `${safeFilename(sourceFile.name)}-clip-${String(clip.id).padStart(2, "0")}-${clip.format}.${extension}`);
    showToast("Your clip is ready and downloaded.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Something went wrong while exporting. Try again.", true);
  } finally {
    window.clearTimeout(stopTimeout);
    cancelAnimationFrame(animationFrame);
    if (recorder && recorder.state === "recording") recorder.stop();
    elements.video.pause();
    if (Number.isFinite(previousTime)) {
      try {
        await seekVideo(previousTime);
      } catch (error) {
        showToast(`Clip export finished, but the preview could not return to its previous position: ${error.message}`, true);
      }
    }
    for (const track of canvasStream.getTracks()) track.stop();
    if (sourceStream) {
      for (const track of sourceStream.getTracks()) track.stop();
    }
    progressBar?.remove();
    if (clips.some((item) => item.id === clip.id)) {
      clip.status = "ready";
      button.innerHTML = "<span>↓</span> Export";
    }
    exportInProgress = false;
    elements.changeVideo.disabled = false;
    elements.clipsList.querySelectorAll(".export-button, .remove-clip").forEach((control) => {
      control.disabled = false;
    });
  }
}

function drawVideoFrame(context, canvas, video) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(video, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
}

function getRecordingMimeType() {
  const options = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return options.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function seekVideo(time) {
  if (Math.abs(elements.video.currentTime - time) < 0.01) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      elements.video.removeEventListener("seeked", onSeeked);
      reject(new Error("The video could not seek to that moment. Try another clip range."));
    }, 10000);
    const onSeeked = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    elements.video.addEventListener("seeked", onSeeked, { once: true });
    elements.video.currentTime = time;
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function safeFilename(filename) {
  return filename
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "video";
}

function isVideoFile(file) {
  return file.type.startsWith("video/") || /\.(mp4|m4v|mov|webm|ogv|avi|mkv)$/i.test(file.name);
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
