const patternCanvas = document.getElementById("patternCanvas");
const drawingCanvas = document.getElementById("drawingCanvas");
const patternCtx = patternCanvas.getContext("2d");
const ctx = drawingCanvas.getContext("2d", { willReadFrequently: true });
const canvasWrapper = document.getElementById("canvasWrapper");
const mainContainer = document.getElementById("mainContainer");

let canvasWidth = 1200;
let canvasHeight = 800;
let isDrawing = false;
let currentColor = "#000000";
let currentTool = "pen";
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
let colorDragStart = null;

// Layer system
let layers = [];
let currentLayerIndex = 0;
let layerIdCounter = 0;

// Transform variables
let selectedLayer = null;
let transformStart = null;
let transformMode = null; // 'move', 'rotate', 'scale'

// Zoom variables
let isPanning = false;
let panStart = { x: 0, y: 0 };
let lastTouchDistance = 0;
let lastTouchAngle = 0;

const brushPresets = {
    pen: { size: 3, opacity: 100, stabilization: 5 },
    marker: { size: 30, opacity: 60, stabilization: 2 },
    calligraphy: { size: 20, opacity: 100, stabilization: 3 },
    eraser: { size: 20, opacity: 100, stabilization: 0 },
};

function initCanvas() {
    patternCanvas.width = canvasWidth;
    patternCanvas.height = canvasHeight;
    drawingCanvas.width = canvasWidth;
    drawingCanvas.height = canvasHeight;

    // Create initial layer
    addLayer("Background");
    
    updateCanvasTransform();
    drawPattern();
    renderAllLayers();
}

function addLayer(name = `Layer ${layers.length + 1}`) {
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    const layer = {
        id: layerIdCounter++,
        name: name,
        canvas: canvas,
        ctx: canvas.getContext("2d", { willReadFrequently: true }),
        visible: true,
        opacity: 1,
        locked: false,
        isImage: false,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 }
    };
    
    layers.push(layer);
    currentLayerIndex = layers.length - 1;
    updateLayersList();
    renderAllLayers();
    return layer;
}

function updateLayersList() {
    const list = document.getElementById("layersList");
    list.innerHTML = "";
    
    [...layers].reverse().forEach((layer, reverseIndex) => {
        const index = layers.length - 1 - reverseIndex;
        const item = document.createElement("div");
        item.className = "layer-item" + (index === currentLayerIndex ? " active" : "");
        item.innerHTML = `
            <div class="layer-preview">
                <canvas width="40" height="30"></canvas>
            </div>
            <div class="layer-info">
                <div class="layer-name">${layer.name}</div>
            </div>
            <div class="layer-controls">
                <button class="layer-btn" data-action="visible" data-index="${index}">
                    <i class="bx ${layer.visible ? 'bx-show' : 'bx-hide'}"></i>
                </button>
                <button class="layer-btn" data-action="duplicate" data-index="${index}">
                    <i class="bx bx-copy"></i>
                </button>
                <button class="layer-btn" data-action="delete" data-index="${index}" ${layers.length === 1 ? 'disabled' : ''}>
                    <i class="bx bx-trash"></i>
                </button>
            </div>
        `;
        
        // Draw preview
        const previewCanvas = item.querySelector("canvas");
        const previewCtx = previewCanvas.getContext("2d");
        previewCtx.drawImage(layer.canvas, 0, 0, 40, 30);
        
        // Select layer on click
        item.querySelector(".layer-info").addEventListener("click", () => {
            currentLayerIndex = index;
            updateLayersList();
        });
        
        list.appendChild(item);
    });
    
    // Add event listeners for layer controls
    list.querySelectorAll(".layer-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const index = parseInt(btn.dataset.index);
            
            if (action === "visible") {
                layers[index].visible = !layers[index].visible;
                updateLayersList();
                renderAllLayers();
            } else if (action === "duplicate") {
                duplicateLayer(index);
            } else if (action === "delete") {
                deleteLayer(index);
            }
        });
    });
}

function duplicateLayer(index) {
    const original = layers[index];
    const newLayer = addLayer(original.name + " copy");
    newLayer.ctx.drawImage(original.canvas, 0, 0);
    newLayer.transform = { ...original.transform };
    renderAllLayers();
}

