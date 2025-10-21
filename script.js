const patternCanvas = document.getElementById("patternCanvas");
const drawingCanvas = document.getElementById("drawingCanvas");
const patternCtx = patternCanvas.getContext("2d");
const ctx = drawingCanvas.getContext("2d", {
    willReadFrequently: true,
});
const canvasWrapper = document.getElementById("canvasWrapper");
const mainContainer = document.getElementById("mainContainer");

let canvasWidth = 1200;
let canvasHeight = 800;
let isDrawing = false;
let currentColor = "#000000";
let currentTool = "pen";
let history = [];
let historyStep = -1;
let zoom = 1;
let rotation = 0;
let translateX = 0;
let translateY = 0;
let penOnly = false;
let pattern = "none";
let startX, startY;
let shapePreview = null;
let points = [];
let lastPoint = null;
let lastTime = Date.now();
let brushStyle = "solid";
let isTransformMode = false;
let isDraggingColor = false;

let lastTouchDistance = 0;
let lastTouchAngle = 0;

const brushPresets = {
    pen: { size: 3, opacity: 100, stabilization: 5 },
    marker: { size: 30, opacity: 40, stabilization: 2 },
    calligraphy: { size: 20, opacity: 100, stabilization: 3 },
    eraser: { size: 20, opacity: 100, stabilization: 0 },
};

function initCanvas() {
    patternCanvas.width = canvasWidth;
    patternCanvas.height = canvasHeight;
    drawingCanvas.width = canvasWidth;
    drawingCanvas.height = canvasHeight;

    updateCanvasTransform();
    drawPattern();
    saveHistory();
}

function updateCanvasTransform() {
    canvasWrapper.style.transform = `translate(-50%, -50%) translate(${translateX}px, ${translateY}px) scale(${zoom}) rotate(${rotation}deg)`;
}

function drawPattern() {
    const w = patternCanvas.width;
    const h = patternCanvas.height;

    patternCtx.fillStyle = "#ffffff";
    patternCtx.fillRect(0, 0, w, h);

    if (pattern === "none") return;

    patternCtx.strokeStyle = "#cccccc";
    patternCtx.lineWidth = 1;
    patternCtx.fillStyle = "#cccccc";

    if (pattern === "grid") {
        const spacing = 30;
        patternCtx.beginPath();
        for (let x = 0; x <= w; x += spacing) {
            patternCtx.moveTo(x + 0.5, 0);
            patternCtx.lineTo(x + 0.5, h);
        }
        for (let y = 0; y <= h; y += spacing) {
            patternCtx.moveTo(0, y + 0.5);
            patternCtx.lineTo(w, y + 0.5);
        }
        patternCtx.stroke();
    } else if (pattern === "lines") {
        const spacing = 35;
        patternCtx.beginPath();
        for (let y = 0; y <= h; y += spacing) {
            patternCtx.moveTo(0, y + 0.5);
            patternCtx.lineTo(w, y + 0.5);
        }
        patternCtx.stroke();
    } else if (pattern === "dots") {
        const spacing = 25;
        for (let x = 0; x <= w; x += spacing) {
            for (let y = 0; y <= h; y += spacing) {
                patternCtx.beginPath();
                patternCtx.arc(x, y, 1.5, 0, Math.PI * 2);
                patternCtx.fill();
            }
        }
    }
}

function saveHistory() {
    historyStep++;
    history = history.slice(0, historyStep);
    history.push(drawingCanvas.toDataURL());
    if (history.length > 50) {
        history.shift();
        historyStep--;
    }
}

function redrawCanvas() {
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    if (historyStep >= 0 && history[historyStep]) {
        const img = new Image();
        img.src = history[historyStep];
        img.onload = () => ctx.drawImage(img, 0, 0);
    }
}

function getPointerCoords(e) {
    const rect = drawingCanvas.getBoundingClientRect();
    const scaleX = drawingCanvas.width / rect.width;
    const scaleY = drawingCanvas.height / rect.height;
    const clientX = e.clientX || e.touches?.[0]?.clientX || 0;
    const clientY = e.clientY || e.touches?.[0]?.clientY || 0;
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
        clientX,
        clientY,
    };
}

