// ==================== TEXT TO SPEECH ====================
const synth = window.speechSynthesis;
let currentUtterance = null;

function speak() {
    if (synth.speaking && !synth.paused) { pauseSpeak(); return; }
    if (synth.paused) { synth.resume(); return; }
    if (synth.speaking) synth.cancel();
    const text = document.getElementById('tts-input').value.trim();
    if (!text) { alert('Please enter text to speak.'); return; }
    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.rate = parseFloat(document.getElementById('rate-slider').value);
    currentUtterance.volume = parseFloat(document.getElementById('volume-slider').value) / 100;
    synth.speak(currentUtterance);
}
function pauseSpeak() { if (synth.speaking && !synth.paused) synth.pause(); }
function stopSpeak() { synth.cancel(); }

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('rate-slider').addEventListener('input', function () {
        document.getElementById('rate-value').textContent = this.value + 'x';
    });
    document.getElementById('volume-slider').addEventListener('input', function () {
        document.getElementById('volume-value').textContent = this.value + '%';
    });
});

function toggleContrast() { document.body.classList.toggle('high-contrast-mode'); }
let fontSize = 18;
function changeSize(delta) { fontSize += delta; document.body.style.fontSize = fontSize + 'px'; }

// ==================== SPEECH TO TEXT ====================
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognitionAPI) {
    recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = function (e) {
        document.getElementById('tts-input').value += e.results[0][0].transcript + ' ';
        document.getElementById('tts-status').textContent = 'Status: Text captured!';
    };
    recognition.onspeechend = function () { recognition.stop(); };
    recognition.onerror = function (e) {
        document.getElementById('tts-status').textContent = 'Status: Error – ' + e.error;
    };
    recognition.onend = function () {
        document.getElementById('tts-status').textContent = 'Status: Ready';
    };
} else {
    document.getElementById('listen-btn').disabled = true;
    document.getElementById('listen-btn').title = 'Not supported — use Chrome';
    document.getElementById('tts-status').textContent = 'Status: Speech recognition unavailable (use Chrome)';
}

function startListening() {
    if (!recognition) return;
    document.getElementById('tts-status').textContent = 'Status: 🔴 Listening...';
    recognition.start();
}

// ==================== SHARED STATE ====================
let objectStream = null;
let objectInterval = null;
let colorStream = null;
let colorVideo = null;
let colorInterval = null;
let colorActive = false;
let describerStream = null;
let cocoModel = null;
let sharedAudioCtx = null;
let lastBeepTime = 0;

// ==================== COCO MODEL ====================
async function loadCocoModel() {
    const statusEl = document.getElementById('model-status');
    if (typeof cocoSsd === 'undefined') {
        statusEl.textContent = '⚠️ Object detection unavailable (CDN blocked) — all other features work fine.';
        disableCocoButtons();
        return;
    }
    try {
        cocoModel = await cocoSsd.load();
        statusEl.textContent = '✅ Object detection model ready';
    } catch (err) {
        statusEl.textContent = '⚠️ Object detection unavailable — Text-to-Speech and Scene Analyzer still work.';
        disableCocoButtons();
    }
}

function disableCocoButtons() {
    ['startObjectDetection', 'startColorDetection'].forEach(fn => {
        document.querySelectorAll('[onclick="' + fn + '()"]').forEach(btn => {
            btn.disabled = true;
            btn.title = 'Object detection model could not load';
        });
    });
}

// ==================== AUDIO ====================
function getAudioCtx() {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
        sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume();
    return sharedAudioCtx;
}

function playBeep(proximity) {
    const now = Date.now();
    const minGap = Math.max(150, 600 - proximity * 8);
    if (now - lastBeepTime < minGap) return;
    lastBeepTime = now;
    try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 400 + proximity * 6;
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
    } catch (_) { }
}