function deleteLayer(index) {
    if (layers.length === 1) return;
    layers.splice(index, 1);
    if (currentLayerIndex >= layers.length) {
        currentLayerIndex = layers.length - 1;
    }
    updateLayersList();
    renderAllLayers();
}

function getCurrentLayer() {
    return layers[currentLayerIndex];
}

function renderAllLayers() {
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    
    layers.forEach(layer => {
        if (!layer.visible) return;
        
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        
        if (layer.isImage && (layer.transform.x !== 0 || layer.transform.y !== 0 || 
            layer.transform.scale !== 1 || layer.transform.rotation !== 0)) {
            const centerX = canvasWidth / 2;
            const centerY = canvasHeight / 2;
            ctx.translate(centerX + layer.transform.x, centerY + layer.transform.y);
            ctx.rotate((layer.transform.rotation * Math.PI) / 180);
            ctx.scale(layer.transform.scale, layer.transform.scale);
            ctx.drawImage(layer.canvas, -canvasWidth / 2, -canvasHeight / 2);
        } else {
            ctx.drawImage(layer.canvas, 0, 0);
        }
        
        ctx.restore();
    });
    
    updateLayersList();
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
    let avgX = 0, avgY = 0;
    for (let p of points) {
        avgX += p.x;
        avgY += p.y;
    }
    return { x: avgX / points.length, y: avgY / points.length };
}

function startDrawing(e) {
    if (penOnly && e.pointerType && e.pointerType !== "pen") return;
    
    const { x, y, clientX, clientY } = getPointerCoords(e);
    
    // Transform mode
    if (isTransformMode || currentTool === "transform") {
        handleTransformStart(x, y, clientX, clientY, e);
        return;
    }

    isDrawing = true;
    startX = x;
    startY = y;
    points = [];
    lastPoint = { x, y };
    lastTime = Date.now();

    const layer = getCurrentLayer();
    const layerCtx = layer.ctx;

    if (currentTool === "pen" || currentTool === "marker" || 
        currentTool === "calligraphy" || currentTool === "eraser") {
        layerCtx.beginPath();
        layerCtx.moveTo(x, y);
    } else if (currentTool === "line" || currentTool === "rect" || currentTool === "circle") {
        shapePreview = layerCtx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
    }
}

