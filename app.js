(function () {
  "use strict";

  var BASE_IMAGE_PATH = "assert/plain_white.png";
  var SHIRT_WIDTH = 480;
  var SHIRT_HEIGHT = 520;

  var patternConfig = {
    rotationDeg: 0,
    repeatCount: 3
  };

  var baseImage = null;
  var lightingCanvas = null;
  var lightingCtx = null;
  var outputCanvas = null;
  var outputCtx = null;
  var currentObjectUrl = null;
  var currentTextureImg = null;

  var overlayImg = null;
  var overlaySourceData = null;
  var currentOverlayObjectUrl = null;
  var quadPoints = [
    { x: 160, y: 160 },
    { x: 320, y: 160 },
    { x: 320, y: 340 },
    { x: 160, y: 340 }
  ];

  var textureInput = null;
  var rotationInput = null;
  var rotationValueEl = null;
  var repeatCountInput = null;
  var repeatCountValueEl = null;
  var overlayInput = null;
  var cornerReadoutEl = null;
  var cornerHandleEls = null;
  var maskReadoutEl = null;
  var maskHandleEls = null;
  var mask2ReadoutEl = null;
  var mask2HandleEls = null;
  var mask3ReadoutEl = null;
  var mask3HandleEls = [];
  var mask3DoubleBtn = null;
  var mask4ReadoutEl = null;
  var mask4HandleEls = [];
  var mask4DoubleBtn = null;
  var canvasWrapEl = null;
  var debugLogEl = null;
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

        renderAll();
      });
  }

  function drawShirtBase() {
    outputCtx.clearRect(0, 0, SHIRT_WIDTH, SHIRT_HEIGHT);
    outputCtx.drawImage(baseImage, 0, 0, SHIRT_WIDTH, SHIRT_HEIGHT);
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
    var tileTargetDim = SHIRT_WIDTH / patternConfig.repeatCount;
    var scale = tileTargetDim / Math.max(naturalW, naturalH);
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
    pattern.setTransform(new DOMMatrix().rotate(patternConfig.rotationDeg));

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

  // Maps the unit square (0,0)-(1,0)-(1,1)-(0,1) onto an arbitrary
  // quadrilateral via a projective transform (Heckbert's method).
  // Returns a flat row-major 3x3 matrix [a,b,c, d,e,f, g,h,i].
  function computeSquareToQuadMatrix(quad) {
    var x0 = quad[0].x, y0 = quad[0].y;
    var x1 = quad[1].x, y1 = quad[1].y;
    var x2 = quad[2].x, y2 = quad[2].y;
    var x3 = quad[3].x, y3 = quad[3].y;

    var dx1 = x1 - x2, dy1 = y1 - y2;
    var dx2 = x3 - x2, dy2 = y3 - y2;
    var dx3 = x0 - x1 + x2 - x3, dy3 = y0 - y1 + y2 - y3;

    var g, h;
    if (dx3 === 0 && dy3 === 0) {
      g = 0;
      h = 0;
    } else {
      var denom = dx1 * dy2 - dx2 * dy1;
      g = (dx3 * dy2 - dx2 * dy3) / denom;
      h = (dx1 * dy3 - dx3 * dy1) / denom;
    }

    var a = x1 - x0 + g * x1;
    var b = x3 - x0 + h * x3;
    var c = x0;
    var d = y1 - y0 + g * y1;
    var e = y3 - y0 + h * y3;
    var f = y0;

    return [a, b, c, d, e, f, g, h, 1];
  }

  function multiplyMatrices3x3(m1, m2) {
    var result = new Array(9);
    for (var row = 0; row < 3; row++) {
      for (var col = 0; col < 3; col++) {
        result[row * 3 + col] =
          m1[row * 3 + 0] * m2[0 * 3 + col] +
          m1[row * 3 + 1] * m2[1 * 3 + col] +
          m1[row * 3 + 2] * m2[2 * 3 + col];
      }
    }
    return result;
  }

  function invertMatrix3x3(m) {
    var a = m[0], b = m[1], c = m[2];
    var d = m[3], e = m[4], f = m[5];
    var g = m[6], h = m[7], i = m[8];

    var A = e * i - f * h;
    var B = -(d * i - f * g);
    var C = d * h - e * g;
    var D = -(b * i - c * h);
    var E = a * i - c * g;
    var F = -(a * h - b * g);
    var G = b * f - c * e;
    var H = -(a * f - c * d);
    var I = a * e - b * d;

    var det = a * A + b * B + c * C;
    if (!det) {
      return null;
    }
    var invDet = 1 / det;

    return [
      A * invDet, D * invDet, G * invDet,
      B * invDet, E * invDet, H * invDet,
      C * invDet, F * invDet, I * invDet
    ];
  }

  function applyMatrix3x3(m, x, y) {
    var w = m[6] * x + m[7] * y + m[8];
    return {
      x: (m[0] * x + m[1] * y + m[2]) / w,
      y: (m[3] * x + m[4] * y + m[5]) / w
    };
  }

  // Maps overlay-image pixel space directly onto the current quad in
  // canvas space (image px -> unit square -> quad).
  function buildImageToQuadMatrix(quad, srcW, srcH) {
    var squareToQuad = computeSquareToQuadMatrix(quad);
    var scale = [1 / srcW, 0, 0, 0, 1 / srcH, 0, 0, 0, 1];
    return multiplyMatrices3x3(squareToQuad, scale);
  }

  function sampleBilinear(data, w, h, x, y) {
    var fx = x - 0.5;
    var fy = y - 0.5;
    var x0 = Math.floor(fx);
    var y0 = Math.floor(fy);
    var tx = fx - x0;
    var ty = fy - y0;
    x0 = Math.max(0, Math.min(w - 1, x0));
    y0 = Math.max(0, Math.min(h - 1, y0));
    var x1 = Math.min(w - 1, x0 + 1);
    var y1 = Math.min(h - 1, y0 + 1);

    var result = [0, 0, 0, 0];
    for (var c = 0; c < 4; c++) {
      var top =
        data[(y0 * w + x0) * 4 + c] * (1 - tx) +
        data[(y0 * w + x1) * 4 + c] * tx;
      var bottom =
        data[(y1 * w + x0) * 4 + c] * (1 - tx) +
        data[(y1 * w + x1) * 4 + c] * tx;
      result[c] = top * (1 - ty) + bottom * ty;
    }
    return result;
  }

  function drawOverlay() {
    if (!overlayImg || !overlaySourceData) {
      return;
    }

    var srcW = overlaySourceData.width;
    var srcH = overlaySourceData.height;
    var imgToQuad = buildImageToQuadMatrix(quadPoints, srcW, srcH);
    var quadToImg = invertMatrix3x3(imgToQuad);
    if (!quadToImg) {
      return;
    }

    var xs = [quadPoints[0].x, quadPoints[1].x, quadPoints[2].x, quadPoints[3].x];
    var ys = [quadPoints[0].y, quadPoints[1].y, quadPoints[2].y, quadPoints[3].y];
    var minX = Math.max(0, Math.floor(Math.min.apply(null, xs)));
    var maxX = Math.min(SHIRT_WIDTH, Math.ceil(Math.max.apply(null, xs)));
    var minY = Math.max(0, Math.floor(Math.min.apply(null, ys)));
    var maxY = Math.min(SHIRT_HEIGHT, Math.ceil(Math.max.apply(null, ys)));
    var boxW = maxX - minX;
    var boxH = maxY - minY;
    if (boxW <= 0 || boxH <= 0) {
      return;
    }

    var layer = outputCtx.createImageData(boxW, boxH);
    var srcData = overlaySourceData.data;
    var dstData = layer.data;

    for (var py = 0; py < boxH; py++) {
      for (var px = 0; px < boxW; px++) {
        var srcPt = applyMatrix3x3(quadToImg, minX + px + 0.5, minY + py + 0.5);
        if (srcPt.x >= 0 && srcPt.x < srcW && srcPt.y >= 0 && srcPt.y < srcH) {
          var sampled = sampleBilinear(srcData, srcW, srcH, srcPt.x, srcPt.y);
          var di = (py * boxW + px) * 4;
          dstData[di] = sampled[0];
          dstData[di + 1] = sampled[1];
          dstData[di + 2] = sampled[2];
          dstData[di + 3] = sampled[3];
        }
      }
    }

    var layerCanvas = document.createElement("canvas");
    layerCanvas.width = boxW;
    layerCanvas.height = boxH;
    layerCanvas.getContext("2d").putImageData(layer, 0, 0);

    outputCtx.globalCompositeOperation = "source-over";
    outputCtx.drawImage(layerCanvas, minX, minY);

    outputCtx.globalCompositeOperation = "destination-in";
    outputCtx.drawImage(baseImage, 0, 0, SHIRT_WIDTH, SHIRT_HEIGHT);
    outputCtx.globalCompositeOperation = "source-over";
  }

  var colorMaskPoints = [
    { "x": 266.5, "y": 81.921875 }, { "x": 278.8333435058594, "y": 57.921875 }, { "x": 284.8333435058594, "y": 14.921875 }, { "x": 292.16668701171875, "y": 25.588539123535156 }, { "x": 297.8333435058594, "y": 31.921875 }, { "x": 298.5, "y": 56.921875 }, { "x": 291.5, "y": 103.25520324707031 }, { "x": 278.8333435058594, "y": 91.921875 }
  ];

  function drawColorMask() {
    outputCtx.beginPath();
    outputCtx.moveTo(colorMaskPoints[0].x, colorMaskPoints[0].y);
    for (var i = 1; i < colorMaskPoints.length; i++) {
      outputCtx.lineTo(colorMaskPoints[i].x, colorMaskPoints[i].y);
    }
    outputCtx.closePath();
    outputCtx.fillStyle = "rgba(255, 182, 193, 0.5)";
    outputCtx.fill();

    outputCtx.globalCompositeOperation = "destination-in";
    outputCtx.drawImage(baseImage, 0, 0, SHIRT_WIDTH, SHIRT_HEIGHT);
    outputCtx.globalCompositeOperation = "source-over";
  }

  var colorMask2Points = [{ "x": 217.5, "y": 78.58854675292969 }, { "x": 195.83334350585938, "y": 39.58854675292969 }, { "x": 192.1666717529297, "y": 8.921875 }, { "x": 183.83334350585938, "y": 22.255203247070312 }, { "x": 177.1666717529297, "y": 28.255203247070312 }, { "x": 176.5, "y": 49.921875 }, { "x": 188.83334350585938, "y": 104.25520324707031 }, { "x": 201.17, "y": 91.92 }]
  function drawColorMask2() {
    outputCtx.beginPath();
    outputCtx.moveTo(colorMask2Points[0].x, colorMask2Points[0].y);
    for (var i = 1; i < colorMask2Points.length; i++) {
      outputCtx.lineTo(colorMask2Points[i].x, colorMask2Points[i].y);
    }
    outputCtx.closePath();
    outputCtx.fillStyle = "rgba(255, 182, 193, 0.5)";
    outputCtx.fill();

    outputCtx.globalCompositeOperation = "destination-in";
    outputCtx.drawImage(baseImage, 0, 0, SHIRT_WIDTH, SHIRT_HEIGHT);
    outputCtx.globalCompositeOperation = "source-over";
  }

  var colorMask3Points = [{ "x": 363.8000030517578, "y": 105.52500343322754 }, { "x": 378.59999084472656, "y": 70.32499885559082 }, { "x": 405.8000030517578, "y": 84.72500038146973 }, { "x": 476.6000213623047, "y": 258.7249984741211 }, { "x": 480, "y": 349.125 }, { "x": 463.80003356933594, "y": 439.12501525878906 }, { "x": 403.40000915527344, "y": 430.3249969482422 }, { "x": 371.00001525878906, "y": 222.7250099182129 }];

  function drawColorMask3() {
    outputCtx.beginPath();
    outputCtx.moveTo(colorMask3Points[0].x, colorMask3Points[0].y);
    for (var i = 1; i < colorMask3Points.length; i++) {
      outputCtx.lineTo(colorMask3Points[i].x, colorMask3Points[i].y);
    }
    outputCtx.closePath();
    outputCtx.fillStyle = "rgba(255, 140, 0, 0.5)";
    outputCtx.fill();

    outputCtx.globalCompositeOperation = "destination-in";
    outputCtx.drawImage(baseImage, 0, 0, SHIRT_WIDTH, SHIRT_HEIGHT);
    outputCtx.globalCompositeOperation = "source-over";
  }

  var colorMask4Points = [{ "x": 118.60000610351562, "y": 106.32500648498535 }, { "x": 99.80000305175781, "y": 69.5250015258789 }, { "x": 78.60000610351562, "y": 91.92500305175781 }, { "x": 3.4, "y": 258.72 }, { "x": 5.400001525878906, "y": 349.52500915527344 }, { "x": 28.600006103515625, "y": 447.12501525878906 }, { "x": 90.60000610351562, "y": 430.7250061035156 }, { "x": 104.60000610351562, "y": 232.72500038146973 }]

  function drawColorMask4() {
    outputCtx.beginPath();
    outputCtx.moveTo(colorMask4Points[0].x, colorMask4Points[0].y);
    for (var i = 1; i < colorMask4Points.length; i++) {
      outputCtx.lineTo(colorMask4Points[i].x, colorMask4Points[i].y);
    }
    outputCtx.closePath();
    outputCtx.fillStyle = "rgba(255, 140, 0, 0.5)";
    outputCtx.fill();

    outputCtx.globalCompositeOperation = "destination-in";
    outputCtx.drawImage(baseImage, 0, 0, SHIRT_WIDTH, SHIRT_HEIGHT);
    outputCtx.globalCompositeOperation = "source-over";
  }

  function renderAll() {
    if (currentTextureImg) {
      compositeTexture(currentTextureImg);
    } else {
      drawShirtBase();
    }
    drawOverlay();
    drawColorMask();
    drawColorMask2();
    drawColorMask3();
    drawColorMask4();
    downloadBtn.disabled = !(currentTextureImg || overlayImg);
    updateDebugLog();
  }

  function resetFileInput() {
    textureInput.value = "";
  }

  function resetOverlayInput() {
    overlayInput.value = "";
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
        currentTextureImg = img;
        renderAll();
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

  function cacheOverlaySourceData(img) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var offCanvas = document.createElement("canvas");
    offCanvas.width = w;
    offCanvas.height = h;
    var offCtx = offCanvas.getContext("2d");
    offCtx.drawImage(img, 0, 0, w, h);
    overlaySourceData = offCtx.getImageData(0, 0, w, h);
  }

  function handleOverlayFileChange(event) {
    var files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    var file = files[0];
    if (!file.type || file.type.indexOf("image/") !== 0) {
      showError("Please choose an image file (PNG, JPG, WEBP, etc.) for the overlay.");
      resetOverlayInput();
      return;
    }

    if (currentOverlayObjectUrl) {
      URL.revokeObjectURL(currentOverlayObjectUrl);
      currentOverlayObjectUrl = null;
    }

    var objectUrl = URL.createObjectURL(file);
    currentOverlayObjectUrl = objectUrl;

    var img = new Image();
    img.onload = function () {
      try {
        clearError();
        overlayImg = img;
        cacheOverlaySourceData(img);
        renderAll();
      } catch (err) {
        showError("Could not apply that overlay image: " + err.message);
      }
    };
    img.onerror = function () {
      showError("That file could not be read as an image.");
      resetOverlayInput();
    };
    img.src = objectUrl;
  }

  function handlePatternConfigChange() {
    patternConfig.rotationDeg = Number(rotationInput.value);
    patternConfig.repeatCount = Number(repeatCountInput.value);
    rotationValueEl.textContent = patternConfig.rotationDeg + "°";
    repeatCountValueEl.textContent = patternConfig.repeatCount + "×";

    if (currentTextureImg) {
      try {
        clearError();
        renderAll();
      } catch (err) {
        showError("Could not apply that texture: " + err.message);
      }
    }
  }

  function positionHandles() {
    for (var i = 0; i < cornerHandleEls.length; i++) {
      var pt = quadPoints[i];
      cornerHandleEls[i].style.left = (pt.x / SHIRT_WIDTH) * 100 + "%";
      cornerHandleEls[i].style.top = (pt.y / SHIRT_HEIGHT) * 100 + "%";
    }
  }

  function updateCornerReadout() {
    var parts = [];
    for (var i = 0; i < quadPoints.length; i++) {
      parts.push(
        "(" + Math.round(quadPoints[i].x) + "," + Math.round(quadPoints[i].y) + ")"
      );
    }
    cornerReadoutEl.textContent = "Corners: " + parts.join(" ");
  }

  function positionMaskHandles() {
    for (var i = 0; i < maskHandleEls.length; i++) {
      var pt = colorMaskPoints[i];
      maskHandleEls[i].style.left = (pt.x / SHIRT_WIDTH) * 100 + "%";
      maskHandleEls[i].style.top = (pt.y / SHIRT_HEIGHT) * 100 + "%";
    }
  }

  function updateMaskReadout() {
    var parts = [];
    for (var i = 0; i < colorMaskPoints.length; i++) {
      parts.push(
        "(" + Math.round(colorMaskPoints[i].x) + "," + Math.round(colorMaskPoints[i].y) + ")"
      );
    }
    maskReadoutEl.textContent = "Mask: " + parts.join(" ");
  }

  function positionMask2Handles() {
    for (var i = 0; i < mask2HandleEls.length; i++) {
      var pt = colorMask2Points[i];
      mask2HandleEls[i].style.left = (pt.x / SHIRT_WIDTH) * 100 + "%";
      mask2HandleEls[i].style.top = (pt.y / SHIRT_HEIGHT) * 100 + "%";
    }
  }

  function updateMask2Readout() {
    var parts = [];
    for (var i = 0; i < colorMask2Points.length; i++) {
      parts.push(
        "(" + Math.round(colorMask2Points[i].x) + "," + Math.round(colorMask2Points[i].y) + ")"
      );
    }
    mask2ReadoutEl.textContent = "Mask 2: " + parts.join(" ");
  }

  function positionMask3Handles() {
    for (var i = 0; i < mask3HandleEls.length; i++) {
      var pt = colorMask3Points[i];
      mask3HandleEls[i].style.left = (pt.x / SHIRT_WIDTH) * 100 + "%";
      mask3HandleEls[i].style.top = (pt.y / SHIRT_HEIGHT) * 100 + "%";
    }
  }

  function updateMask3Readout() {
    var parts = [];
    for (var i = 0; i < colorMask3Points.length; i++) {
      parts.push(
        "(" + Math.round(colorMask3Points[i].x) + "," + Math.round(colorMask3Points[i].y) + ")"
      );
    }
    mask3ReadoutEl.textContent = "Mask 3 (" + colorMask3Points.length + " pts): " + parts.join(" ");
  }

  function handleMask3HandlePointerDown(event) {
    var handleEl = event.currentTarget;
    var index = Number(handleEl.getAttribute("data-mask3-index"));
    handleEl.setPointerCapture(event.pointerId);

    function onMove(moveEvent) {
      colorMask3Points[index] = clientToCanvasPoint(moveEvent.clientX, moveEvent.clientY);
      positionMask3Handles();
      updateMask3Readout();
      try {
        renderAll();
      } catch (err) {
        showError("Could not render the mask: " + err.message);
      }
    }

    function onUp(upEvent) {
      handleEl.releasePointerCapture(upEvent.pointerId);
      handleEl.removeEventListener("pointermove", onMove);
      handleEl.removeEventListener("pointerup", onUp);
      handleEl.removeEventListener("pointercancel", onUp);
    }

    handleEl.addEventListener("pointermove", onMove);
    handleEl.addEventListener("pointerup", onUp);
    handleEl.addEventListener("pointercancel", onUp);
    event.preventDefault();
  }

  function rebuildMask3Handles() {
    for (var i = 0; i < mask3HandleEls.length; i++) {
      mask3HandleEls[i].parentNode.removeChild(mask3HandleEls[i]);
    }
    mask3HandleEls = [];

    for (var j = 0; j < colorMask3Points.length; j++) {
      var handleEl = document.createElement("div");
      handleEl.className = "mask3-handle";
      handleEl.setAttribute("data-mask3-index", String(j));
      handleEl.addEventListener("pointerdown", handleMask3HandlePointerDown);
      canvasWrapEl.appendChild(handleEl);
      mask3HandleEls.push(handleEl);
    }

    positionMask3Handles();
  }

  function subdivideMask3Points() {
    var newPoints = [];
    var n = colorMask3Points.length;
    for (var i = 0; i < n; i++) {
      var current = colorMask3Points[i];
      var next = colorMask3Points[(i + 1) % n];
      newPoints.push(current);
      newPoints.push({
        x: (current.x + next.x) / 2,
        y: (current.y + next.y) / 2
      });
    }
    colorMask3Points = newPoints;

    rebuildMask3Handles();
    updateMask3Readout();
    try {
      renderAll();
    } catch (err) {
      showError("Could not render the mask: " + err.message);
    }
  }

  function positionMask4Handles() {
    for (var i = 0; i < mask4HandleEls.length; i++) {
      var pt = colorMask4Points[i];
      mask4HandleEls[i].style.left = (pt.x / SHIRT_WIDTH) * 100 + "%";
      mask4HandleEls[i].style.top = (pt.y / SHIRT_HEIGHT) * 100 + "%";
    }
  }

  function updateMask4Readout() {
    var parts = [];
    for (var i = 0; i < colorMask4Points.length; i++) {
      parts.push(
        "(" + Math.round(colorMask4Points[i].x) + "," + Math.round(colorMask4Points[i].y) + ")"
      );
    }
    mask4ReadoutEl.textContent = "Mask 4 (" + colorMask4Points.length + " pts): " + parts.join(" ");
  }

  function handleMask4HandlePointerDown(event) {
    var handleEl = event.currentTarget;
    var index = Number(handleEl.getAttribute("data-mask4-index"));
    handleEl.setPointerCapture(event.pointerId);

    function onMove(moveEvent) {
      colorMask4Points[index] = clientToCanvasPoint(moveEvent.clientX, moveEvent.clientY);
      positionMask4Handles();
      updateMask4Readout();
      try {
        renderAll();
      } catch (err) {
        showError("Could not render the mask: " + err.message);
      }
    }

    function onUp(upEvent) {
      handleEl.releasePointerCapture(upEvent.pointerId);
      handleEl.removeEventListener("pointermove", onMove);
      handleEl.removeEventListener("pointerup", onUp);
      handleEl.removeEventListener("pointercancel", onUp);
    }

    handleEl.addEventListener("pointermove", onMove);
    handleEl.addEventListener("pointerup", onUp);
    handleEl.addEventListener("pointercancel", onUp);
    event.preventDefault();
  }

  function rebuildMask4Handles() {
    for (var i = 0; i < mask4HandleEls.length; i++) {
      mask4HandleEls[i].parentNode.removeChild(mask4HandleEls[i]);
    }
    mask4HandleEls = [];

    for (var j = 0; j < colorMask4Points.length; j++) {
      var handleEl = document.createElement("div");
      handleEl.className = "mask4-handle";
      handleEl.setAttribute("data-mask4-index", String(j));
      handleEl.addEventListener("pointerdown", handleMask4HandlePointerDown);
      canvasWrapEl.appendChild(handleEl);
      mask4HandleEls.push(handleEl);
    }

    positionMask4Handles();
  }

  function subdivideMask4Points() {
    var newPoints = [];
    var n = colorMask4Points.length;
    for (var i = 0; i < n; i++) {
      var current = colorMask4Points[i];
      var next = colorMask4Points[(i + 1) % n];
      newPoints.push(current);
      newPoints.push({
        x: (current.x + next.x) / 2,
        y: (current.y + next.y) / 2
      });
    }
    colorMask4Points = newPoints;

    rebuildMask4Handles();
    updateMask4Readout();
    try {
      renderAll();
    } catch (err) {
      showError("Could not render the mask: " + err.message);
    }
  }

  function updateDebugLog() {
    if (!debugLogEl) {
      return;
    }
    var lines = [];
    lines.push("time: " + new Date().toISOString());
    lines.push("canvas: " + SHIRT_WIDTH + "x" + SHIRT_HEIGHT);
    lines.push("quadPoints: " + JSON.stringify(quadPoints));
    lines.push("colorMaskPoints: " + JSON.stringify(colorMaskPoints));
    lines.push("colorMask2Points: " + JSON.stringify(colorMask2Points));
    lines.push("colorMask3Points: " + JSON.stringify(colorMask3Points));
    lines.push("colorMask4Points: " + JSON.stringify(colorMask4Points));
    lines.push("patternConfig: " + JSON.stringify(patternConfig));
    lines.push("hasTexture: " + !!currentTextureImg + ", hasOverlay: " + !!overlayImg);
    debugLogEl.textContent = lines.join("\n");
  }

  function clientToCanvasPoint(clientX, clientY) {
    var rect = outputCanvas.getBoundingClientRect();
    var x = (clientX - rect.left) * (SHIRT_WIDTH / rect.width);
    var y = (clientY - rect.top) * (SHIRT_HEIGHT / rect.height);
    return {
      x: Math.max(0, Math.min(SHIRT_WIDTH, x)),
      y: Math.max(0, Math.min(SHIRT_HEIGHT, y))
    };
  }

  function handleHandlePointerDown(event) {
    var handleEl = event.currentTarget;
    var index = Number(handleEl.getAttribute("data-index"));
    handleEl.setPointerCapture(event.pointerId);

    function onMove(moveEvent) {
      quadPoints[index] = clientToCanvasPoint(moveEvent.clientX, moveEvent.clientY);
      positionHandles();
      updateCornerReadout();
      try {
        renderAll();
      } catch (err) {
        showError("Could not render the overlay: " + err.message);
      }
    }

    function onUp(upEvent) {
      handleEl.releasePointerCapture(upEvent.pointerId);
      handleEl.removeEventListener("pointermove", onMove);
      handleEl.removeEventListener("pointerup", onUp);
      handleEl.removeEventListener("pointercancel", onUp);
    }

    handleEl.addEventListener("pointermove", onMove);
    handleEl.addEventListener("pointerup", onUp);
    handleEl.addEventListener("pointercancel", onUp);
    event.preventDefault();
  }

  function handleMaskHandlePointerDown(event) {
    var handleEl = event.currentTarget;
    var index = Number(handleEl.getAttribute("data-mask-index"));
    handleEl.setPointerCapture(event.pointerId);

    function onMove(moveEvent) {
      colorMaskPoints[index] = clientToCanvasPoint(moveEvent.clientX, moveEvent.clientY);
      positionMaskHandles();
      updateMaskReadout();
      try {
        renderAll();
      } catch (err) {
        showError("Could not render the mask: " + err.message);
      }
    }

    function onUp(upEvent) {
      handleEl.releasePointerCapture(upEvent.pointerId);
      handleEl.removeEventListener("pointermove", onMove);
      handleEl.removeEventListener("pointerup", onUp);
      handleEl.removeEventListener("pointercancel", onUp);
    }

    handleEl.addEventListener("pointermove", onMove);
    handleEl.addEventListener("pointerup", onUp);
    handleEl.addEventListener("pointercancel", onUp);
    event.preventDefault();
  }

  function handleMask2HandlePointerDown(event) {
    var handleEl = event.currentTarget;
    var index = Number(handleEl.getAttribute("data-mask2-index"));
    handleEl.setPointerCapture(event.pointerId);

    function onMove(moveEvent) {
      colorMask2Points[index] = clientToCanvasPoint(moveEvent.clientX, moveEvent.clientY);
      positionMask2Handles();
      updateMask2Readout();
      try {
        renderAll();
      } catch (err) {
        showError("Could not render the mask: " + err.message);
      }
    }

    function onUp(upEvent) {
      handleEl.releasePointerCapture(upEvent.pointerId);
      handleEl.removeEventListener("pointermove", onMove);
      handleEl.removeEventListener("pointerup", onUp);
      handleEl.removeEventListener("pointercancel", onUp);
    }

    handleEl.addEventListener("pointermove", onMove);
    handleEl.addEventListener("pointerup", onUp);
    handleEl.addEventListener("pointercancel", onUp);
    event.preventDefault();
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
    rotationInput = document.getElementById("rotation-input");
    rotationValueEl = document.getElementById("rotation-value");
    repeatCountInput = document.getElementById("repeat-count-input");
    repeatCountValueEl = document.getElementById("repeat-count-value");
    overlayInput = document.getElementById("overlay-input");
    cornerReadoutEl = document.getElementById("corner-readout");
    cornerHandleEls = Array.prototype.slice.call(
      document.querySelectorAll(".corner-handle")
    );
    maskReadoutEl = document.getElementById("mask-readout");
    maskHandleEls = Array.prototype.slice.call(
      document.querySelectorAll(".mask-handle")
    );
    mask2ReadoutEl = document.getElementById("mask2-readout");
    mask2HandleEls = Array.prototype.slice.call(
      document.querySelectorAll(".mask2-handle")
    );
    mask3ReadoutEl = document.getElementById("mask3-readout");
    mask3DoubleBtn = document.getElementById("mask3-double-btn");
    mask4ReadoutEl = document.getElementById("mask4-readout");
    mask4DoubleBtn = document.getElementById("mask4-double-btn");
    canvasWrapEl = document.querySelector(".canvas-wrap");
    debugLogEl = document.getElementById("debug-log");
    errorMessageEl = document.getElementById("error-message");
    downloadBtn = document.getElementById("download-btn");
    outputCanvas = document.getElementById("preview-canvas");
    outputCtx = outputCanvas.getContext("2d");

    textureInput.addEventListener("change", handleFileChange);
    rotationInput.addEventListener("input", handlePatternConfigChange);
    repeatCountInput.addEventListener("input", handlePatternConfigChange);
    overlayInput.addEventListener("change", handleOverlayFileChange);
    cornerHandleEls.forEach(function (el) {
      el.addEventListener("pointerdown", handleHandlePointerDown);
    });
    maskHandleEls.forEach(function (el) {
      el.addEventListener("pointerdown", handleMaskHandlePointerDown);
    });
    mask2HandleEls.forEach(function (el) {
      el.addEventListener("pointerdown", handleMask2HandlePointerDown);
    });
    mask3DoubleBtn.addEventListener("click", subdivideMask3Points);
    mask4DoubleBtn.addEventListener("click", subdivideMask4Points);
    downloadBtn.addEventListener("click", handleDownload);

    positionHandles();
    updateCornerReadout();
    positionMaskHandles();
    updateMaskReadout();
    positionMask2Handles();
    updateMask2Readout();
    rebuildMask3Handles();
    updateMask3Readout();
    rebuildMask4Handles();
    updateMask4Readout();

    loadBaseImageAndBuildLightingMap().catch(function (err) {
      showError(err.message);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