function getStabilizedPoint(x, y, stabilization) {
    points.push({ x, y });
    const maxPoints = Math.max(1, stabilization + 1);
    if (points.length > maxPoints) points.shift();
    if (stabilization === 0 || points.length === 1) return { x, y };
    let avgX = 0,
        avgY = 0;
    for (let p of points) {
        avgX += p.x;
        avgY += p.y;
    }
    return { x: avgX / points.length, y: avgY / points.length };
}

function startDrawing(e) {
    if (penOnly && e.pointerType && e.pointerType !== "pen") return;
    if (isTransformMode) return;

    isDrawing = true;
    const { x, y } = getPointerCoords(e);
    startX = x;
    startY = y;
    points = [];
    lastPoint = { x, y };
    lastTime = Date.now();

    if (
        currentTool === "pen" ||
        currentTool === "marker" ||
        currentTool === "calligraphy" ||
        currentTool === "eraser"
    ) {
        ctx.beginPath();
        ctx.moveTo(x, y);
    } else if (
        currentTool === "line" ||
        currentTool === "rect" ||
        currentTool === "circle"
    ) {
        shapePreview = ctx.getImageData(
            0,
            0,
            drawingCanvas.width,
            drawingCanvas.height,
        );
    }
}

function draw(e) {
    if (!isDrawing) return;

    const { x, y } = getPointerCoords(e);
    const size = parseInt(
        document.getElementById("brushSize").value,
    );
    const opacity =
        parseInt(document.getElementById("brushOpacity").value) /
        100;
    const stabilization = parseInt(
        document.getElementById("brushStabilization").value,
    );

    if (currentTool === "eraser") {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineWidth = size;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = 1;
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.restore();
    } else if (currentTool === "calligraphy") {
        const currentTime = Date.now();
        const timeDelta = Math.max(currentTime - lastTime, 1);
        const distance = Math.sqrt(
            Math.pow(x - lastPoint.x, 2) +
                Math.pow(y - lastPoint.y, 2),
        );
        const speed = distance / timeDelta;
        const minWidth = size * 0.3;
        const maxWidth = size * 1.3;
        const speedFactor = Math.min(speed * 150, 1);
        const lineWidth =
            maxWidth - speedFactor * (maxWidth - minWidth);

        ctx.lineWidth = Math.max(minWidth, lineWidth);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = currentColor;
        ctx.globalAlpha = opacity;
        ctx.globalCompositeOperation = "source-over";
        brushStyle === "dashed"
            ? ctx.setLineDash([10, 10])
            : ctx.setLineDash([]);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
        lastPoint = { x, y };
        lastTime = currentTime;
    } else if (currentTool === "pen" || currentTool === "marker") {
        const stabilized = getStabilizedPoint(x, y, stabilization);
        ctx.lineWidth = size;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = currentColor;
        ctx.globalAlpha = opacity;
        ctx.globalCompositeOperation = "source-over";
        brushStyle === "dashed"
            ? ctx.setLineDash([10, 10])
            : ctx.setLineDash([]);
        ctx.lineTo(stabilized.x, stabilized.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(stabilized.x, stabilized.y);
    } else if (
        currentTool === "line" ||
        currentTool === "rect" ||
        currentTool === "circle"
    ) {
        if (shapePreview) ctx.putImageData(shapePreview, 0, 0);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = size;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalCompositeOperation = "source-over";
        brushStyle === "dashed"
            ? ctx.setLineDash([10, 10])
            : ctx.setLineDash([]);

        if (currentTool === "line") {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(x, y);
            ctx.stroke();
        } else if (currentTool === "rect") {
            ctx.beginPath();
            ctx.rect(startX, startY, x - startX, y - startY);
            ctx.stroke();
        } else if (currentTool === "circle") {
            const radius = Math.sqrt(
                Math.pow(x - startX, 2) + Math.pow(y - startY, 2),
            );
            ctx.beginPath();
            ctx.arc(startX, startY, radius, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}

function stopDrawing() {
    if (isDrawing) {
        isDrawing = false;
        ctx.closePath();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.setLineDash([]);
        shapePreview = null;
        points = [];
        saveHistory();
    }
}

function floodFill(clickX, clickY, fillColor) {
    const x = Math.floor(clickX);
    const y = Math.floor(clickY);
    if (
        x < 0 ||
        x >= drawingCanvas.width ||
        y < 0 ||
        y >= drawingCanvas.height
    )
        return;

    const imageData = ctx.getImageData(
        0,
        0,
        drawingCanvas.width,
        drawingCanvas.height,
    );
    const data = imageData.data;
    const targetIdx = (y * drawingCanvas.width + x) * 4;
    const targetR = data[targetIdx];
    const targetG = data[targetIdx + 1];
    const targetB = data[targetIdx + 2];
    const targetA = data[targetIdx + 3];
    const fillR = parseInt(fillColor.slice(1, 3), 16);
    const fillG = parseInt(fillColor.slice(3, 5), 16);
    const fillB = parseInt(fillColor.slice(5, 7), 16);

    if (
        targetR === fillR &&
        targetG === fillG &&
        targetB === fillB &&
        targetA === 255
    )
        return;

    const queue = [[x, y]];
    const filled = new Uint8Array(
        drawingCanvas.width * drawingCanvas.height,
    );

    while (queue.length > 0) {
        const [px, py] = queue.shift();
        if (
            px < 0 ||
            px >= drawingCanvas.width ||
            py < 0 ||
            py >= drawingCanvas.height
        )
            continue;
        const pixelIdx = py * drawingCanvas.width + px;
        if (filled[pixelIdx]) continue;
        filled[pixelIdx] = 1;
        const dataIdx = pixelIdx * 4;
        if (
            data[dataIdx] !== targetR ||
            data[dataIdx + 1] !== targetG ||
            data[dataIdx + 2] !== targetB ||
            data[dataIdx + 3] !== targetA
        )
            continue;
        data[dataIdx] = fillR;
        data[dataIdx + 1] = fillG;
        data[dataIdx + 2] = fillB;
        data[dataIdx + 3] = 255;
        queue.push(
            [px + 1, py],
            [px - 1, py],
            [px, py + 1],
            [px, py - 1],
        );
    }

    ctx.putImageData(imageData, 0, 0);
    saveHistory();
}

function selectTool(tool) {
    currentTool = tool;
    document
        .querySelectorAll("[data-tool]")
        .forEach((el) => el.classList.remove("active"));
    const toolEl = document.querySelector(`[data-tool="${tool}"]`);
    if (toolEl) toolEl.classList.add("active");
    if (brushPresets[tool]) {
        document.getElementById("brushSize").value =
            brushPresets[tool].size;
        document.getElementById("brushSizeValue").textContent =
            brushPresets[tool].size + "px";
        document.getElementById("brushOpacity").value =
            brushPresets[tool].opacity;
        document.getElementById("brushOpacityValue").textContent =
            brushPresets[tool].opacity + "%";
        document.getElementById("brushStabilization").value =
            brushPresets[tool].stabilization;
        document.getElementById(
            "brushStabilizationValue",
        ).textContent = brushPresets[tool].stabilization;
    }
    document.getElementById("toolsMenu").classList.remove("open");
}

function flipHorizontal() {
    const temp = document.createElement("canvas");
    temp.width = drawingCanvas.width;
    temp.height = drawingCanvas.height;
    const tempCtx = temp.getContext("2d");
    tempCtx.translate(temp.width, 0);
    tempCtx.scale(-1, 1);
    tempCtx.drawImage(drawingCanvas, 0, 0);
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    ctx.drawImage(temp, 0, 0);
    saveHistory();
}

function flipVertical() {
    const temp = document.createElement("canvas");
    temp.width = drawingCanvas.width;
    temp.height = drawingCanvas.height;
    const tempCtx = temp.getContext("2d");
    tempCtx.translate(0, temp.height);
    tempCtx.scale(1, -1);
    tempCtx.drawImage(drawingCanvas, 0, 0);
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    ctx.drawImage(temp, 0, 0);
    saveHistory();
}

function rotateCanvas(direction) {
    const temp = document.createElement("canvas");
    temp.width = drawingCanvas.height;
    temp.height = drawingCanvas.width;
    const tempCtx = temp.getContext("2d");
    tempCtx.translate(temp.width / 2, temp.height / 2);
    tempCtx.rotate(((direction === "left" ? -1 : 1) * Math.PI) / 2);
    tempCtx.drawImage(
        drawingCanvas,
        -drawingCanvas.width / 2,
        -drawingCanvas.height / 2,
    );
    const tempW = canvasWidth;
    canvasWidth = canvasHeight;
    canvasHeight = tempW;
    drawingCanvas.width = canvasWidth;
    drawingCanvas.height = canvasHeight;
    patternCanvas.width = canvasWidth;
    patternCanvas.height = canvasHeight;
    ctx.drawImage(temp, 0, 0);
    drawPattern();
    saveHistory();
}

// Event Listeners
document
    .getElementById("toolsBtn")
    .addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = document.getElementById("toolsMenu");
        menu.classList.toggle("open");
        document
            .getElementById("actionsMenu")
            .classList.remove("open");
        document
            .getElementById("colorMenu")
            .classList.remove("open");
        document
            .getElementById("brushSettingsMenu")
            .classList.remove("open");
    });

document.querySelectorAll("[data-tool]").forEach((el) => {
    el.addEventListener("click", () => selectTool(el.dataset.tool));
});

document
    .getElementById("transformBtn")
    .addEventListener("click", () => {
        isTransformMode = !isTransformMode;
        document
            .getElementById("transformBtn")
            .classList.toggle("active", isTransformMode);
        document
            .getElementById("transformControls")
            .classList.toggle("active", isTransformMode);
        document
            .getElementById("selectionBox")
            .classList.toggle("active", isTransformMode);
        if (isTransformMode) {
            const rect = drawingCanvas.getBoundingClientRect();
            const box = document.getElementById("selectionBox");
            box.style.left = rect.left + "px";
            box.style.top = rect.top + "px";
            box.style.width = rect.width + "px";
            box.style.height = rect.height + "px";
        }
    });

document
    .getElementById("actionsBtn")
    .addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = document.getElementById("actionsMenu");
        menu.classList.toggle("open");
        document
            .getElementById("toolsMenu")
            .classList.remove("open");
        document
            .getElementById("colorMenu")
            .classList.remove("open");
        document
            .getElementById("brushSettingsMenu")
            .classList.remove("open");
    });