// ==================== STOP ALL CAMERAS ====================
function stopAllCameras() {
    if (objectStream) { objectStream.getTracks().forEach(t => t.stop()); objectStream = null; }
    if (objectInterval) { clearInterval(objectInterval); objectInterval = null; }
    colorActive = false;
    if (colorStream) { colorStream.getTracks().forEach(t => t.stop()); colorStream = null; }
    if (colorInterval) { clearInterval(colorInterval); colorInterval = null; }
    if (describerStream) { describerStream.getTracks().forEach(t => t.stop()); describerStream = null; }
    document.getElementById('describer-video').style.display = 'none';
    document.getElementById('object-info').textContent = 'Object distance: Not detected';
    document.getElementById('color-info').innerHTML =
        '<p><strong>Object:</strong> Not detected</p><p><strong>Color:</strong> Not detected</p><p><strong>Light Level:</strong> Not detected</p>';
    document.getElementById('image-description').textContent = 'Waiting for camera...';
    document.getElementById('start-describer-btn').style.display = 'inline-block';
    document.getElementById('capture-describe-btn').style.display = 'none';
    document.getElementById('pause-describe-btn').style.display = 'none';
    document.getElementById('stop-describer-btn').style.display = 'none';
}

// ==================== OBJECT DETECTION ====================
async function startObjectDetection() {
    try {
        stopAllCameras();
        objectStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const canvas = document.getElementById('object-canvas');
        const ctx = canvas.getContext('2d');
        const vid = document.createElement('video');
        vid.srcObject = objectStream;
        vid.setAttribute('playsinline', true);
        await vid.play();
        canvas.width = 640;
        canvas.height = 480;
        objectInterval = setInterval(() => {
            ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let dark = 0;
            for (let i = 0; i < pixels.length; i += 4) {
                if ((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3 < 100) dark++;
            }
            const proximity = dark / (canvas.width * canvas.height) * 100;
            document.getElementById('object-info').textContent =
                'Object proximity: ' + Math.round(proximity) + '% | Distance: ' + Math.round(100 - proximity) + '%';
            if (proximity > 20) playBeep(proximity);
        }, 100);
    } catch (err) { alert('Camera error: ' + err.message); }
}

function stopObjectDetection() {
    if (objectStream) { objectStream.getTracks().forEach(t => t.stop()); objectStream = null; }
    if (objectInterval) { clearInterval(objectInterval); objectInterval = null; }
    document.getElementById('object-info').textContent = 'Object distance: Not detected';
}

// ==================== COLOR DETECTION ====================
function getColor(r, g, b) {
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (sat < 30) {
        if ((r + g + b) / 3 > 180) return 'White';
        if ((r + g + b) / 3 < 60) return 'Black';
        return 'Gray';
    }
    if (r > g && r > b) return 'Red';
    if (g > r && g > b) return 'Green';
    if (b > r && b > g) return 'Blue';
    if (r > 150 && g > 150) return 'Yellow';
    if (r > 150 && b > 150) return 'Magenta';
    if (g > 150 && b > 150) return 'Cyan';
    return 'RGB(' + r + ',' + g + ',' + b + ')';
}

function getLightLevel(brightness) {
    if (brightness > 180) return 'Very Bright';
    if (brightness > 128) return 'Bright';
    if (brightness > 64) return 'Moderate';
    return 'Dark';
}

function speakColorInfo(objectName, colorName, lightName) {
    synth.cancel();
    const text = 'Object: ' + objectName + '. Color: ' + colorName + '. Light level: ' + lightName;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = parseFloat(document.getElementById('rate-slider').value) || 0.9;
    utter.volume = parseFloat(document.getElementById('volume-slider').value) / 100 || 1;
    synth.speak(utter);
}

async function startColorDetection() {
    try {
        stopAllCameras();
        colorStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const canvas = document.getElementById('color-canvas');
        canvas.style.display = 'block';
        const ctx = canvas.getContext('2d');
        colorVideo = document.createElement('video');
        colorVideo.srcObject = colorStream;
        colorVideo.setAttribute('playsinline', true);
        colorVideo.onloadedmetadata = () => {
            canvas.width = colorVideo.videoWidth;
            canvas.height = colorVideo.videoHeight;
        };
        await colorVideo.play();
        colorActive = true;

        colorInterval = setInterval(async () => {
            if (!colorActive) return;
            ctx.drawImage(colorVideo, 0, 0, canvas.width, canvas.height);

            if (cocoModel) {
                const preds = await cocoModel.detect(canvas);
                ctx.strokeStyle = '#FF0000';
                ctx.lineWidth = 3;
                ctx.font = 'bold 16px Segoe UI';
                preds.forEach(p => {
                    const [x, y, w, h] = p.bbox;
                    ctx.strokeRect(x, y, w, h);
                    ctx.fillStyle = 'rgba(255,0,0,0.75)';
                    const label = p.class + ' ' + Math.round(p.score * 100) + '%';
                    ctx.fillRect(x, y - 22, ctx.measureText(label).width + 8, 22);
                    ctx.fillStyle = '#fff';
                    ctx.fillText(label, x + 4, y - 5);
                });
                if (preds.length > 0) {
                    const biggest = preds.reduce((a, b) => a.bbox[2] * a.bbox[3] > b.bbox[2] * b.bbox[3] ? a : b);
                    const [x, y, w, h] = biggest.bbox;
                    const pixels = ctx.getImageData(x, y, w, h).data;
                    let r = 0, g = 0, bv = 0, bright = 0;
                    const n = pixels.length / 4;
                    for (let i = 0; i < pixels.length; i += 4) {
                        r += pixels[i]; g += pixels[i + 1]; bv += pixels[i + 2];
                        bright += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
                    }
                    r = Math.round(r / n); g = Math.round(g / n); bv = Math.round(bv / n); bright = Math.round(bright / n);
                    const objectName = biggest.class + ' (' + Math.round(biggest.score * 100) + '%)';
                    const colorName = getColor(r, g, bv);
                    const lightName = getLightLevel(bright);
                    document.getElementById('color-info').innerHTML =
                        '<p><strong>Object:</strong> ' + objectName + '</p>' +
                        '<p><strong>Color:</strong> ' + colorName + ' (RGB: ' + r + ', ' + g + ', ' + bv + ')</p>' +
                        '<p><strong>Light Level:</strong> ' + lightName + ' (' + bright + '/255)</p>';
                    speakColorInfo(objectName, colorName, lightName);
                } else {
                    document.getElementById('color-info').innerHTML =
                        '<p><strong>Object:</strong> None detected</p><p><strong>Color:</strong> N/A</p><p><strong>Light Level:</strong> Analyzing...</p>';
                    speakColorInfo('None detected', 'N/A', 'Analyzing');
                }
            } else {
                // Fallback: full frame color analysis
                const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let r = 0, g = 0, bv = 0, bright = 0;
                const n = pixels.length / 4;
                for (let i = 0; i < pixels.length; i += 4) {
                    r += pixels[i]; g += pixels[i + 1]; bv += pixels[i + 2];
                    bright += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
                }
                r = Math.round(r / n); g = Math.round(g / n); bv = Math.round(bv / n); bright = Math.round(bright / n);
                const objectName = 'No model loaded';
                const colorName = getColor(r, g, bv);
                const lightName = getLightLevel(bright);
                document.getElementById('color-info').innerHTML =
                    '<p><strong>Object:</strong> ' + objectName + '</p>' +
                    '<p><strong>Color:</strong> ' + colorName + ' (RGB: ' + r + ', ' + g + ', ' + bv + ')</p>' +
                    '<p><strong>Light Level:</strong> ' + lightName + ' (' + bright + '/255)</p>';
                speakColorInfo(objectName, colorName, lightName);
            }
        }, 500);
    } catch (err) { alert('Camera error: ' + err.message); }
}

function stopColorDetection() {
    colorActive = false;
    if (colorStream) { colorStream.getTracks().forEach(t => t.stop()); colorStream = null; }
    if (colorInterval) { clearInterval(colorInterval); colorInterval = null; }
    document.getElementById('color-canvas').style.display = 'none';
    document.getElementById('color-info').innerHTML =
        '<p><strong>Object:</strong> Not detected</p><p><strong>Color:</strong> Not detected</p><p><strong>Light Level:</strong> Not detected</p>';
}

// ==================== SCENE ANALYZER ====================
async function startDescriberCamera() {
    try {
        stopAllCameras();
        describerStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const vid = document.getElementById('describer-video');
        vid.srcObject = describerStream;
        vid.style.display = 'block';
        await vid.play();
        document.getElementById('start-describer-btn').style.display = 'none';
        document.getElementById('capture-describe-btn').style.display = 'inline-block';
        document.getElementById('pause-describe-btn').style.display = 'inline-block';
        document.getElementById('stop-describer-btn').style.display = 'inline-block';
        document.getElementById('image-description').textContent = 'Camera ready! Click Capture & Describe.';
    } catch (err) { alert('Camera error: ' + err.message); }
}

function captureAndDescribe() {
    const vid = document.getElementById('describer-video');
    const canvas = document.getElementById('image-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = vid.videoWidth;
    canvas.height = vid.videoHeight;
    ctx.drawImage(vid, 0, 0);

    document.getElementById('image-description').textContent = '🔍 Analyzing...';

    const w = canvas.width, h = canvas.height;
    const pixels = ctx.getImageData(0, 0, w, h).data;
    const total = pixels.length / 4;

    // Single pass for all stats
    let r = 0, g = 0, b = 0, bright = 0, darkCount = 0, brightCount = 0;
    let topBright = 0, bottomBright = 0, leftBright = 0, rightBright = 0;
    let edgeCount = 0, skinCount = 0, sampleCount = 0;

    const step = 8;
    for (let row = 0; row < h; row += step) {
        for (let col = 0; col < w; col += step) {
            const i = (row * w + col) * 4;
            const pr = pixels[i], pg = pixels[i + 1], pb = pixels[i + 2];
            const lum = (pr + pg + pb) / 3;

            r += pr; g += pg; b += pb; bright += lum;
            if (lum < 64) darkCount++; else if (lum > 180) brightCount++;
            if (row < h / 2) topBright += lum; else bottomBright += lum;
            if (col < w / 2) leftBright += lum; else rightBright += lum;

            // Edge
            if (col + step < w && row + step < h) {
                const iR = (row * w + col + step) * 4;
                const iD = ((row + step) * w + col) * 4;
                const lumR = (pixels[iR] + pixels[iR + 1] + pixels[iR + 2]) / 3;
                const lumD = (pixels[iD] + pixels[iD + 1] + pixels[iD + 2]) / 3;
                if (Math.abs(lum - lumR) + Math.abs(lum - lumD) > 20) edgeCount++;
            }

            // Skin tone
            if (pr > 95 && pg > 40 && pb > 20 && pr > pg && pr > pb && pr - Math.min(pg, pb) > 15 && Math.abs(pr - pg) > 15) skinCount++;
            sampleCount++;
        }
    }

    r = Math.round(r / sampleCount); g = Math.round(g / sampleCount); b = Math.round(b / sampleCount);
    bright = Math.round(bright / sampleCount);
    const half = sampleCount / 2;
    topBright = Math.round(topBright / half); bottomBright = Math.round(bottomBright / half);
    leftBright = Math.round(leftBright / half); rightBright = Math.round(rightBright / half);
    const edgePct = Math.round(edgeCount / sampleCount * 100);
    const skinPct = Math.round(skinCount / sampleCount * 100);
    const darkPct = Math.round(darkCount / sampleCount * 100);
    const brightPct = Math.round(brightCount / sampleCount * 100);
    const sat = Math.max(r, g, b) - Math.min(r, g, b);

    // Build description
    let lightDesc;
    if (bright > 200) lightDesc = 'very bright and well-lit';
    else if (bright > 150) lightDesc = 'bright and well-lit';
    else if (bright > 100) lightDesc = 'moderately lit';
    else if (bright > 50) lightDesc = 'dimly lit';
    else lightDesc = 'very dark';

    let colorDesc;
    if (sat < 30) {
        if (bright > 180) colorDesc = 'mostly white or very light tones';
        else if (bright < 60) colorDesc = 'mostly black or very dark tones';
        else colorDesc = 'mostly gray or neutral tones';
    } else if (r > g && r > b) colorDesc = 'warm red tones';
    else if (g > r && g > b) colorDesc = 'green tones';
    else if (b > r && b > g) colorDesc = 'cool blue tones';
    else if (r > 150 && g > 150) colorDesc = 'yellow tones';
    else colorDesc = 'mixed colors (avg RGB: ' + r + ', ' + g + ', ' + b + ')';

    let detailDesc;
    if (edgePct > 30) detailDesc = 'lots of detail, texture, or movement';
    else if (edgePct > 15) detailDesc = 'moderate detail';
    else if (edgePct > 5) detailDesc = 'a fairly smooth or simple scene';
    else detailDesc = 'very little detail — possibly a plain surface or close-up';

    let colorVarDesc;
    if (sat > 80) colorVarDesc = 'The colors are vivid and saturated.';
    else if (sat > 40) colorVarDesc = 'The colors are moderately varied.';
    else colorVarDesc = 'The colors appear muted or washed out.';

    let contrastDesc;
    if (darkPct > 40 && brightPct > 20) contrastDesc = 'high contrast with bright and dark areas';
    else if (darkPct > 60) contrastDesc = 'mostly dark with few bright spots';
    else if (brightPct > 60) contrastDesc = 'mostly bright with few dark spots';
    else contrastDesc = 'fairly even exposure';

    let lightDir = '';
    if (topBright - bottomBright > 30) lightDir += ' Light appears to come from above.';
    else if (bottomBright - topBright > 30) lightDir += ' The bottom half is brighter.';
    if (leftBright - rightBright > 30) lightDir += ' Light seems to come from the left.';
    else if (rightBright - leftBright > 30) lightDir += ' Light seems to come from the right.';

    let faceDesc = '';
    if (skinPct > 25) faceDesc = ' A person or face may be visible.';
    else if (skinPct > 10) faceDesc = ' Some skin tones are visible.';

    const description =
        'The scene appears ' + lightDesc + ' with ' + colorDesc + '. ' +
        'There is ' + detailDesc + '. ' +
        colorVarDesc + ' ' +
        'The image has ' + contrastDesc + '.' +
        lightDir + faceDesc;

    document.getElementById('image-description').innerHTML =
        '<strong>📷 Scene Analysis:</strong><br>' + description + '<br><br>' +
        '<small style="opacity:0.7">Free local analysis — no internet or API needed.</small>';

    // Read aloud
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(description);
    utter.rate = parseFloat(document.getElementById('rate-slider').value) || 0.9;
    utter.volume = parseFloat(document.getElementById('volume-slider').value) / 100 || 1;
    synth.speak(utter);
}

function stopDescriberCamera() {
    if (describerStream) { describerStream.getTracks().forEach(t => t.stop()); describerStream = null; }
    document.getElementById('describer-video').style.display = 'none';
    document.getElementById('start-describer-btn').style.display = 'inline-block';
    document.getElementById('capture-describe-btn').style.display = 'none';
    document.getElementById('pause-describe-btn').style.display = 'none';
    document.getElementById('stop-describer-btn').style.display = 'none';
    document.getElementById('image-description').textContent = 'Waiting for camera...';
}

window.addEventListener('load', loadCocoModel);