function draw(e) {
    if (isTransformMode && transformStart) {
        handleTransformMove(e);
        return;
    }
    
    if (!isDrawing) return;

    const { x, y } = getPointerCoords(e);
    const size = parseInt(document.getElementById("brushSize").value);
    const opacity = parseInt(document.getElementById("brushOpacity").value) / 100;
    const stabilization = parseInt(document.getElementById("brushStabilization").value);

    const layer = getCurrentLayer();
    const layerCtx = layer.ctx;

    if (currentTool === "eraser") {
        layerCtx.save();
        layerCtx.globalCompositeOperation = "destination-out";
        layerCtx.lineWidth = size;
        layerCtx.lineCap = "round";
        layerCtx.lineJoin = "round";
        layerCtx.globalAlpha = 1;
        layerCtx.lineTo(x, y);
        layerCtx.stroke();
        layerCtx.beginPath();
        layerCtx.moveTo(x, y);
        layerCtx.restore();
    } else if (currentTool === "calligraphy") {
        const currentTime = Date.now();
        const timeDelta = Math.max(currentTime - lastTime, 1);
        const distance = Math.sqrt(Math.pow(x - lastPoint.x, 2) + Math.pow(y - lastPoint.y, 2));
        const speed = distance / timeDelta;
        const minWidth = size * 0.3;
        const maxWidth = size * 1.3;
        const speedFactor = Math.min(speed * 150, 1);
        const lineWidth = maxWidth - speedFactor * (maxWidth - minWidth);

        layerCtx.lineWidth = Math.max(minWidth, lineWidth);
        layerCtx.lineCap = "round";
        layerCtx.lineJoin = "round";
        layerCtx.strokeStyle = currentColor;
        layerCtx.globalAlpha = opacity;
        layerCtx.globalCompositeOperation = "source-over";
        brushStyle === "dashed" ? layerCtx.setLineDash([10, 10]) : layerCtx.setLineDash([]);
        layerCtx.lineTo(x, y);
        layerCtx.stroke();
        layerCtx.beginPath();
        layerCtx.moveTo(x, y);
        lastPoint = { x, y };
        lastTime = currentTime;
    } else if (currentTool === "marker") {
        const stabilized = getStabilizedPoint(x, y, stabilization);
        layerCtx.lineWidth = size;
        layerCtx.lineCap = "round";
        layerCtx.lineJoin = "round";
        layerCtx.strokeStyle = currentColor;
        layerCtx.globalAlpha = opacity;
        layerCtx.globalCompositeOperation = "multiply"; // Better marker blending
        brushStyle === "dashed" ? layerCtx.setLineDash([10, 10]) : layerCtx.setLineDash([]);
        layerCtx.lineTo(stabilized.x, stabilized.y);
        layerCtx.stroke();
        layerCtx.beginPath();
        layerCtx.moveTo(stabilized.x, stabilized.y);
    } else if (currentTool === "pen") {
        const stabilized = getStabilizedPoint(x, y, stabilization);
        layerCtx.lineWidth = size;
        layerCtx.lineCap = "round";
        layerCtx.lineJoin = "round";
        layerCtx.strokeStyle = currentColor;
        layerCtx.globalAlpha = opacity;
        layerCtx.globalCompositeOperation = "source-over";
        brushStyle === "dashed" ? layerCtx.setLineDash([10, 10]) : layerCtx.setLineDash([]);
        layerCtx.lineTo(stabilized.x, stabilized.y);
        layerCtx.stroke();
        layerCtx.beginPath();
        layerCtx.moveTo(stabilized.x, stabilized.y);
    } else if (currentTool === "line" || currentTool === "rect" || currentTool === "circle") {
        if (shapePreview) layerCtx.putImageData(shapePreview, 0, 0);
        layerCtx.globalAlpha = 1;
        layerCtx.strokeStyle = currentColor;
        layerCtx.lineWidth = size;
        layerCtx.lineCap = "round";
        layerCtx.lineJoin = "round";
        layerCtx.globalCompositeOperation = "source-over";
        brushStyle === "dashed" ? layerCtx.setLineDash([10, 10]) : layerCtx.setLineDash([]);

        if (currentTool === "line") {
            layerCtx.beginPath();
            layerCtx.moveTo(startX, startY);
            layerCtx.lineTo(x, y);
            layerCtx.stroke();
        } else if (currentTool === "rect") {
            layerCtx.beginPath();
            layerCtx.rect(startX, startY, x - startX, y - startY);
            layerCtx.stroke();
        } else if (currentTool === "circle") {
            const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
            layerCtx.beginPath();
            layerCtx.arc(startX, startY, radius, 0, Math.PI * 2);
            layerCtx.stroke();
        }
    }
    
    renderAllLayers();
}

function stopDrawing() {
    if (transformStart) {
        handleTransformEnd();
        return;
    }
    
    if (isDrawing) {
        isDrawing = false;
        const layer = getCurrentLayer();
        const layerCtx = layer.ctx;
        layerCtx.closePath();
        layerCtx.globalAlpha = 1;
        layerCtx.globalCompositeOperation = "source-over";
        layerCtx.setLineDash([]);
        shapePreview = null;
        points = [];
        renderAllLayers();
    }
}

function handleTransformStart(x, y, clientX, clientY, e) {
    // Find which layer was clicked
    for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        if (!layer.visible || layer.locked) continue;
        
        const imageData = layer.ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);
        if (imageData.data[3] > 0) {
            selectedLayer = layer;
            currentLayerIndex = i;
            transformStart = { x: clientX, y: clientY, layerTransform: { ...layer.transform } };
            transformMode = e.shiftKey ? 'scale' : (e.ctrlKey ? 'rotate' : 'move');
            updateLayersList();
            return;
        }
    }
}