document
    .getElementById("textAction")
    .addEventListener("click", () => {
        const text = prompt("Enter text:");
        if (text) {
            ctx.font = "48px Arial";
            ctx.fillStyle = currentColor;
            ctx.fillText(text, canvasWidth / 2, canvasHeight / 2);
            saveHistory();
        }
        document
            .getElementById("actionsMenu")
            .classList.remove("open");
    });

document
    .getElementById("lineAction")
    .addEventListener("click", () => {
        currentTool = "line";
        document
            .getElementById("actionsMenu")
            .classList.remove("open");
    });

document
    .getElementById("rectAction")
    .addEventListener("click", () => {
        currentTool = "rect";
        document
            .getElementById("actionsMenu")
            .classList.remove("open");
    });

document
    .getElementById("circleAction")
    .addEventListener("click", () => {
        currentTool = "circle";
        document
            .getElementById("actionsMenu")
            .classList.remove("open");
    });

document
    .getElementById("importAction")
    .addEventListener("click", () => {
        document.getElementById("imageInput").click();
        document
            .getElementById("actionsMenu")
            .classList.remove("open");
    });

document
    .getElementById("imageInput")
    .addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(
                        img,
                        0,
                        0,
                        Math.min(img.width, canvasWidth),
                        Math.min(img.height, canvasHeight),
                    );
                    saveHistory();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

