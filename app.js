(function () {
  "use strict";

  var BASE_IMAGE_PATH = "assert/plain_white.png";
  var SHIRT_WIDTH = 480;
  var SHIRT_HEIGHT = 520;
  var TARGET_TILE_MAX_DIM = 175;

  var baseImage = null;
  var lightingCanvas = null;
  var lightingCtx = null;
  var outputCanvas = null;
  var outputCtx = null;
  var currentObjectUrl = null;

  var textureInput = null;
  var errorMessageEl = null;
  var downloadBtn = null;

  function showError(message) {
    errorMessageEl.textContent = message;
    errorMessageEl.hidden = false;
  }

  function clearError() {
    errorMessageEl.textContent = "";
    errorMessageEl.hidden = true;
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("Failed to load image: " + src));
      };
      img.src = src;
    });
  }

  function loadBaseImageAndBuildLightingMap() {
    return loadImage(BASE_IMAGE_PATH)
      .then(function (img) {
        baseImage = img;

        lightingCanvas = document.createElement("canvas");
        lightingCanvas.width = SHIRT_WIDTH;
        lightingCanvas.height = SHIRT_HEIGHT;
        lightingCtx = lightingCanvas.getContext("2d");
        lightingCtx.drawImage(baseImage, 0, 0, SHIRT_WIDTH, SHIRT_HEIGHT);

        var imageData;
        try {
          imageData = lightingCtx.getImageData(0, 0, SHIRT_WIDTH, SHIRT_HEIGHT);
        } catch (err) {
          throw new TaintedCanvasError();
        }

        var data = imageData.data;
        for (var i = 0; i < data.length; i += 4) {
          var luma = Math.round(
            0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
          );
          data[i] = luma;
          data[i + 1] = luma;
          data[i + 2] = luma;
          data[i + 3] = 255;
        }
        lightingCtx.putImageData(imageData, 0, 0);

        outputCtx.clearRect(0, 0, SHIRT_WIDTH, SHIRT_HEIGHT);
        outputCtx.drawImage(baseImage, 0, 0, SHIRT_WIDTH, SHIRT_HEIGHT);
      });
  }

  function TaintedCanvasError() {
    this.message =
      "This page must be served over a local web server, not opened directly as a file. " +
      "Run \"python3 -m http.server\" in the project folder, then open the printed " +
      "http://localhost address in your browser.";
  }
  TaintedCanvasError.prototype = Object.create(Error.prototype);

  function compositeTexture(textureImg) {
    var naturalW = textureImg.naturalWidth || textureImg.width;
    var naturalH = textureImg.naturalHeight || textureImg.height;
    var scale = TARGET_TILE_MAX_DIM / Math.max(naturalW, naturalH);
    var tileW = Math.max(1, Math.round(naturalW * scale));
    var tileH = Math.max(1, Math.round(naturalH * scale));

    var tileCanvas = document.createElement("canvas");
    tileCanvas.width = tileW;
    tileCanvas.height = tileH;
    var tileCtx = tileCanvas.getContext("2d");
    tileCtx.fillStyle = "#ffffff";
    tileCtx.fillRect(0, 0, tileW, tileH);
    tileCtx.globalCompositeOperation = "source-over";
    tileCtx.drawImage(textureImg, 0, 0, tileW, tileH);

    var pattern = outputCtx.createPattern(tileCanvas, "repeat");

    outputCtx.globalCompositeOperation = "source-over";
    outputCtx.clearRect(0, 0, SHIRT_WIDTH, SHIRT_HEIGHT);
    outputCtx.fillStyle = pattern;
    outputCtx.fillRect(0, 0, SHIRT_WIDTH, SHIRT_HEIGHT);

    outputCtx.globalCompositeOperation = "multiply";
    outputCtx.drawImage(lightingCanvas, 0, 0);

    outputCtx.globalCompositeOperation = "destination-in";
    outputCtx.drawImage(baseImage, 0, 0, SHIRT_WIDTH, SHIRT_HEIGHT);

    outputCtx.globalCompositeOperation = "source-over";

    downloadBtn.disabled = false;
  }

  function resetFileInput() {
    textureInput.value = "";
  }

  function handleFileChange(event) {
    var files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    var file = files[0];
    if (!file.type || file.type.indexOf("image/") !== 0) {
      showError("Please choose an image file (PNG, JPG, WEBP, etc.).");
      resetFileInput();
      return;
    }

    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }

    var objectUrl = URL.createObjectURL(file);
    currentObjectUrl = objectUrl;

    var img = new Image();
    img.onload = function () {
      try {
        clearError();
        compositeTexture(img);
      } catch (err) {
        showError("Could not apply that texture: " + err.message);
      }
    };
    img.onerror = function () {
      showError("That file could not be read as an image.");
      resetFileInput();
    };
    img.src = objectUrl;
  }

  function handleDownload() {
    outputCanvas.toBlob(function (blob) {
      if (!blob) {
        showError("Could not generate a PNG from the current preview.");
        return;
      }
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "shirt-mockup.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  function init() {
    textureInput = document.getElementById("texture-input");
    errorMessageEl = document.getElementById("error-message");
    downloadBtn = document.getElementById("download-btn");
    outputCanvas = document.getElementById("preview-canvas");
    outputCtx = outputCanvas.getContext("2d");

    textureInput.addEventListener("change", handleFileChange);
    downloadBtn.addEventListener("click", handleDownload);

    loadBaseImageAndBuildLightingMap().catch(function (err) {
      showError(err.message);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