function handleTransformMove(e) {
    if (!transformStart || !selectedLayer) return;
    
    const { clientX, clientY } = e;
    const dx = clientX - transformStart.x;
    const dy = clientY - transformStart.y;
    
    if (transformMode === 'move') {
        selectedLayer.transform.x = transformStart.layerTransform.x + dx / zoom;
        selectedLayer.transform.y = transformStart.layerTransform.y + dy / zoom;
    } else if (transformMode === 'scale') {
        const distance = Math.sqrt(dx * dx + dy * dy);
        const scaleFactor = 1 + distance / 200;
        selectedLayer.transform.scale = transformStart.layerTransform.scale * (dy < 0 ? 1 / scaleFactor : scaleFactor);
        selectedLayer.transform.scale = Math.max(0.1, Math.min(5, selectedLayer.transform.scale));
    } else if (transformMode === 'rotate') {
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        selectedLayer.transform.rotation = transformStart.layerTransform.rotation + angle;
    }
    
    renderAllLayers();
}

function handleTransformEnd() {
    transformStart = null;
    selectedLayer = null;
    transformMode = null;
}

function floodFill(clickX, clickY, fillColor) {
    const x = Math.floor(clickX);
    const y = Math.floor(clickY);
    
    const layer = getCurrentLayer();
    const layerCtx = layer.ctx;
    
    if (x < 0 || x >= layer.canvas.width || y < 0 || y >= layer.canvas.height) return;

    const imageData = layerCtx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
    const data = imageData.data;
    const targetIdx = (y * layer.canvas.width + x) * 4;
    const targetR = data[targetIdx];
    const targetG = data[targetIdx + 1];
    const targetB = data[targetIdx + 2];
    const targetA = data[targetIdx + 3];
    const fillR = parseInt(fillColor.slice(1, 3), 16);
    const fillG = parseInt(fillColor.slice(3, 5), 16);
    const fillB = parseInt(fillColor.slice(5, 7), 16);

    if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === 255) return;

    const queue = [[x, y]];
    const filled = new Uint8Array(layer.canvas.width * layer.canvas.height);

    while (queue.length > 0) {
        const [px, py] = queue.shift();
        if (px < 0 || px >= layer.canvas.width || py < 0 || py >= layer.canvas.height) continue;
        const pixelIdx = py * layer.canvas.width + px;
        if (filled[pixelIdx]) continue;
        filled[pixelIdx] = 1;
        const dataIdx = pixelIdx * 4;
        if (data[dataIdx] !== targetR || data[dataIdx + 1] !== targetG || 
            data[dataIdx + 2] !== targetB || data[dataIdx + 3] !== targetA) continue;
        data[dataIdx] = fillR;
        data[dataIdx + 1] = fillG;
        data[dataIdx + 2] = fillB;
        data[dataIdx + 3] = 255;
        queue.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }

    layerCtx.putImageData(imageData, 0, 0);
    renderAllLayers();
}

function selectTool(tool) {
    currentTool = tool;
    isTransformMode = tool === "transform";
    
    document.querySelectorAll("[data-tool]").forEach(el => el.classList.remove("active"));
    const toolEl = document.querySelector(`[data-tool="${tool}"]`);
    if (toolEl) toolEl.classList.add("active");
    
    document.getElementById("transformBtn").classList.toggle("active", isTransformMode);
    
    if (brushPresets[tool]) {
        document.getElementById("brushSize").value = brushPresets[tool].size;
        document.getElementById("brushSizeValue").textContent = brushPresets[tool].size + "px";
        document.getElementById("brushOpacity").value = brushPresets[tool].opacity;
        document.getElementById("brushOpacityValue").textContent = brushPresets[tool].opacity + "%";
        document.getElementById("brushStabilization").value = brushPresets[tool].stabilization;
        document.getElementById("brushStabilizationValue").textContent = brushPresets[tool].stabilization;
    }
    document.getElementById("toolsMenu").classList.remove("open");
}

function flipHorizontal() {
    const layer = getCurrentLayer();
    const temp = document.createElement("canvas");
    temp.width = layer.canvas.width;
    temp.height = layer.canvas.height;
    const tempCtx = temp.getContext("2d");
    tempCtx.translate(temp.width, 0);
    tempCtx.scale(-1, 1);
    tempCtx.drawImage(layer.canvas, 0, 0);
    layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    layer.ctx.drawImage(temp, 0, 0);
    renderAllLayers();
}