let colorDragStart = null;
const colorBtn = document.getElementById("colorBtn");

colorBtn.addEventListener("mousedown", (e) => {
    colorDragStart = { x: e.clientX, y: e.clientY };
});

colorBtn.addEventListener("mousemove", (e) => {
    if (colorDragStart) {
        const dx = e.clientX - colorDragStart.x;
        const dy = e.clientY - colorDragStart.y;
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
            isDraggingColor = true;
            document.body.style.cursor = "crosshair";
        }
    }
});

colorBtn.addEventListener("mouseup", (e) => {
    if (isDraggingColor) {
        const rect = drawingCanvas.getBoundingClientRect();
        if (
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom
        ) {
            const coords = getPointerCoords(e);
            floodFill(coords.x, coords.y, currentColor);
        }
        isDraggingColor = false;
        document.body.style.cursor = "";
    } else if (Math.abs(e.clientX - colorDragStart.x) < 5) {
        document
            .getElementById("colorMenu")
            .classList.toggle("open");
        document
            .getElementById("toolsMenu")
            .classList.remove("open");
        document
            .getElementById("actionsMenu")
            .classList.remove("open");
        document
            .getElementById("brushSettingsMenu")
            .classList.remove("open");
    }
    colorDragStart = null;
});

document.querySelectorAll(".color-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document
            .querySelectorAll(".color-btn")
            .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentColor = btn.dataset.color;
        colorBtn.style.backgroundColor = currentColor;
        document.getElementById("customColorPicker").value =
            currentColor;
    });
});

