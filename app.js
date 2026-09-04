(function () {
  "use strict";

  var BASE_IMAGE_PATH = "assert/plain_white.png";
  var SHIRT_WIDTH = 480;
  var SHIRT_HEIGHT = 520;

  var baseImage = null;
  var lightingCanvas = null;
  var lightingCtx = null;
  var outputCanvas = null;
  var outputCtx = null;

  var overlayImg = null;
  var overlaySourceData = null;
  var currentOverlayObjectUrl = null;
  var quadPoints = [
    { x: 160, y: 160 },
    { x: 320, y: 160 },
    { x: 320, y: 340 },
    { x: 160, y: 340 }
  ];

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
  var mask5ReadoutEl = null;
  var mask5HandleEls = null;
  var mask6ReadoutEl = null;
  var mask6HandleEls = null;
  var canvasWrapEl = null;
  var debugLogEl = null;
  var errorMessageEl = null;
  var downloadBtn = null;
  var toggleDebugBtn = null;

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

  function paintTexturedRegion(region) {
    var textureImg = region.textureImg;
    var naturalW = textureImg.naturalWidth || textureImg.width;
    var naturalH = textureImg.naturalHeight || textureImg.height;
    var tileTargetDim = SHIRT_WIDTH / region.repeatCount;
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
    pattern.setTransform(new DOMMatrix().rotate(region.rotationDeg));

    outputCtx.save();

    var points = region.getPoints();
    if (points) {
      outputCtx.beginPath();
      outputCtx.moveTo(points[0].x, points[0].y);
      for (var i = 1; i < points.length; i++) {
        outputCtx.lineTo(points[i].x, points[i].y);
      }
      outputCtx.closePath();
      outputCtx.clip();
    }

    outputCtx.globalCompositeOperation = "source-over";
    outputCtx.clearRect(0, 0, SHIRT_WIDTH, SHIRT_HEIGHT);
    outputCtx.fillStyle = pattern;
    outputCtx.fillRect(0, 0, SHIRT_WIDTH, SHIRT_HEIGHT);

    outputCtx.globalCompositeOperation = "multiply";
    outputCtx.drawImage(lightingCanvas, 0, 0);

    outputCtx.globalCompositeOperation = "destination-in";
    outputCtx.drawImage(baseImage, 0, 0, SHIRT_WIDTH, SHIRT_HEIGHT);

    outputCtx.restore();
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

  var colorMask2Points = [{ "x": 217.5, "y": 78.58854675292969 }, { "x": 195.83334350585938, "y": 39.58854675292969 }, { "x": 192.1666717529297, "y": 8.921875 }, { "x": 183.83334350585938, "y": 22.255203247070312 }, { "x": 177.1666717529297, "y": 28.255203247070312 }, { "x": 176.5, "y": 49.921875 }, { "x": 188.83334350585938, "y": 104.25520324707031 }, { "x": 201.17, "y": 91.92 }]

  var colorMask3Points = [{ "x": 362.57141859872064, "y": 129.6428623199463 }, { "x": 367.5, "y": 96.72500228881836 }, { "x": 371.1999969482422, "y": 87.92500114440918 }, { "x": 374.8999938964844, "y": 79.125 }, { "x": 378.59999084472656, "y": 70.32499885559082 }, { "x": 383.1999969482422, "y": 75.3250002861023 }, { "x": 387.8000030517578, "y": 80.32500171661377 }, { "x": 392.40000915527344, "y": 85.32500314712524 }, { "x": 397.00001525878906, "y": 90.32500457763672 }, { "x": 415.8000183105469, "y": 122.32500076293945 }, { "x": 434.6000213623047, "y": 154.3249969482422 }, { "x": 448.2000274658203, "y": 187.125 }, { "x": 461.80003356933594, "y": 219.9250030517578 }, { "x": 466.2000274658203, "y": 239.72500228881836 }, { "x": 472.857117153351, "y": 259.92859268188477 }, { "x": 475.00001525878906, "y": 279.32500076293945 }, { "x": 479.40000915527344, "y": 299.125 }, { "x": 478.6000213623047, "y": 333.125 }, { "x": 477.80003356933594, "y": 367.125 }, { "x": 469.00001525878906, "y": 403.7250061035156 }, { "x": 460.1999969482422, "y": 440.32501220703125 }, { "x": 446, "y": 437.825008392334 }, { "x": 402.0000049591061, "y": 433.0714454650879 }, { "x": 403.714299283708, "y": 398.78573989868164 }, { "x": 402.0000049591061, "y": 375.35715103149414 }, { "x": 402.5714160555893, "y": 323.35715103149414 }, { "x": 408.8571212223612, "y": 309.0714454650879 }, { "x": 400.28571063450426, "y": 292.50000381469727 }, { "x": 397.4285941169361, "y": 274.214298248291 }, { "x": 390.5714168185287, "y": 265.0714454650879 }, { "x": 369.8000030517578, "y": 222.32500457763672 }, { "x": 367.1999969482422, "y": 163.5250062942505 }];

  var colorMask4Points = [{ "x": 118.60000610351562, "y": 106.32500648498535 }, { "x": 113.90000534057617, "y": 97.12500524520874 }, { "x": 109.20000457763672, "y": 87.92500400543213 }, { "x": 104.50000381469727, "y": 78.72500276565552 }, { "x": 99.80000305175781, "y": 69.5250015258789 }, { "x": 94.50000381469727, "y": 75.12500190734863 }, { "x": 89.20000457763672, "y": 80.72500228881836 }, { "x": 83.90000534057617, "y": 86.32500267028809 }, { "x": 78.60000610351562, "y": 91.92500305175781 }, { "x": 53.99999656677268, "y": 137.07143592834473 }, { "x": 36.28573377699955, "y": 171.9285831451416 }, { "x": 17.42858775910773, "y": 218.21428871154785 }, { "x": 6.571441232589643, "y": 253.07143592834473 }, { "x": 3.9000003814697264, "y": 281.4212522888184 }, { "x": 4.400000762939453, "y": 304.12250457763673 }, { "x": 4.900001144409179, "y": 326.8237568664551 }, { "x": 5.400001525878906, "y": 349.52500915527344 }, { "x": 8.285735557191495, "y": 374.21429443359375 }, { "x": 14.571440723963374, "y": 397.64288330078125 }, { "x": 22.800004959106445, "y": 422.72501373291016 }, { "x": 32.857145127795846, "y": 450.7857303619385 }, { "x": 60.8571433476039, "y": 441.64287757873535 }, { "x": 88.85714156741196, "y": 433.0714359283447 }, { "x": 84.28573072524193, "y": 382.21429443359375 }, { "x": 80.28573097955507, "y": 341.0714359283447 }, { "x": 80.85714207603823, "y": 319.357141494751 }, { "x": 75.71428961980885, "y": 303.357141494751 }, { "x": 89.4285831814713, "y": 285.64287757873535 }, { "x": 89.99999427795446, "y": 270.21428871154785 }, { "x": 104.85714055015941, "y": 234.78573036193848 }, { "x": 111.60000610351562, "y": 169.52500343322754 }, { "x": 117.99999249776252, "y": 131.35714149475098 }];

  var colorMask5Points = [{ "x": 402.12904650443846, "y": 433.51846718304114 }, { "x": 421.1229960694254, "y": 433.51846718304114 }, { "x": 459.9249216093274, "y": 440.57333876885446 }, { "x": 453.68405246654595, "y": 481.2745209947003 }, { "x": 447.4431833237645, "y": 481.2745209947003 }, { "x": 444.1870776840525, "y": 476.93306155727674 }, { "x": 420.5803117961401, "y": 476.6617203424378 }, { "x": 399.41562513801176, "y": 473.1342845495312 }];

  var colorMask6Points = [{ "x": 89, "y": 432.7250061035156 }, { "x": 61, "y": 439.9250183105469 }, { "x": 31, "y": 450.32501220703125 }, { "x": 45, "y": 486.3249969482422 }, { "x": 52.19999694824219, "y": 481.5249938964844 }, { "x": 60.600006103515625, "y": 481.5249938964844 }, { "x": 83.80000305175781, "y": 476.3249969482422 }, { "x": 97, "y": 472.3249969482422 }];

  var regions = {
    main: {
      id: "main", label: "Main Body",
      textureImg: null, objectUrl: null, textureFileName: null,
      rotationDeg: 0, repeatCount: 3,
      getPoints: function () { return null; }
    },
    rCollar: {
      id: "rCollar", label: "R Collar",
      textureImg: null, objectUrl: null, textureFileName: null,
      rotationDeg: 0, repeatCount: 3,
      getPoints: function () { return colorMaskPoints; }
    },
    lCollar: {
      id: "lCollar", label: "L Collar",
      textureImg: null, objectUrl: null, textureFileName: null,
      rotationDeg: 0, repeatCount: 3,
      getPoints: function () { return colorMask2Points; }
    },
    rSleeve: {
      id: "rSleeve", label: "R Sleeve",
      textureImg: null, objectUrl: null, textureFileName: null,
      rotationDeg: 0, repeatCount: 3,
      getPoints: function () { return colorMask3Points; }
    },
    lSleeve: {
      id: "lSleeve", label: "L Sleeve",
      textureImg: null, objectUrl: null, textureFileName: null,
      rotationDeg: 0, repeatCount: 3,
      getPoints: function () { return colorMask4Points; }
    },
    rCuff: {
      id: "rCuff", label: "R Cuff",
      textureImg: null, objectUrl: null, textureFileName: null,
      rotationDeg: 0, repeatCount: 3,
      getPoints: function () { return colorMask5Points; }
    },
    lCuff: {
      id: "lCuff", label: "L Cuff",
      textureImg: null, objectUrl: null, textureFileName: null,
      rotationDeg: 0, repeatCount: 3,
      getPoints: function () { return colorMask6Points; }
    }
  };

  var REGION_IDS = ["main", "rCollar", "lCollar", "rSleeve", "lSleeve", "rCuff", "lCuff"];

  function anyRegionHasTexture() {
    return !!(
      regions.main.textureImg || regions.rCollar.textureImg ||
      regions.lCollar.textureImg || regions.rSleeve.textureImg ||
      regions.lSleeve.textureImg || regions.rCuff.textureImg ||
      regions.lCuff.textureImg
    );
  }

  function renderAll() {
    if (regions.main.textureImg) {
      paintTexturedRegion(regions.main);
    } else {
      drawShirtBase();
    }
    drawOverlay();
    if (regions.rCollar.textureImg) {
      paintTexturedRegion(regions.rCollar);
    }
    if (regions.lCollar.textureImg) {
      paintTexturedRegion(regions.lCollar);
    }
    if (regions.rSleeve.textureImg) {
      paintTexturedRegion(regions.rSleeve);
    }
    if (regions.lSleeve.textureImg) {
      paintTexturedRegion(regions.lSleeve);
    }
    if (regions.rCuff.textureImg) {
      paintTexturedRegion(regions.rCuff);
    }
    if (regions.lCuff.textureImg) {
      paintTexturedRegion(regions.lCuff);
    }
    downloadBtn.disabled = !(anyRegionHasTexture() || overlayImg);
    updateDebugLog();
  }

  function resetOverlayInput() {
    overlayInput.value = "";
  }

  function handleFileChange(event, region) {
    var files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    var file = files[0];
    if (!file.type || file.type.indexOf("image/") !== 0) {
      showError("Please choose an image file (PNG, JPG, WEBP, etc.).");
      region.textureInputEl.value = "";
      return;
    }

    if (region.objectUrl) {
      URL.revokeObjectURL(region.objectUrl);
      region.objectUrl = null;
    }

    var objectUrl = URL.createObjectURL(file);
    region.objectUrl = objectUrl;

    var img = new Image();
    img.onload = function () {
      try {
        clearError();
        region.textureImg = img;
        region.textureFileName = file.name;
        region.previewEl.src = objectUrl;
        region.previewEl.hidden = false;
        updateRegionControlsUI(region);
        renderAll();
      } catch (err) {
        showError("Could not apply that texture: " + err.message);
      }
    };
    img.onerror = function () {
      showError("That file could not be read as an image.");
      region.textureInputEl.value = "";
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

  function handlePatternConfigChange(region) {
    region.rotationDeg = Number(region.rotationInputEl.value);
    region.repeatCount = Number(region.repeatCountInputEl.value);
    region.rotationValueEl.textContent = region.rotationDeg + "°";
    region.repeatCountValueEl.textContent = region.repeatCount + "×";

    if (region.textureImg) {
      try {
        clearError();
        renderAll();
      } catch (err) {
        showError("Could not apply that texture: " + err.message);
      }
    }
  }

  function updateRegionControlsUI(region) {
    region.rotationInputEl.value = String(region.rotationDeg);
    region.rotationValueEl.textContent = region.rotationDeg + "°";
    region.repeatCountInputEl.value = String(region.repeatCount);
    region.repeatCountValueEl.textContent = region.repeatCount + "×";
    region.statusEl.textContent = "Texture: " + (region.textureFileName || "none");
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

  function positionMask5Handles() {
    for (var i = 0; i < mask5HandleEls.length; i++) {
      var pt = colorMask5Points[i];
      mask5HandleEls[i].style.left = (pt.x / SHIRT_WIDTH) * 100 + "%";
      mask5HandleEls[i].style.top = (pt.y / SHIRT_HEIGHT) * 100 + "%";
    }
  }

  function updateMask5Readout() {
    var parts = [];
    for (var i = 0; i < colorMask5Points.length; i++) {
      parts.push(
        "(" + Math.round(colorMask5Points[i].x) + "," + Math.round(colorMask5Points[i].y) + ")"
      );
    }
    mask5ReadoutEl.textContent = "Mask 5: " + parts.join(" ");
  }

  function handleMask5HandlePointerDown(event) {
    var handleEl = event.currentTarget;
    var index = Number(handleEl.getAttribute("data-mask5-index"));
    handleEl.setPointerCapture(event.pointerId);

    function onMove(moveEvent) {
      colorMask5Points[index] = clientToCanvasPoint(moveEvent.clientX, moveEvent.clientY);
      positionMask5Handles();
      updateMask5Readout();
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

  function positionMask6Handles() {
    for (var i = 0; i < mask6HandleEls.length; i++) {
      var pt = colorMask6Points[i];
      mask6HandleEls[i].style.left = (pt.x / SHIRT_WIDTH) * 100 + "%";
      mask6HandleEls[i].style.top = (pt.y / SHIRT_HEIGHT) * 100 + "%";
    }
  }

  function updateMask6Readout() {
    var parts = [];
    for (var i = 0; i < colorMask6Points.length; i++) {
      parts.push(
        "(" + Math.round(colorMask6Points[i].x) + "," + Math.round(colorMask6Points[i].y) + ")"
      );
    }
    mask6ReadoutEl.textContent = "Mask 6: " + parts.join(" ");
  }

  function handleMask6HandlePointerDown(event) {
    var handleEl = event.currentTarget;
    var index = Number(handleEl.getAttribute("data-mask6-index"));
    handleEl.setPointerCapture(event.pointerId);

    function onMove(moveEvent) {
      colorMask6Points[index] = clientToCanvasPoint(moveEvent.clientX, moveEvent.clientY);
      positionMask6Handles();
      updateMask6Readout();
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
    lines.push("colorMask5Points: " + JSON.stringify(colorMask5Points));
    lines.push("colorMask6Points: " + JSON.stringify(colorMask6Points));
    REGION_IDS.forEach(function (id) {
      var r = regions[id];
      lines.push(
        r.label + ": rotationDeg=" + r.rotationDeg + " repeatCount=" + r.repeatCount +
        " hasTexture=" + !!r.textureImg + " file=" + (r.textureFileName || "none")
      );
    });
    lines.push("hasOverlay: " + !!overlayImg);
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

  function handleToggleDebugClick() {
    var hidden = document.body.classList.toggle("debug-hidden");
    toggleDebugBtn.textContent = hidden ? "Show Debug Tools" : "Hide Debug Tools";
  }

  function init() {
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
    mask5ReadoutEl = document.getElementById("mask5-readout");
    mask5HandleEls = Array.prototype.slice.call(
      document.querySelectorAll(".mask5-handle")
    );
    mask6ReadoutEl = document.getElementById("mask6-readout");
    mask6HandleEls = Array.prototype.slice.call(
      document.querySelectorAll(".mask6-handle")
    );
    canvasWrapEl = document.querySelector(".canvas-wrap");
    debugLogEl = document.getElementById("debug-log");
    errorMessageEl = document.getElementById("error-message");
    downloadBtn = document.getElementById("download-btn");
    toggleDebugBtn = document.getElementById("toggle-debug-btn");
    outputCanvas = document.getElementById("preview-canvas");
    outputCtx = outputCanvas.getContext("2d");

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
    mask5HandleEls.forEach(function (el) {
      el.addEventListener("pointerdown", handleMask5HandlePointerDown);
    });
    mask6HandleEls.forEach(function (el) {
      el.addEventListener("pointerdown", handleMask6HandlePointerDown);
    });
    mask3DoubleBtn.addEventListener("click", subdivideMask3Points);
    mask4DoubleBtn.addEventListener("click", subdivideMask4Points);
    downloadBtn.addEventListener("click", handleDownload);
    toggleDebugBtn.addEventListener("click", handleToggleDebugClick);

    positionHandles();
    updateCornerReadout();
    positionMaskHandles();
    updateMaskReadout();
    positionMask2Handles();
    updateMask2Readout();
    positionMask5Handles();
    updateMask5Readout();
    positionMask6Handles();
    updateMask6Readout();
    rebuildMask3Handles();
    updateMask3Readout();
    rebuildMask4Handles();
    updateMask4Readout();

    REGION_IDS.forEach(function (id) {
      var region = regions[id];
      region.textureInputEl = document.getElementById("texture-input-" + id);
      region.rotationInputEl = document.getElementById("rotation-input-" + id);
      region.rotationValueEl = document.getElementById("rotation-value-" + id);
      region.repeatCountInputEl = document.getElementById("repeat-count-input-" + id);
      region.repeatCountValueEl = document.getElementById("repeat-count-value-" + id);
      region.statusEl = document.getElementById("region-status-" + id);
      region.previewEl = document.getElementById("texture-preview-" + id);

      region.textureInputEl.addEventListener("change", function (event) {
        handleFileChange(event, region);
      });
      region.rotationInputEl.addEventListener("input", function () {
        handlePatternConfigChange(region);
      });
      region.repeatCountInputEl.addEventListener("input", function () {
        handlePatternConfigChange(region);
      });

      updateRegionControlsUI(region);
    });

    loadBaseImageAndBuildLightingMap().catch(function (err) {
      showError(err.message);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