function flipVertical() {
    const layer = getCurrentLayer();
    const temp = document.createElement("canvas");
    temp.width = layer.canvas.width;
    temp.height = layer.canvas.height;
    const tempCtx = temp.getContext("2d");
    tempCtx.translate(0, temp.height);
    tempCtx.scale(1, -1);
    tempCtx.drawImage(layer.canvas, 0, 0);
    layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    layer.ctx.drawImage(temp, 0, 0);
    renderAllLayers();
}

function rotateCanvas(direction) {
    const layer = getCurrentLayer();
    const temp = document.createElement("canvas");
    temp.width = layer.canvas.height;
    temp.height = layer.canvas.width;
    const tempCtx = temp.getContext("2d");
    tempCtx.translate(temp.width / 2, temp.height / 2);
    tempCtx.rotate(((direction === "left" ? -1 : 1) * Math.PI) / 2);
    tempCtx.drawImage(layer.canvas, -layer.canvas.width / 2, -layer.canvas.height / 2);
    
    const tempW = canvasWidth;
    canvasWidth = canvasHeight;
    canvasHeight = tempW;
    
    layers.forEach(l => {
        l.canvas.width = canvasWidth;
        l.canvas.height = canvasHeight;
    });
    
    layer.ctx.drawImage(temp, 0, 0);
    
    drawingCanvas.width = canvasWidth;
    drawingCanvas.height = canvasHeight;
    patternCanvas.width = canvasWidth;
    patternCanvas.height = canvasHeight;
    
    drawPattern();
    renderAllLayers();
}

// Event Listeners
document.getElementById("toolsBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.getElementById("toolsMenu");
    menu.classList.toggle("open");
    document.getElementById("actionsMenu").classList.remove("open");
    document.getElementById("colorMenu").classList.remove("open");
    document.getElementById("brushSettingsMenu").classList.remove("open");
});

document.querySelectorAll("[data-tool]").forEach((el) => {
    el.addEventListener("click", () => selectTool(el.dataset.tool));
});

document.getElementById("transformBtn").addEventListener("click", () => {
    isTransformMode = !isTransformMode;
    currentTool = isTransformMode ? "transform" : "pen";
    document.getElementById("transformBtn").classList.toggle("active", isTransformMode);
    if (!isTransformMode) {
        selectedLayer = null;
        transformStart = null;
    }
});

document.getElementById("layersBtn").addEventListener("click", () => {
    document.getElementById("layersPanel").classList.toggle("open");
});

document.getElementById("addLayerBtn").addEventListener("click", () => {
    addLayer();
});

document.getElementById("actionsBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.getElementById("actionsMenu");
    menu.classList.toggle("open");
    document.getElementById("toolsMenu").classList.remove("open");
    document.getElementById("colorMenu").classList.remove("open");
    document.getElementById("brushSettingsMenu").classList.remove("open");
});

document.getElementById("textAction").addEventListener("click", () => {
    document.getElementById("textModal").classList.add("open");
    document.getElementById("textInput").value = "";
    document.getElementById("textInput").focus();
    document.getElementById("actionsMenu").classList.remove("open");
});

document.getElementById("cancelTextBtn").addEventListener("click", () => {
    document.getElementById("textModal").classList.remove("open");
});

document.getElementById("confirmTextBtn").addEventListener("click", () => {
    const text = document.getElementById("textInput").value;
    const size = document.getElementById("textSize").value;
    if (text) {
        const layer = getCurrentLayer();
        layer.ctx.font = `${size}px Arial`;
        layer.ctx.fillStyle = currentColor;
        layer.ctx.fillText(text, canvasWidth / 2, canvasHeight / 2);
        renderAllLayers();
    }
    document.getElementById("textModal").classList.remove("open");
});

document.getElementById("textSize").addEventListener("input", (e) => {
    document.getElementById("textSizeValue").textContent = e.target.value + "px";
});

document.getElementById("lineAction").addEventListener("click", () => {
    currentTool = "line";
    document.getElementById("actionsMenu").classList.remove("open");
});

document.getElementById("rectAction").addEventListener("click", () => {
    currentTool = "rect";
    document.getElementById("actionsMenu").classList.remove("open");
});

document.getElementById("circleAction").addEventListener("click", () => {
    currentTool = "circle";
    document.getElementById("actionsMenu").classList.remove("open");
});