document
    .getElementById("customColorPicker")
    .addEventListener("input", (e) => {
        currentColor = e.target.value;
        colorBtn.style.backgroundColor = currentColor;
        document
            .querySelectorAll(".color-btn")
            .forEach((b) => b.classList.remove("active"));
    });

document
    .getElementById("clearBtn")
    .addEventListener("click", () => {
        if (confirm("Clear canvas?")) {
            ctx.clearRect(
                0,
                0,
                drawingCanvas.width,
                drawingCanvas.height,
            );
            saveHistory();
        }
    });

document.getElementById("undoBtn").addEventListener("click", () => {
    if (historyStep > 0) {
        historyStep--;
        redrawCanvas();
    }
});

document.getElementById("redoBtn").addEventListener("click", () => {
    if (historyStep < history.length - 1) {
        historyStep++;
        redrawCanvas();
    }
});

document
    .getElementById("brushSettingsBtn")
    .addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = document.getElementById("brushSettingsMenu");
        menu.classList.toggle("open");
        document
            .getElementById("toolsMenu")
            .classList.remove("open");
        document
            .getElementById("actionsMenu")
            .classList.remove("open");
        document
            .getElementById("colorMenu")
            .classList.remove("open");
    });

document
    .getElementById("brushSize")
    .addEventListener("input", (e) => {
        document.getElementById("brushSizeValue").textContent =
            e.target.value + "px";
    });

document
    .getElementById("brushOpacity")
    .addEventListener("input", (e) => {
        document.getElementById("brushOpacityValue").textContent =
            e.target.value + "%";
    });

document
    .getElementById("brushStabilization")
    .addEventListener("input", (e) => {
        document.getElementById(
            "brushStabilizationValue",
        ).textContent = e.target.value;
    });

document.querySelectorAll("[data-style]").forEach((btn) => {
    btn.addEventListener("click", () => {
        document
            .querySelectorAll("[data-style]")
            .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        brushStyle = btn.dataset.style;
    });
});

document
    .getElementById("downloadBtn")
    .addEventListener("click", () => {
        document
            .getElementById("downloadModal")
            .classList.add("open");
    });

document
    .getElementById("cancelDownloadBtn")
    .addEventListener("click", () => {
        document
            .getElementById("downloadModal")
            .classList.remove("open");
    });

