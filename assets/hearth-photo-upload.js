/*
 * HearthPhotoUpload
 *
 * Shared photo upload component for Brand Hearth (hero image) and
 * Menu Library (per-item photography). Vanilla JS, no framework.
 *
 * Usage:
 *
 *   const upload = new HearthPhotoUpload(containerEl, {
 *     aspectRatio: 16 / 9,
 *     storagePath: (file) => `vendors/<slug>/hero/${Date.now()}.jpg`,
 *     initialUrl: existingUrl || null,
 *     guidanceCopy: 'hero',
 *     onUpload: (publicUrl) => { ... persist to DB ... },
 *     onRemove: () => { ... clear in DB ... },
 *   });
 *
 * Notes:
 * - Cropper.js is loaded lazily from CDN (singleton across the page).
 * - Output is always JPEG at quality 0.85, max edge 1600px.
 * - Upload uses window._getHearthClient().storage.from('vendor-assets')
 *   (matches the existing T2-7 logo upload pattern).
 * - The caller is responsible for persisting the returned public URL
 *   via the appropriate Edge Function (e.g. update-vendor,
 *   update-product) and clearing it via the same path on remove.
 */

(function () {
  "use strict";

  if (window.HearthPhotoUpload) return;

  // ------------------------------------------------------------------
  // Cropper.js singleton loader
  // ------------------------------------------------------------------
  const CROPPER_CSS_URL =
    "https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.css";
  const CROPPER_JS_URL =
    "https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.js";

  let cropperPromise = null;

  function loadCropperOnce() {
    if (cropperPromise) return cropperPromise;
    cropperPromise = new Promise((resolve, reject) => {
      if (window.Cropper) {
        resolve(window.Cropper);
        return;
      }
      try {
        if (!document.querySelector('link[data-hpu-cropper-css]')) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = CROPPER_CSS_URL;
          link.setAttribute("data-hpu-cropper-css", "");
          document.head.appendChild(link);
        }
        const existingScript = document.querySelector(
          'script[data-hpu-cropper-js]'
        );
        if (existingScript) {
          existingScript.addEventListener("load", () =>
            resolve(window.Cropper)
          );
          existingScript.addEventListener("error", () => {
            cropperPromise = null;
            reject(new Error("cropper-load-failed"));
          });
          return;
        }
        const script = document.createElement("script");
        script.src = CROPPER_JS_URL;
        script.async = true;
        script.setAttribute("data-hpu-cropper-js", "");
        script.onload = () => resolve(window.Cropper);
        script.onerror = () => {
          cropperPromise = null;
          reject(new Error("cropper-load-failed"));
        };
        document.head.appendChild(script);
      } catch (err) {
        cropperPromise = null;
        reject(err);
      }
    });
    return cropperPromise;
  }

  // ------------------------------------------------------------------
  // libheif-js singleton loader (self-hosted)
  // ------------------------------------------------------------------
  const LIBHEIF_JS_URL = "assets/libheif.js";

  let libheifPromise = null;

  function loadLibheifOnce() {
    if (libheifPromise) return libheifPromise;
    libheifPromise = new Promise((resolve, reject) => {
      if (window.libheif) {
        resolve(window.libheif);
        return;
      }
      try {
        const existing = document.querySelector(
          'script[data-hpu-libheif]'
        );
        if (existing) {
          existing.addEventListener("load", () =>
            resolve(window.libheif)
          );
          existing.addEventListener("error", () => {
            libheifPromise = null;
            reject(new Error("libheif-load-failed"));
          });
          return;
        }
        const script = document.createElement("script");
        script.src = LIBHEIF_JS_URL;
        script.async = true;
        script.setAttribute("data-hpu-libheif", "");
        script.onload = () => resolve(window.libheif);
        script.onerror = () => {
          libheifPromise = null;
          reject(new Error("libheif-load-failed"));
        };
        document.head.appendChild(script);
      } catch (err) {
        libheifPromise = null;
        reject(err);
      }
    });
    return libheifPromise;
  }

  async function decodeHeicToJpeg(file) {
    const libheifEntry = await loadLibheifOnce();
    const libheifModule =
      typeof libheifEntry === "function"
        ? await libheifEntry({
            locateFile: (path) => `assets/${path}`,
          })
        : libheifEntry;
    const arrayBuffer = await file.arrayBuffer();
    const decoder = new libheifModule.HeifDecoder();
    const images = decoder.decode(arrayBuffer);
    if (!images || images.length === 0) {
      throw new Error("No images in HEIF");
    }
    const image = images[0];
    const width = image.get_width();
    const height = image.get_height();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(width, height);
    await new Promise((resolve, reject) => {
      image.display(imageData, (displayed) => {
        if (!displayed) return reject(new Error("HEIF display failed"));
        ctx.putImageData(displayed, 0, 0);
        resolve();
      });
    });
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("toBlob failed")),
        "image/jpeg",
        0.9
      );
    });
  }

  // ------------------------------------------------------------------
  // Component CSS (injected once)
  // ------------------------------------------------------------------
  const STYLE_ID = "hpu-styles";

  function injectStylesOnce() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .hpu-root {
        --hpu-bg: #faf7f4;
        --hpu-border: #e8dfd3;
        --hpu-text: #1F2937;
        --hpu-muted: #6b6256;
        --hpu-amber-bg: #fdf3df;
        --hpu-amber-border: #e6c876;
        --hpu-amber-text: #8a5a1a;
        --hpu-radius: 14px;
        font-family: inherit;
        color: var(--hpu-text);
        display: block;
      }
      .hpu-hidden { display: none !important; }

      .hpu-frame {
        position: relative;
        width: 100%;
        background: var(--hpu-bg);
        border: 1px dashed var(--hpu-border);
        border-radius: var(--hpu-radius);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        box-sizing: border-box;
      }
      .hpu-frame-img {
        border-style: solid;
        background: #fff;
      }
      .hpu-frame-error {
        background: var(--hpu-amber-bg);
        border-color: var(--hpu-amber-border);
        border-style: solid;
        padding: 18px 20px;
      }

      .hpu-add-btn {
        appearance: none;
        background: #fff;
        color: var(--hpu-text);
        border: 1px solid var(--hpu-border);
        border-radius: 999px;
        padding: 12px 22px;
        font-size: 14px;
        font-weight: 600;
        line-height: 1;
        cursor: pointer;
        transition: background 120ms ease, transform 120ms ease;
      }
      .hpu-add-btn:hover { background: #fff8ef; }
      .hpu-add-btn:active { transform: translateY(1px); }

      .hpu-actions {
        display: flex;
        gap: 10px;
        margin-top: 12px;
        flex-wrap: wrap;
      }

      .hpu-btn {
        appearance: none;
        font: inherit;
        font-size: 14px;
        font-weight: 600;
        line-height: 1;
        padding: 10px 18px;
        border-radius: 999px;
        border: 1px solid transparent;
        cursor: pointer;
        transition: background 120ms ease, transform 120ms ease,
          opacity 120ms ease;
      }
      .hpu-btn:active { transform: translateY(1px); }
      .hpu-btn:disabled { opacity: 0.5; cursor: not-allowed; }

      .hpu-btn-primary {
        background: var(--hpu-text);
        color: #fff;
      }
      .hpu-btn-primary:hover { background: #2a3645; }

      .hpu-btn-secondary {
        background: #fff;
        color: var(--hpu-text);
        border-color: var(--hpu-border);
      }
      .hpu-btn-secondary:hover { background: #fff8ef; }

      .hpu-btn-tertiary {
        background: transparent;
        color: var(--hpu-amber-text);
        border-color: var(--hpu-amber-border);
      }
      .hpu-btn-tertiary:hover { background: var(--hpu-amber-bg); }

      .hpu-cropper-frame {
        position: relative;
        width: 100%;
        max-height: 60vh;
        background: #1F2937;
        border-radius: var(--hpu-radius);
        overflow: hidden;
      }
      .hpu-cropper-img {
        display: block;
        max-width: 100%;
      }

      .hpu-preview {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .hpu-spinner {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 3px solid rgba(31, 41, 55, 0.15);
        border-top-color: var(--hpu-text);
        animation: hpu-spin 0.8s linear infinite;
      }
      @keyframes hpu-spin {
        to { transform: rotate(360deg); }
      }
      .hpu-status {
        margin-top: 10px;
        font-size: 13px;
        color: var(--hpu-muted);
      }
      .hpu-uploading-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }

      .hpu-error-msg {
        font-size: 14px;
        line-height: 1.45;
        color: var(--hpu-amber-text);
      }

      .hpu-guidance {
        margin-top: 14px;
        background: var(--hpu-bg);
        border: 1px solid var(--hpu-border);
        border-radius: var(--hpu-radius);
        padding: 0 16px;
      }
      .hpu-guidance > summary {
        list-style: none;
        cursor: pointer;
        padding: 14px 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--hpu-text);
      }
      .hpu-guidance > summary::-webkit-details-marker { display: none; }
      .hpu-guidance > summary::marker { display: none; }
      .hpu-guidance[open] > summary {
        border-bottom: 1px solid var(--hpu-border);
      }
      .hpu-guidance-body {
        padding: 14px 0 18px;
        font-size: 14px;
        line-height: 1.6;
        color: var(--hpu-text);
      }
      .hpu-guidance-body h4 {
        font-size: 16px;
        margin: 0 0 10px;
        font-weight: 700;
      }
      .hpu-guidance-body p { margin: 0 0 12px; }
      .hpu-guidance-body p:last-child { margin-bottom: 0; }
      .hpu-guidance-body strong { font-weight: 700; }
    `;
    document.head.appendChild(style);
  }

  // ------------------------------------------------------------------
  // Guidance copy
  // ------------------------------------------------------------------
  const GUIDANCE_COPY = {
    item: {
      title: "Taking good food photos",
      lead:
        "You don't need a camera. A phone (with a wiped lens), a window, and a few small habits go a long way.",
      paragraphs: [
        [
          "Natural light is everything.",
          " Move your dish near a window during the day. Overhead kitchen lights create harsh shadows and yellow tones — window light is softer and shows colour honestly.",
        ],
        [
          "Get close, leave breathing room.",
          " Fill most of the frame with the food, but not all of it. The order page crops your photo to a wide letterbox shape; leaving space around the dish gives that crop somewhere to sit.",
        ],
        [
          "Angle to suit the dish.",
          " Flat dishes — pizza, pasta, salads — work well from directly above. Layered dishes — burgers, stacks, bowls — usually look better from a slight angle. Avoid extreme overhead unless the dish is genuinely flat.",
        ],
        [
          "Keep the background plain.",
          " Wood, stone, linen, a clean table. Skip clutter, branded packaging, busy patterns. The food should be the only thing the eye lands on.",
        ],
        [
          "Show it as you serve it.",
          " Real plates, real environments. Skip props you wouldn't normally use. The order page should feel like your food, not a magazine spread.",
        ],
      ],
    },
    hero: {
      title: "Taking a good hero photo",
      lead:
        "The hero sits at the top of your order page, before customers see anything else. It should hint at your character — what your food feels like, where it comes from, how it's made.",
      paragraphs: [
        [
          "Lead with food, not logo.",
          " A great dish, a kitchen in motion, hands shaping dough — these say more about you than a logo ever can. Keep your logo for places it's already shown (your nav, your business card). The hero is for atmosphere.",
        ],
        [
          "Natural light is everything.",
          " Window light during the day, never overhead kitchen lights. A softly lit scene reads warm and inviting; a yellow-tinted one reads cheap.",
        ],
        [
          "Choose what's most “you”.",
          " Your signature dish on a board. Your wood oven mid-bake. Your food truck at golden hour. The plate as it leaves the pass. Anything that tells someone what kind of food they're about to order from.",
        ],
        [
          "Plain or atmospheric — not cluttered.",
          " A plain background works. So does a real environment with character (kitchen surfaces, weathered wood, brick). What doesn't work: branded packaging, busy patterns, anything that pulls attention from the subject.",
        ],
        [
          "Wider than you think.",
          " The hero is a wide shape. Your photo will be cropped to fit it. Frame loose to let the crop sit somewhere flattering.",
        ],
      ],
    },
  };

  function buildGuidanceHTML(key) {
    const copy = GUIDANCE_COPY[key] || GUIDANCE_COPY.item;
    const paragraphs = copy.paragraphs
      .map(
        ([head, rest]) =>
          `<p><strong>${escapeHTML(head)}</strong>${escapeHTML(rest)}</p>`
      )
      .join("");
    return `
      <h4>${escapeHTML(copy.title)}</h4>
      <p>${escapeHTML(copy.lead)}</p>
      ${paragraphs}
    `;
  }

  // ------------------------------------------------------------------
  // Constants and helpers
  // ------------------------------------------------------------------
  const ACCEPTED_MIME = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ];
  const MAX_BYTES = 10 * 1024 * 1024;
  const MAX_EDGE = 1600;
  const JPEG_QUALITY = 0.85;

  const ERROR_COPY = {
    tooLarge: "That file's a bit big. Please choose one under 10MB.",
    wrongFormat: "Please upload a JPEG, PNG, WebP, or HEIC image.",
    uploadFailed: "We couldn't save that. Please try again.",
    cropperLoad:
      "Something went wrong loading the photo editor. Please refresh and try again.",
    heicConvert:
      "We couldn't decode this HEIC photo. Try uploading from your phone, or convert to JPEG first using Preview (File → Export As).",
  };

  function escapeHTML(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function compressCanvas(canvas) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error("compression-failed")),
          "image/jpeg",
          JPEG_QUALITY
        );
      } catch (err) {
        reject(err);
      }
    });
  }

  function isAcceptableFile(file) {
    if (!file) return false;
    if (file.size > MAX_BYTES) return "tooLarge";
    if (file.type && !ACCEPTED_MIME.includes(file.type)) {
      // Some iOS HEIC files come through with empty MIME — fall back to
      // the file extension before deciding it's wrong.
      if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || "")) {
        return "wrongFormat";
      }
    }
    return true;
  }

  function isHeicFile(file) {
    if (!file) return false;
    const t = file.type || "";
    if (t === "image/heic" || t === "image/heif") return true;
    return /\.(heic|heif)$/i.test(file.name || "");
  }

  // ------------------------------------------------------------------
  // HearthPhotoUpload
  // ------------------------------------------------------------------
  function HearthPhotoUpload(container, opts) {
    if (!(this instanceof HearthPhotoUpload)) {
      return new HearthPhotoUpload(container, opts);
    }
    if (!container || !(container instanceof HTMLElement)) {
      throw new Error("HearthPhotoUpload: container must be an HTMLElement");
    }
    opts = opts || {};

    this.container = container;
    this.aspectRatio =
      typeof opts.aspectRatio === "number" && opts.aspectRatio > 0
        ? opts.aspectRatio
        : 16 / 9;
    this.storagePath =
      typeof opts.storagePath === "function" ? opts.storagePath : null;
    this.initialUrl = opts.initialUrl || null;
    this.guidanceCopy = opts.guidanceCopy === "hero" ? "hero" : "item";
    this.onUpload = typeof opts.onUpload === "function" ? opts.onUpload : null;
    this.onRemove = typeof opts.onRemove === "function" ? opts.onRemove : null;

    this._cropper = null;
    this._currentObjectURL = null;
    this._lastValidState = "empty";
    this._currentImageURL = this.initialUrl || null;

    injectStylesOnce();
    this._render();
    this._bind();
    this._setState(this.initialUrl ? "has-image" : "empty");
  }

  HearthPhotoUpload.prototype._render = function () {
    const ar = this.aspectRatio;
    const padTopPct = (1 / ar) * 100;
    const guidance = buildGuidanceHTML(this.guidanceCopy);

    this.container.innerHTML = `
      <div class="hpu-root" data-state="empty">
        <!-- Empty -->
        <div class="hpu-state-empty">
          <div class="hpu-frame" style="padding-top:${padTopPct.toFixed(
            4
          )}%;">
            <button type="button" class="hpu-add-btn" data-hpu-add
              style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);">
              + Add a photo
            </button>
          </div>
          <details class="hpu-guidance">
            <summary>How to take a good photo →</summary>
            <div class="hpu-guidance-body">${guidance}</div>
          </details>
        </div>

        <!-- Selected (cropping) -->
        <div class="hpu-state-selected hpu-hidden">
          <div class="hpu-cropper-frame">
            <img class="hpu-cropper-img" alt="" />
          </div>
          <div class="hpu-actions">
            <button type="button" class="hpu-btn hpu-btn-secondary"
              data-hpu-cancel>Cancel</button>
            <button type="button" class="hpu-btn hpu-btn-primary"
              data-hpu-save>Save</button>
          </div>
        </div>

        <!-- Converting (HEIC → JPEG) -->
        <div class="hpu-state-converting hpu-hidden">
          <div class="hpu-frame" style="padding-top:${padTopPct.toFixed(
            4
          )}%;">
            <div class="hpu-uploading-inner"
              style="position:absolute;inset:0;">
              <div class="hpu-spinner"></div>
              <div class="hpu-status">Converting photo…</div>
            </div>
          </div>
        </div>

        <!-- Uploading -->
        <div class="hpu-state-uploading hpu-hidden">
          <div class="hpu-frame" style="padding-top:${padTopPct.toFixed(
            4
          )}%;">
            <div class="hpu-uploading-inner"
              style="position:absolute;inset:0;">
              <div class="hpu-spinner"></div>
              <div class="hpu-status">Uploading…</div>
            </div>
          </div>
        </div>

        <!-- Has image -->
        <div class="hpu-state-has-image hpu-hidden">
          <div class="hpu-frame hpu-frame-img"
            style="padding-top:${padTopPct.toFixed(4)}%;">
            <img class="hpu-preview" data-hpu-preview alt=""
              style="position:absolute;inset:0;" />
          </div>
          <div class="hpu-actions">
            <button type="button" class="hpu-btn hpu-btn-secondary"
              data-hpu-replace>Replace</button>
            <button type="button" class="hpu-btn hpu-btn-tertiary"
              data-hpu-remove>Remove</button>
          </div>
        </div>

        <!-- Error -->
        <div class="hpu-state-error hpu-hidden">
          <div class="hpu-frame hpu-frame-error">
            <div class="hpu-error-msg" data-hpu-error></div>
          </div>
          <div class="hpu-actions">
            <button type="button" class="hpu-btn hpu-btn-secondary"
              data-hpu-try-again>Try again</button>
          </div>
        </div>

        <input type="file" data-hpu-file
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          hidden />
      </div>
    `;

    this._root = this.container.querySelector(".hpu-root");
    this._fileInput = this._root.querySelector("[data-hpu-file]");
    this._previewImg = this._root.querySelector("[data-hpu-preview]");
    this._cropperImg = this._root.querySelector(".hpu-cropper-img");
    this._errorEl = this._root.querySelector("[data-hpu-error]");

    if (this._currentImageURL) {
      this._previewImg.src = this._currentImageURL;
    }
  };

  HearthPhotoUpload.prototype._bind = function () {
    const root = this._root;

    root
      .querySelector("[data-hpu-add]")
      .addEventListener("click", () => this._openFilePicker());
    root
      .querySelector("[data-hpu-replace]")
      .addEventListener("click", () => this._openFilePicker());
    root
      .querySelector("[data-hpu-cancel]")
      .addEventListener("click", () => this._cancelCrop());
    root
      .querySelector("[data-hpu-save]")
      .addEventListener("click", () => this._saveCrop());
    root
      .querySelector("[data-hpu-remove]")
      .addEventListener("click", () => this._confirmRemove());
    root
      .querySelector("[data-hpu-try-again]")
      .addEventListener("click", () => this._setState(this._lastValidState));

    this._fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      // Allow re-selecting the same file.
      this._fileInput.value = "";
      if (file) this._handleFile(file);
    });
  };

  HearthPhotoUpload.prototype._openFilePicker = function () {
    this._fileInput.click();
  };

  HearthPhotoUpload.prototype._setState = function (state) {
    if (
      state === "empty" ||
      state === "selected" ||
      state === "converting" ||
      state === "uploading" ||
      state === "has-image" ||
      state === "error"
    ) {
      this._root.dataset.state = state;
      const map = {
        empty: ".hpu-state-empty",
        selected: ".hpu-state-selected",
        converting: ".hpu-state-converting",
        uploading: ".hpu-state-uploading",
        "has-image": ".hpu-state-has-image",
        error: ".hpu-state-error",
      };
      Object.entries(map).forEach(([key, sel]) => {
        const el = this._root.querySelector(sel);
        if (!el) return;
        if (key === state) el.classList.remove("hpu-hidden");
        else el.classList.add("hpu-hidden");
      });
      if (state === "empty" || state === "has-image") {
        this._lastValidState = state;
      }
    }
  };

  HearthPhotoUpload.prototype._showError = function (key) {
    if (this._errorEl) {
      this._errorEl.textContent = ERROR_COPY[key] || ERROR_COPY.uploadFailed;
    }
    this._setState("error");
  };

  HearthPhotoUpload.prototype._handleFile = async function (file) {
    const check = isAcceptableFile(file);
    if (check === "tooLarge") {
      this._showError("tooLarge");
      return;
    }
    if (check === "wrongFormat") {
      this._showError("wrongFormat");
      return;
    }

    let processedFile = file;
    if (isHeicFile(file)) {
      this._setState("converting");
      try {
        const blob = await decodeHeicToJpeg(file);
        const newName =
          (file.name || "photo.heic").replace(/\.(heic|heif)$/i, ".jpg") ||
          "photo.jpg";
        processedFile = new File([blob], newName, { type: "image/jpeg" });
      } catch (err) {
        this._showError("heicConvert");
        return;
      }
    }

    loadCropperOnce()
      .then((Cropper) => this._beginCrop(processedFile, Cropper))
      .catch(() => this._showError("cropperLoad"));
  };

  HearthPhotoUpload.prototype._beginCrop = function (file, Cropper) {
    if (this._currentObjectURL) {
      URL.revokeObjectURL(this._currentObjectURL);
      this._currentObjectURL = null;
    }
    const objectURL = URL.createObjectURL(file);
    this._currentObjectURL = objectURL;

    const img = this._cropperImg;
    img.onload = null;
    img.onerror = () => {
      URL.revokeObjectURL(objectURL);
      if (this._currentObjectURL === objectURL) {
        this._currentObjectURL = null;
      }
      this._showError("wrongFormat");
    };

    img.onload = () => {
      this._setState("selected");
      if (this._cropper) {
        try {
          this._cropper.destroy();
        } catch (e) {
          /* ignore */
        }
        this._cropper = null;
      }
      try {
        this._cropper = new Cropper(img, {
          aspectRatio: this.aspectRatio,
          viewMode: 1,
          autoCropArea: 1,
          background: false,
          dragMode: "move",
          responsive: true,
          movable: true,
          zoomable: true,
          rotatable: false,
          scalable: false,
        });
      } catch (err) {
        this._showError("cropperLoad");
      }
    };

    img.src = objectURL;
  };

  HearthPhotoUpload.prototype._cancelCrop = function () {
    if (this._cropper) {
      try {
        this._cropper.destroy();
      } catch (e) {
        /* ignore */
      }
      this._cropper = null;
    }
    if (this._currentObjectURL) {
      URL.revokeObjectURL(this._currentObjectURL);
      this._currentObjectURL = null;
    }
    this._setState(this._lastValidState);
  };

  HearthPhotoUpload.prototype._saveCrop = function () {
    if (!this._cropper) {
      this._showError("uploadFailed");
      return;
    }
    let canvas;
    try {
      canvas = this._cropper.getCroppedCanvas({
        maxWidth: MAX_EDGE,
        maxHeight: MAX_EDGE,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
      });
    } catch (err) {
      this._showError("uploadFailed");
      return;
    }
    if (!canvas) {
      this._showError("uploadFailed");
      return;
    }

    compressCanvas(canvas)
      .then((blob) => this._upload(blob))
      .catch(() => this._showError("uploadFailed"));
  };

  HearthPhotoUpload.prototype._upload = function (blob) {
    if (!this.storagePath) {
      this._showError("uploadFailed");
      return;
    }
    const client =
      typeof window._getHearthClient === "function"
        ? window._getHearthClient()
        : null;
    if (!client || !client.storage) {
      this._showError("uploadFailed");
      return;
    }

    // Synthesize a File-like object for the storagePath callback so the
    // caller can read .name / .type if useful.
    const pseudoFile = {
      name: "upload.jpg",
      type: "image/jpeg",
      size: blob.size,
    };
    let path;
    try {
      path = this.storagePath(pseudoFile);
    } catch (err) {
      this._showError("uploadFailed");
      return;
    }
    if (!path || typeof path !== "string") {
      this._showError("uploadFailed");
      return;
    }

    if (this._cropper) {
      try {
        this._cropper.destroy();
      } catch (e) {
        /* ignore */
      }
      this._cropper = null;
    }
    if (this._currentObjectURL) {
      URL.revokeObjectURL(this._currentObjectURL);
      this._currentObjectURL = null;
    }

    this._setState("uploading");

    client.storage
      .from("vendor-assets")
      .upload(path, blob, { upsert: true, contentType: "image/jpeg" })
      .then((res) => {
        if (res && res.error) throw res.error;
        const pub = client.storage.from("vendor-assets").getPublicUrl(path);
        const publicUrl =
          (pub && pub.data && pub.data.publicUrl) || null;
        if (!publicUrl) throw new Error("no-public-url");

        // Cache-bust so the freshly replaced image is reloaded immediately.
        const bustedUrl =
          publicUrl + (publicUrl.includes("?") ? "&" : "?") + "v=" + Date.now();

        this._currentImageURL = bustedUrl;
        if (this._previewImg) this._previewImg.src = bustedUrl;
        this._setState("has-image");

        if (this.onUpload) {
          try {
            this.onUpload(publicUrl);
          } catch (e) {
            /* caller error — do not roll back UI */
          }
        }
      })
      .catch(() => this._showError("uploadFailed"));
  };

  HearthPhotoUpload.prototype._confirmRemove = function () {
    const ok = window.confirm("Remove this photo?");
    if (!ok) return;
    this._currentImageURL = null;
    if (this._previewImg) this._previewImg.removeAttribute("src");
    this._setState("empty");
    if (this.onRemove) {
      try {
        this.onRemove();
      } catch (e) {
        /* caller error */
      }
    }
  };

  HearthPhotoUpload.prototype.destroy = function () {
    if (this._cropper) {
      try {
        this._cropper.destroy();
      } catch (e) {
        /* ignore */
      }
      this._cropper = null;
    }
    if (this._currentObjectURL) {
      URL.revokeObjectURL(this._currentObjectURL);
      this._currentObjectURL = null;
    }
    if (this.container) {
      this.container.innerHTML = "";
    }
  };

  window.HearthPhotoUpload = HearthPhotoUpload;
})();