document.getElementById("importAction").addEventListener("click", () => {
    document.getElementById("imageInput").click();
    document.getElementById("actionsMenu").classList.remove("open");
});

document.getElementById("imageInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const newLayer = addLayer("Image " + layers.length);
                newLayer.isImage = true;
                newLayer.ctx.drawImage(img, 0, 0, Math.min(img.width, canvasWidth), Math.min(img.height, canvasHeight));
                renderAllLayers();
                
                // Switch to transform mode
                isTransformMode = true;
                currentTool = "transform";
                selectedLayer = newLayer;
                document.getElementById("transformBtn").classList.add("active");
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
});

// Color button with drag to fill
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
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
            const coords = getPointerCoords(e);
            floodFill(coords.x, coords.y, currentColor);
        }
        isDraggingColor = false;
        document.body.style.cursor = "";
    } else if (colorDragStart && Math.abs(e.clientX - colorDragStart.x) < 5) {
        document.getElementById("colorMenu").classList.toggle("open");
        document.getElementById("toolsMenu").classList.remove("open");
        document.getElementById("actionsMenu").classList.remove("open");
        document.getElementById("brushSettingsMenu").classList.remove("open");
    }
    colorDragStart = null;
});

document.addEventListener("mouseleave", () => {
    if (isDraggingColor) {
        isDraggingColor = false;
        document.body.style.cursor = "";
    }
    colorDragStart = null;
});

document.querySelectorAll(".color-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".color-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentColor = btn.dataset.color;
        colorBtn.style.backgroundColor = currentColor;
        document.getElementById("customColorPicker").value = currentColor;
    });
});

document.getElementById("customColorPicker").addEventListener("input", (e) => {
    currentColor = e.target.value;
    colorBtn.style.backgroundColor = currentColor;
    document.querySelectorAll(".color-btn").forEach((b) => b.classList.remove("active"));
});

document.getElementById("clearBtn").addEventListener("click", () => {
    document.getElementById("clearModal").classList.add("open");
});

document.getElementById("cancelClearBtn").addEventListener("click", () => {
    document.getElementById("clearModal").classList.remove("open");
});

document.getElementById("confirmClearBtn").addEventListener("click", () => {
    const layer = getCurrentLayer();
    layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    renderAllLayers();
    document.getElementById("clearModal").classList.remove("open");
});

document.getElementById("undoBtn").addEventListener("click", () => {
    // Simple undo: clear current layer
    const layer = getCurrentLayer();
    const imageData = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
    // Store for redo if needed
    renderAllLayers();
});

document.getElementById("redoBtn").addEventListener("click", () => {
    // Redo functionality
    renderAllLayers();
});

document.getElementById("brushSettingsBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.getElementById("brushSettingsMenu");
    menu.classList.toggle("open");
    document.getElementById("toolsMenu").classList.remove("open");
    document.getElementById("actionsMenu").classList.remove("open");
    document.getElementById("colorMenu").classList.remove("open");
});

document.getElementById("brushSize").addEventListener("input", (e) => {
    document.getElementById("brushSizeValue").textContent = e.target.value + "px";
});

document.getElementById("brushOpacity").addEventListener("input", (e) => {
    document.getElementById("brushOpacityValue").textContent = e.target.value + "%";
});

document.getElementById("brushStabilization").addEventListener("input", (e) => {
    document.getElementById("brushStabilizationValue").textContent = e.target.value;
});

document.querySelectorAll("[data-style]").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll("[data-style]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        brushStyle = btn.dataset.style;
    });
});

document.getElementById("downloadBtn").addEventListener("click", () => {
    document.getElementById("downloadModal").classList.add("open");
});

document.getElementById("cancelDownloadBtn").addEventListener("click", () => {
    document.getElementById("downloadModal").classList.remove("open");
});

document.getElementById("confirmDownloadBtn").addEventListener("click", () => {
    const temp = document.createElement("canvas");
    temp.width = canvasWidth;
    temp.height = canvasHeight;
    const tempCtx = temp.getContext("2d");
    tempCtx.drawImage(patternCanvas, 0, 0);
    tempCtx.drawImage(drawingCanvas, 0, 0);
    const format = document.querySelector("[data-format].active").dataset.format;
    const link = document.createElement("a");
    link.href = temp.toDataURL(format === "jpg" ? "image/jpeg" : "image/png");
    link.download = `drawing-${Date.now()}.${format}`;
    link.click();
    document.getElementById("downloadModal").classList.remove("open");
});