document
    .getElementById("confirmDownloadBtn")
    .addEventListener("click", () => {
        const temp = document.createElement("canvas");
        temp.width = canvasWidth;
        temp.height = canvasHeight;
        const tempCtx = temp.getContext("2d");
        tempCtx.drawImage(patternCanvas, 0, 0);
        tempCtx.drawImage(drawingCanvas, 0, 0);
        const format = document.querySelector(
            "[data-format].active",
        ).dataset.format;
        const link = document.createElement("a");
        link.href = temp.toDataURL(
            format === "jpg" ? "image/jpeg" : "image/png",
        );
        link.download = `drawing-${Date.now()}.${format}`;
        link.click();
        document
            .getElementById("downloadModal")
            .classList.remove("open");
    });

document.querySelectorAll("[data-format]").forEach((btn) => {
    btn.addEventListener("click", () => {
        document
            .querySelectorAll("[data-format]")
            .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
    });
});

document
    .getElementById("settingsBtn")
    .addEventListener("click", () => {
        document
            .getElementById("settingsPanel")
            .classList.toggle("open");
    });

document.querySelectorAll("[data-pattern]").forEach((btn) => {
    btn.addEventListener("click", () => {
        document
            .querySelectorAll("[data-pattern]")
            .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        pattern = btn.dataset.pattern;
        drawPattern();
    });
});

document
    .getElementById("penOnlyToggle")
    .addEventListener("click", () => {
        penOnly = !penOnly;
        document
            .getElementById("penOnlyToggle")
            .classList.toggle("active");
    });

document
    .getElementById("flipHBtn")
    .addEventListener("click", flipHorizontal);
document
    .getElementById("flipVBtn")
    .addEventListener("click", flipVertical);
document
    .getElementById("rotateLeftBtn")
    .addEventListener("click", () => rotateCanvas("left"));
document
    .getElementById("rotateRightBtn")
    .addEventListener("click", () => rotateCanvas("right"));

document
    .getElementById("applyTransformBtn")
    .addEventListener("click", () => {
        isTransformMode = false;
        document
            .getElementById("transformBtn")
            .classList.remove("active");
        document
            .getElementById("transformControls")
            .classList.remove("active");
        document
            .getElementById("selectionBox")
            .classList.remove("active");
    });

document
    .getElementById("resetZoomBtn")
    .addEventListener("click", () => {
        zoom = 1;
        rotation = 0;
        translateX = 0;
        translateY = 0;
        updateCanvasTransform();
    });

document.addEventListener("click", (e) => {
    if (
        !e.target.closest(".dropdown-trigger") &&
        !e.target.closest(".dropdown-menu")
    ) {
        document
            .getElementById("toolsMenu")
            .classList.remove("open");
        document
            .getElementById("actionsMenu")
            .classList.remove("open");
        document
            .getElementById("colorMenu")
            .classList.remove("open");
        document
            .getElementById("brushSettingsMenu")
            .classList.remove("open");
    }
    if (
        !e.target.closest(".settings-panel") &&
        e.target !== document.getElementById("settingsBtn")
    ) {
        document
            .getElementById("settingsPanel")
            .classList.remove("open");
    }
});

// Touch zoom and rotate
mainContainer.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(
            e.touches[1].clientY - e.touches[0].clientY,
            e.touches[1].clientX - e.touches[0].clientX,
        );
        lastTouchAngle = (angle * 180) / Math.PI;
    }
});

mainContainer.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle =
            (Math.atan2(
                e.touches[1].clientY - e.touches[0].clientY,
                e.touches[1].clientX - e.touches[0].clientX,
            ) *
                180) /
            Math.PI;

        if (lastTouchDistance > 0) {
            zoom = Math.max(
                0.25,
                Math.min(4, zoom * (distance / lastTouchDistance)),
            );
            rotation += angle - lastTouchAngle;
            updateCanvasTransform();
        }

        lastTouchDistance = distance;
        lastTouchAngle = angle;
    }
});

mainContainer.addEventListener("touchend", () => {
    lastTouchDistance = 0;
});

drawingCanvas.addEventListener("pointerdown", startDrawing);
drawingCanvas.addEventListener("pointermove", draw);
drawingCanvas.addEventListener("pointerup", stopDrawing);
drawingCanvas.addEventListener("pointercancel", stopDrawing);

initCanvas();