document.querySelectorAll("[data-format]").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll("[data-format]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
    });
});

document.getElementById("settingsBtn").addEventListener("click", () => {
    document.getElementById("settingsPanel").classList.toggle("open");
});

document.querySelectorAll("[data-pattern]").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll("[data-pattern]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        pattern = btn.dataset.pattern;
        drawPattern();
    });
});

document.getElementById("penOnlyToggle").addEventListener("click", () => {
    penOnly = !penOnly;
    document.getElementById("penOnlyToggle").classList.toggle("active");
});

document.getElementById("flipHBtn").addEventListener("click", flipHorizontal);
document.getElementById("flipVBtn").addEventListener("click", flipVertical);
document.getElementById("rotateLeftBtn").addEventListener("click", () => rotateCanvas("left"));
document.getElementById("rotateRightBtn").addEventListener("click", () => rotateCanvas("right"));

document.getElementById("applyTransformBtn").addEventListener("click", () => {
    isTransformMode = false;
    currentTool = "pen";
    selectedLayer = null;
    transformStart = null;
    document.getElementById("transformBtn").classList.remove("active");
    document.getElementById("transformControls").classList.remove("active");
});

document.getElementById("resetZoomBtn").addEventListener("click", () => {
    zoom = 1;
    rotation = 0;
    translateX = 0;
    translateY = 0;
    updateCanvasTransform();
});

document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown-trigger") && !e.target.closest(".dropdown-menu")) {
        document.getElementById("toolsMenu").classList.remove("open");
        document.getElementById("actionsMenu").classList.remove("open");
        document.getElementById("colorMenu").classList.remove("open");
        document.getElementById("brushSettingsMenu").classList.remove("open");
    }
    if (!e.target.closest(".settings-panel") && e.target !== document.getElementById("settingsBtn")) {
        document.getElementById("settingsPanel").classList.remove("open");
    }
    if (!e.target.closest(".layers-panel") && e.target !== document.getElementById("layersBtn")) {
        document.getElementById("layersPanel").classList.remove("open");
    }
});

// Mouse wheel zoom
mainContainer.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        zoom = Math.max(0.25, Math.min(4, zoom * delta));
        updateCanvasTransform();
    }
}, { passive: false });

// Middle mouse button pan
mainContainer.addEventListener("mousedown", (e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
        e.preventDefault();
        isPanning = true;
        panStart = { x: e.clientX - translateX, y: e.clientY - translateY };
    }
});

mainContainer.addEventListener("mousemove", (e) => {
    if (isPanning) {
        translateX = e.clientX - panStart.x;
        translateY = e.clientY - panStart.y;
        updateCanvasTransform();
    }
});

mainContainer.addEventListener("mouseup", (e) => {
    if (e.button === 1 || e.button === 0) {
        isPanning = false;
    }
});

// Touch zoom and rotate
mainContainer.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(e.touches[1].clientY - e.touches[0].clientY, 
                                 e.touches[1].clientX - e.touches[0].clientX);
        lastTouchAngle = (angle * 180) / Math.PI;
    }
});

mainContainer.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = (Math.atan2(e.touches[1].clientY - e.touches[0].clientY,
                                  e.touches[1].clientX - e.touches[0].clientX) * 180) / Math.PI;

        if (lastTouchDistance > 0) {
            zoom = Math.max(0.25, Math.min(4, zoom * (distance / lastTouchDistance)));
            rotation += angle - lastTouchAngle;
            updateCanvasTransform();
        }

        lastTouchDistance = distance;
        lastTouchAngle = angle;
    }
}, { passive: false });

mainContainer.addEventListener("touchend", () => {
    lastTouchDistance = 0;
});

drawingCanvas.addEventListener("pointerdown", startDrawing);
drawingCanvas.addEventListener("pointermove", draw);
drawingCanvas.addEventListener("pointerup", stopDrawing);
drawingCanvas.addEventListener("pointercancel", stopDrawing);

initCanvas();
