// ================================================
// CrossHand — Anti-Gravity Illusion Experience
// ================================================

import {
    FilesetResolver,
    HandLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs";

// ---- Constants ----
const HAND_CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
    [0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],
    [0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]
];
const TIPS = [4, 8, 12, 16, 20];

// Finger group colors for bridge lines
const BRIDGE_COLORS = [
    { r: 99, g: 102, b: 241 },   // Wrist — Indigo
    { r: 129, g: 140, b: 248 },  // Thumb — Light Indigo
    { r: 168, g: 85, b: 247 },   // Index — Purple
    { r: 217, g: 70, b: 239 },   // Middle — Fuchsia
    { r: 244, g: 63, b: 94 },    // Ring — Rose
    { r: 251, g: 146, b: 60 },   // Pinky — Orange
];

function getFingerGroup(i) {
    if (i === 0) return 0;
    if (i <= 4) return 1;
    if (i <= 8) return 2;
    if (i <= 12) return 3;
    if (i <= 16) return 4;
    return 5;
}
const CROSS_ENTER_MS = 300;
const CROSS_EXIT_MS = 500;
const MAX_PARTICLES = 120;

// ---- State ----
let handLandmarker = null, webcamRunning = false, lastVideoTime = -1;
let frameCount = 0, lastFpsTime = performance.now();
let crossIntensity = 0, isCrossed = false;
let crossStartTime = 0, uncrossStartTime = 0;
let crossMidpoint = { x: 0.5, y: 0.5 };
let ripples = [], particles = [];
let hasEverCrossed = false;

// Held object (planet / sun / moon)
let selectedPlanet = "none";
const heldSmooth = { x: 0.5, y: 0.5, scale: 1, angle: 0 };
const HELD_SMOOTH = 0.2;
const HELD_BASE_R = 0.11; // fraction of min(w,h)

/** Title + short description shown above the held object */
const CELESTIAL_INFO = {
    sun: {
        title: "Sun",
        desc: "A G-type main-sequence star: fusion in the core powers light and heat for the solar system.",
        type: "Star",
        radiusKm: 696340,
        gas: "Hydrogen, helium (plasma)",
        distanceFromEarth: "149.6 million km (1 AU)",
        color: "White-yellow"
    },
    moon: {
        title: "Moon",
        desc: "Earth’s natural satellite — airless, cratered, locked in synchronous rotation with our planet.",
        type: "Natural satellite",
        radiusKm: 1737.4,
        gas: "No substantial atmosphere (exosphere)",
        distanceFromEarth: "384,400 km (avg)",
        color: "Gray"
    },
    earth: {
        title: "Earth",
        desc: "The only known world with liquid oceans and life — a thin atmosphere blankets rock and water.",
        type: "Terrestrial planet",
        radiusKm: 6371,
        gas: "N₂, O₂, Ar, CO₂ (trace), H₂O vapor",
        distanceFromEarth: "0 km (home)",
        color: "Blue, white, green"
    },
    mars: {
        title: "Mars",
        desc: "The Red Planet: rusty dust, ancient volcanoes, and polar ice caps under a thin CO₂ sky.",
        type: "Terrestrial planet",
        radiusKm: 3389.5,
        gas: "CO₂, N₂, Ar (thin atmosphere)",
        distanceFromEarth: "54.6–401 million km (varies)",
        color: "Reddish-brown"
    },
    jupiter: {
        title: "Jupiter",
        desc: "Gas giant king: mostly hydrogen and helium, with a stormy cloud deck and a strong magnetic field.",
        type: "Gas giant",
        radiusKm: 69911,
        gas: "H₂, He; traces of CH₄, NH₃, H₂O",
        distanceFromEarth: "588–968 million km (varies)",
        color: "Cream, brown, orange"
    },
    saturn: {
        title: "Saturn",
        desc: "Famous for icy rings and low density — this gas giant hosts dozens of moons.",
        type: "Gas giant",
        radiusKm: 58232,
        gas: "H₂, He; traces of CH₄, NH₃",
        distanceFromEarth: "1.2–1.7 billion km (varies)",
        color: "Pale gold"
    },
    uranus: {
        title: "Uranus",
        desc: "An ice giant with a extreme tilt — methane in its atmosphere gives it a pale cyan-blue hue.",
        type: "Ice giant",
        radiusKm: 25362,
        gas: "H₂, He, CH₄",
        distanceFromEarth: "2.6–3.2 billion km (varies)",
        color: "Cyan"
    },
    neptune: {
        title: "Neptune",
        desc: "Windy ice giant at the edge of the classical planets — deep blue from methane absorption.",
        type: "Ice giant",
        radiusKm: 24622,
        gas: "H₂, He, CH₄",
        distanceFromEarth: "4.3–4.7 billion km (varies)",
        color: "Deep blue"
    },
    galaxy: {
        title: "Spiral galaxy",
        desc: "Billions of stars, gas, and dust in spiral arms — held together by gravity and dark matter.",
        type: "Galaxy",
        radiusKm: null,
        gas: "Stars + gas + dust + dark matter",
        distanceFromEarth: "Depends (e.g. Andromeda: ~2.5 million ly)",
        color: "Core glow with bluish arms"
    },
    meteors: {
        title: "Meteor shower",
        desc: "Meteors are debris burning in the atmosphere; showers occur when Earth crosses a comet’s dust trail.",
        type: "Atmospheric phenomenon",
        radiusKm: null,
        gas: "Ionized air + vaporized dust",
        distanceFromEarth: "In Earth’s upper atmosphere (~70–120 km altitude)",
        color: "White-yellow with orange trails"
    }
};

// ---- DOM ----
const $ = id => document.getElementById(id);
const loadingScreen = $("loading-screen");
const loadingStatus = $("loading-status");
const stage = $("stage");
const vignette = $("vignette");
const energyBorder = $("energy-border");
const hud = $("hud");
const webcam = $("webcam");
const spaceCanvas = $("space-canvas");
const canvas = $("fx-canvas");
const ctx = canvas.getContext("2d");
const fpsValue = $("fps-value");
const handsValue = $("hands-value");
const crossBadge = $("cross-badge");
const crossLabel = $("cross-label");
const hudPrompt = $("hud-prompt");
const hudLogo = $("hud-logo");
const infoRes = $("info-resolution");

// Right-side info panel
const infoPanel = $("info-panel");
const infoTitle = $("info-title");
const infoSubtitle = $("info-subtitle");
const infoType = $("info-type");
const infoRadius = $("info-radius");
const infoArea = $("info-area");
const infoGas = $("info-gas");
const infoDistance = $("info-distance");
const infoColor = $("info-color");
const infoDesc = $("info-desc");

const spaceCtx = spaceCanvas ? spaceCanvas.getContext("2d") : null;
let spaceStars = [];
let spaceShoots = [];

function fmtNumber(n) {
    if (n == null || !Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtKm(n) {
    if (n == null || !Number.isFinite(n)) return "—";
    return `${fmtNumber(n)} km`;
}

function fmtAreaKm2FromRadius(radiusKm) {
    if (radiusKm == null || !Number.isFinite(radiusKm)) return "—";
    const area = 4 * Math.PI * radiusKm * radiusKm;
    if (area >= 1e9) return `${(area / 1e9).toLocaleString(undefined, { maximumFractionDigits: 0 })} million km²`;
    if (area >= 1e6) return `${(area / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })} km²`;
    return `${area.toLocaleString(undefined, { maximumFractionDigits: 0 })} km²`;
}

function updateInfoPanel(planetKey) {
    if (!infoPanel) return;
    if (!planetKey || planetKey === "none") {
        infoPanel.style.display = "none";
        return;
    }
    const d = CELESTIAL_INFO[planetKey];
    if (!d) {
        infoPanel.style.display = "none";
        return;
    }
    infoPanel.style.display = "";
    infoTitle.textContent = d.title ?? "—";
    infoSubtitle.textContent = d.type ? `${d.type}` : "Celestial body";
    infoType.textContent = d.type ?? "—";
    infoRadius.textContent = fmtKm(d.radiusKm);
    infoArea.textContent = fmtAreaKm2FromRadius(d.radiusKm);
    infoGas.textContent = d.gas ?? "—";
    infoDistance.textContent = d.distanceFromEarth ?? "—";
    infoColor.textContent = d.color ?? "—";
    infoDesc.textContent = d.desc ?? "—";
}

function initSpaceOverlay(w, h) {
    if (!spaceCtx || !spaceCanvas) return;
    spaceCanvas.width = w;
    spaceCanvas.height = h;
    spaceStars = [];
    spaceShoots = [];
    const count = Math.floor(Math.min(520, Math.max(220, (w * h) / 5200)));
    for (let i = 0; i < count; i++) {
        spaceStars.push({
            x: Math.random() * w,
            y: Math.random() * h,
            z: Math.random() * 1,
            r: Math.random() * 1.6 + 0.2,
            tw: Math.random() * 0.9 + 0.1,
            hue: 210 + Math.random() * 60
        });
    }
}

function spawnShootingStar(w, h) {
    if (!spaceCtx) return;
    const startX = Math.random() * w * 0.6 + w * 0.2;
    const startY = Math.random() * h * 0.35 + h * 0.05;
    const ang = (Math.PI * (0.75 + Math.random() * 0.25));
    const sp = 1200 + Math.random() * 900;
    spaceShoots.push({
        x: startX,
        y: startY,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 0.7 + Math.random() * 0.6
    });
}

function drawSpaceOverlay(now, w, h) {
    if (!spaceCtx || !spaceCanvas) return;
    if (spaceCanvas.width !== w || spaceCanvas.height !== h) initSpaceOverlay(w, h);

    const t = now * 0.001;
    const drift = 6 + crossIntensity * 16;

    spaceCtx.clearRect(0, 0, w, h);

    // soft nebula wash
    const neb = spaceCtx.createRadialGradient(w * 0.3, h * 0.35, 0, w * 0.3, h * 0.35, Math.max(w, h) * 0.8);
    neb.addColorStop(0, `rgba(124, 58, 237, ${0.05 + crossIntensity * 0.06})`);
    neb.addColorStop(0.5, `rgba(6, 182, 212, ${0.02 + crossIntensity * 0.04})`);
    neb.addColorStop(1, "rgba(0,0,0,0)");
    spaceCtx.fillStyle = neb;
    spaceCtx.fillRect(0, 0, w, h);

    // stars
    for (const s of spaceStars) {
        s.y += (0.2 + s.z * 0.9) * drift * 0.16;
        s.x += Math.sin(t * 0.3 + s.z * 10) * 0.05;
        if (s.y > h + 5) { s.y = -5; s.x = Math.random() * w; }
        const a = 0.12 + s.tw * (0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * (0.8 + s.z) + s.x * 0.01)));
        spaceCtx.fillStyle = `hsla(${s.hue}, 80%, 85%, ${a})`;
        spaceCtx.beginPath();
        spaceCtx.arc(s.x, s.y, s.r * (0.7 + s.z * 0.7), 0, Math.PI * 2);
        spaceCtx.fill();
    }

    // occasional shooting stars
    if (Math.random() < (0.004 + crossIntensity * 0.006)) spawnShootingStar(w, h);
    spaceShoots = spaceShoots.filter(sh => {
        sh.life -= 0.016;
        sh.x += sh.vx * 0.016;
        sh.y += sh.vy * 0.016;
        const tx = sh.x - sh.vx * 0.018;
        const ty = sh.y - sh.vy * 0.018;
        const grad = spaceCtx.createLinearGradient(tx, ty, sh.x, sh.y);
        grad.addColorStop(0, "rgba(255, 255, 255, 0)");
        grad.addColorStop(0.2, "rgba(255, 240, 210, 0.25)");
        grad.addColorStop(1, "rgba(255, 255, 255, 0.75)");
        spaceCtx.strokeStyle = grad;
        spaceCtx.lineWidth = 2.2;
        spaceCtx.lineCap = "round";
        spaceCtx.beginPath();
        spaceCtx.moveTo(tx, ty);
        spaceCtx.lineTo(sh.x, sh.y);
        spaceCtx.stroke();
        return sh.life > 0 && sh.x > -200 && sh.x < w + 200 && sh.y > -200 && sh.y < h + 200;
    });
}

// ================================================
// Particle Class
// ================================================
class Particle {
    constructor(w, h, fromCross = false, cx = 0.5, cy = 0.5) {
        this.w = w; this.h = h;
        if (fromCross) {
            this.x = cx * w + (Math.random() - 0.5) * 160;
            this.y = cy * h + (Math.random() - 0.5) * 120;
            this.size = Math.random() * 3.5 + 1.5;
            this.opacity = Math.random() * 0.6 + 0.3;
            this.life = 1;
            this.decay = Math.random() * 0.008 + 0.003;
        } else {
            this.x = Math.random() * w;
            this.y = Math.random() * h;
            this.size = Math.random() * 2.5 + 0.5;
            this.opacity = Math.random() * 0.25 + 0.05;
            this.life = 1;
            this.decay = Math.random() * 0.001 + 0.0005;
        }
        this.vx = (Math.random() - 0.5) * 0.4;
        this.vy = Math.random() * 0.3 + 0.1; // default: fall down
        this.fromCross = fromCross;
        this.baseVy = this.vy;
        // Color: warm white / faint violet / soft blue
        const colors = [
            [230, 225, 255], [200, 200, 240], [180, 190, 255],
            [255, 255, 255], [167, 139, 250]
        ];
        this.color = colors[Math.floor(Math.random() * colors.length)];
    }

    update(intensity) {
        // Anti-gravity: reverse Y when crossing
        const gravityMult = 1 - intensity * 2; // 1 → -1
        this.vy = this.baseVy * gravityMult;
        if (this.fromCross) {
            this.vy = -Math.abs(this.baseVy) * (1 + intensity * 2);
            this.vx += (Math.random() - 0.5) * 0.1;
        }
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
        if (this.y < -20) this.y = this.h + 10;
        if (this.y > this.h + 20) this.y = -10;
        if (this.x < -20) this.x = this.w + 10;
        if (this.x > this.w + 20) this.x = -10;
        return this.life > 0;
    }

    draw(ctx) {
        const a = this.opacity * this.life;
        if (a < 0.01) return;
        const [r, g, b] = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.fill();
        // Glow for larger particles
        if (this.size > 2) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r},${g},${b},${a * 0.15})`;
            ctx.fill();
        }
    }
}

// ================================================
// Initialize particles
// ================================================
function initParticles(w, h) {
    particles = [];
    for (let i = 0; i < 60; i++) {
        particles.push(new Particle(w, h, false));
    }
}

// ================================================
// Ripple class
// ================================================
class Ripple {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.radius = 0; this.maxRadius = 400;
        this.life = 1; this.speed = 4;
    }
    update() {
        this.radius += this.speed;
        this.life = 1 - this.radius / this.maxRadius;
        return this.life > 0;
    }
    draw(ctx) {
        if (this.life <= 0) return;
        const a = this.life * 0.25;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(124, 58, 237, ${a})`;
        ctx.lineWidth = 2 * this.life;
        ctx.stroke();
        // Inner ring
        if (this.radius > 20) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 0.7, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(167, 139, 250, ${a * 0.5})`;
            ctx.lineWidth = 1 * this.life;
            ctx.stroke();
        }
    }
}

// ================================================
// Initialization
// ================================================
async function init() {
    try {
        loadingStatus.textContent = "Loading MediaPipe Vision module…";
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
        );

        loadingStatus.textContent = "Loading Hand Landmarker model…";
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        loadingStatus.textContent = "Requesting camera access…";
        await startWebcam();

        // Show the experience
        stage.style.display = "";
        vignette.style.display = "";
        hud.style.display = "";
        loadingScreen.classList.add("fade-out");
        setTimeout(() => { loadingScreen.style.display = "none"; }, 900);

    } catch (err) {
        console.error("Init failed:", err);
        loadingStatus.textContent = `Error: ${err.message}. Refresh and allow camera.`;
    }
}

async function startWebcam() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
    });
    webcam.srcObject = stream;
    webcamRunning = true;

    return new Promise(resolve => {
        webcam.onloadeddata = () => {
            canvas.width = webcam.videoWidth;
            canvas.height = webcam.videoHeight;
            infoRes.textContent = `${webcam.videoWidth}×${webcam.videoHeight}`;
            initSpaceOverlay(canvas.width, canvas.height);
            initParticles(canvas.width, canvas.height);
            updateInfoPanel(selectedPlanet);
            resolve();
            detectLoop();
        };
    });
}

// ================================================
// Main Loop
// ================================================
function detectLoop() {
    if (!webcamRunning || !handLandmarker) return;
    const now = performance.now();
    drawSpaceOverlay(now, canvas.width, canvas.height);

    if (webcam.currentTime !== lastVideoTime) {
        lastVideoTime = webcam.currentTime;
        const results = handLandmarker.detectForVideo(webcam, now);
        processResults(results, now);
    }

    // FPS
    frameCount++;
    if (now - lastFpsTime >= 1000) {
        fpsValue.textContent = frameCount;
        frameCount = 0;
        lastFpsTime = now;
    }

    requestAnimationFrame(detectLoop);
}

// ================================================
// Process Results & Cross Detection
// ================================================
function processResults(results, now) {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Mirror the canvas to match CSS mirrored video
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);

    const numHands = results.landmarks ? results.landmarks.length : 0;
    handsValue.textContent = numHands;

    let leftLM = null, rightLM = null;

    for (let i = 0; i < numHands; i++) {
        const hand = results.handednesses[i][0].categoryName;
        // MediaPipe: "Left" from camera = user's right hand (mirrored)
        if (hand === "Left") rightLM = results.landmarks[i];
        else leftLM = results.landmarks[i];
    }

    // Cross detection
    const wasCrossed = isCrossed;
    let rawCrossed = false;

    if (leftLM && rightLM) {
        // In mirrored coordinates, if left hand wrist.x < right hand wrist.x, hands are crossed
        const lx = leftLM[0].x, rx = rightLM[0].x;
        rawCrossed = lx > rx;

        // Also check MCP of middle finger for robustness
        const lmx = leftLM[9].x, rmx = rightLM[9].x;
        if (lmx > rmx) rawCrossed = true;

        // Compute midpoint for effects
        crossMidpoint.x = (leftLM[0].x + rightLM[0].x) / 2;
        crossMidpoint.y = (leftLM[0].y + rightLM[0].y) / 2;
    }

    // Hysteresis: require sustained crossing/uncrossing
    if (rawCrossed && !isCrossed) {
        if (crossStartTime === 0) crossStartTime = now;
        if (now - crossStartTime > CROSS_ENTER_MS) {
            isCrossed = true;
            uncrossStartTime = 0;
            // Spawn ripple
            ripples.push(new Ripple(crossMidpoint.x * w, crossMidpoint.y * h));
        }
    } else if (!rawCrossed && isCrossed) {
        if (uncrossStartTime === 0) uncrossStartTime = now;
        if (now - uncrossStartTime > CROSS_EXIT_MS) {
            isCrossed = false;
            crossStartTime = 0;
        }
    } else if (rawCrossed) {
        uncrossStartTime = 0;
    } else {
        crossStartTime = 0;
    }

    // Smooth intensity ramp
    const rampSpeed = isCrossed ? 0.03 : -0.02;
    crossIntensity = Math.max(0, Math.min(1, crossIntensity + rampSpeed));

    // Update UI
    updateHUD(isCrossed);

    if (selectedPlanet !== "none") {
        updateHeldObjectTransform(leftLM, rightLM, w, h, 1);
    }

    // ---- Drawing layers ----

    // 1. Hand skeletons
    if (leftLM) drawSkeleton(leftLM, "left", w, h);
    if (rightLM) drawSkeleton(rightLM, "right", w, h);

    // 2. Hand landmarks (dots)
    if (leftLM) drawLandmarkDots(leftLM, "left", w, h);
    if (rightLM) drawLandmarkDots(rightLM, "right", w, h);

    // 2.5. Bridge connections between corresponding landmarks
    if (leftLM && rightLM) {
        drawBridgeConnections(leftLM, rightLM, w, h);
    }

    // 2.6. Held sun / planet (follows hands — pinch or two-hand span)
    drawHeldObjectLayer(leftLM, rightLM, w, h, now);

    // 3. Energy field (when crossing)
    if (crossIntensity > 0.01 && leftLM && rightLM) {
        drawEnergyField(leftLM, rightLM, w, h, now);
    }

    // 4. Ripples
    ripples = ripples.filter(r => { r.draw(ctx); return r.update(); });

    // 5. Continuous subtle ripples while crossed
    if (isCrossed && Math.random() < 0.03) {
        ripples.push(new Ripple(
            crossMidpoint.x * w + (Math.random() - 0.5) * 60,
            crossMidpoint.y * h + (Math.random() - 0.5) * 60
        ));
    }

    ctx.restore(); // un-mirror

    // 6. Particles (drawn in screen space, not mirrored)
    updateAndDrawParticles(w, h);

    // 7. Spawn cross particles
    if (isCrossed && particles.length < MAX_PARTICLES && Math.random() < 0.3) {
        particles.push(new Particle(w, h, true, crossMidpoint.x, crossMidpoint.y));
    }

    // 8. Vignette canvas overlay
    drawVignetteCanvas(w, h);

    drawHeldCaptionScreen(w, h, leftLM, rightLM);

    // First time crossing
    if (isCrossed && !hasEverCrossed) {
        hasEverCrossed = true;
    }
}

// ================================================
// HUD Updates
// ================================================
function updateHUD(crossed) {
    if (crossed) {
        crossBadge.classList.add("active");
        crossLabel.textContent = "Crossed";
        hudLogo.classList.add("active");
        vignette.classList.add("intensified");
        energyBorder.classList.add("active");
        if (hasEverCrossed) hudPrompt.classList.add("hidden");
    } else {
        crossBadge.classList.remove("active");
        crossLabel.textContent = "Standby";
        hudLogo.classList.remove("active");
        vignette.classList.remove("intensified");
        energyBorder.classList.remove("active");
    }
}

// ================================================
// Drawing: Skeleton
// ================================================
function drawSkeleton(landmarks, hand, w, h) {
    const intensity = crossIntensity;
    // Blend color toward unified violet when crossing
    let r, g, b;
    if (hand === "left") {
        r = lerp(99, 124, intensity);
        g = lerp(102, 58, intensity);
        b = lerp(241, 237, intensity);
    } else {
        r = lerp(244, 124, intensity);
        g = lerp(63, 58, intensity);
        b = lerp(94, 237, intensity);
    }

    ctx.strokeStyle = `rgba(${r|0},${g|0},${b|0},0.6)`;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";

    for (const [s, e] of HAND_CONNECTIONS) {
        const p1 = landmarks[s], p2 = landmarks[e];
        ctx.beginPath();
        ctx.moveTo(p1.x * w, p1.y * h);
        ctx.lineTo(p2.x * w, p2.y * h);
        ctx.stroke();
    }
}

// ================================================
// Drawing: Landmark Dots
// ================================================
function drawLandmarkDots(landmarks, hand, w, h) {
    const isLeft = hand === "left";
    const intensity = crossIntensity;
    let br, bg, bb;
    if (isLeft) {
        br = lerp(99, 124, intensity); bg = lerp(102, 58, intensity); bb = lerp(241, 237, intensity);
    } else {
        br = lerp(244, 124, intensity); bg = lerp(63, 58, intensity); bb = lerp(94, 237, intensity);
    }

    for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i];
        const x = lm.x * w, y = lm.y * h;
        const isTip = TIPS.includes(i);
        const rad = isTip ? 6 : 3;

        // Glow for tips
        if (isTip) {
            ctx.beginPath();
            ctx.arc(x, y, rad + 8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${br|0},${bg|0},${bb|0},${0.15 + intensity * 0.15})`;
            ctx.fill();
        }

        // Dot
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${br|0},${bg|0},${bb|0},0.9)`;
        ctx.fill();

        // White core
        ctx.beginPath();
        ctx.arc(x, y, isTip ? 2 : 1, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fill();
    }
}

// ================================================
// Drawing: Bridge Connections
// ================================================
function drawBridgeConnections(leftLM, rightLM, w, h) {
    const opacity = 0.55 + crossIntensity * 0.2;

    for (let i = 0; i < 21; i++) {
        const lm1 = leftLM[i];
        const lm2 = rightLM[i];
        const x1 = lm1.x * w, y1 = lm1.y * h;
        const x2 = lm2.x * w, y2 = lm2.y * h;

        const group = getFingerGroup(i);
        const color = BRIDGE_COLORS[group];
        const isTip = TIPS.includes(i);

        // Gradient along the line: left-hand indigo → bridge color → right-hand rose
        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, `rgba(99, 102, 241, ${opacity})`);
        grad.addColorStop(0.5, `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity * 0.8})`);
        grad.addColorStop(1, `rgba(244, 63, 94, ${opacity})`);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = grad;
        ctx.lineWidth = isTip ? 2.5 : 1.2;
        ctx.setLineDash(isTip ? [] : [5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Midpoint node for tip connections
        if (isTip) {
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            ctx.beginPath();
            ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.8})`;
            ctx.fill();
        }
    }
}

// ================================================
// Drawing: Energy Field
// ================================================
function drawEnergyField(leftLM, rightLM, w, h, now) {
    const ci = crossIntensity;
    const mx = crossMidpoint.x * w;
    const my = crossMidpoint.y * h;

    // Pulsing orb
    const pulse = Math.sin(now * 0.004) * 0.15 + 1;
    const orbRadius = 30 * ci * pulse;

    // Radial gradient orb
    if (orbRadius > 2) {
        const grad = ctx.createRadialGradient(mx, my, 0, mx, my, orbRadius * 2.5);
        grad.addColorStop(0, `rgba(167, 139, 250, ${ci * 0.5})`);
        grad.addColorStop(0.3, `rgba(124, 58, 237, ${ci * 0.3})`);
        grad.addColorStop(0.6, `rgba(99, 102, 241, ${ci * 0.12})`);
        grad.addColorStop(1, `rgba(99, 102, 241, 0)`);
        ctx.beginPath();
        ctx.arc(mx, my, orbRadius * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Bright core
        const coreGrad = ctx.createRadialGradient(mx, my, 0, mx, my, orbRadius * 0.6);
        coreGrad.addColorStop(0, `rgba(255, 255, 255, ${ci * 0.6})`);
        coreGrad.addColorStop(1, `rgba(167, 139, 250, 0)`);
        ctx.beginPath();
        ctx.arc(mx, my, orbRadius * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = coreGrad;
        ctx.fill();
    }

    // Energy tendrils from fingertips to orb center
    if (ci > 0.3) {
        const tendrilAlpha = (ci - 0.3) / 0.7; // 0→1 as ci goes 0.3→1
        ctx.lineWidth = 1.2;
        ctx.lineCap = "round";

        for (const hand of [leftLM, rightLM]) {
            for (const tipIdx of TIPS) {
                const tip = hand[tipIdx];
                const tx = tip.x * w, ty = tip.y * h;

                // Curved tendril via quadratic bezier
                const cpx = (tx + mx) / 2 + Math.sin(now * 0.003 + tipIdx) * 20 * ci;
                const cpy = (ty + my) / 2 + Math.cos(now * 0.002 + tipIdx) * 15 * ci;

                ctx.beginPath();
                ctx.moveTo(tx, ty);
                ctx.quadraticCurveTo(cpx, cpy, mx, my);
                ctx.strokeStyle = `rgba(167, 139, 250, ${tendrilAlpha * 0.35})`;
                ctx.stroke();

                // Glow at fingertip
                ctx.beginPath();
                ctx.arc(tx, ty, 4 * ci, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(167, 139, 250, ${tendrilAlpha * 0.3})`;
                ctx.fill();
            }
        }
    }

    // Rotating scanline / energy ring
    if (ci > 0.15) {
        const angle = now * 0.001;
        const ringR = orbRadius * 2;
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, ringR, ringR * 0.3, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(124, 58, 237, ${ci * 0.2})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        // Second ring perpendicular
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(-angle * 0.7);
        ctx.beginPath();
        ctx.ellipse(0, 0, ringR * 0.8, ringR * 0.25, Math.PI * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(6, 182, 212, ${ci * 0.12})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.restore();
    }
}

// ================================================
// Drawing: Particles
// ================================================
function updateAndDrawParticles(w, h) {
    particles = particles.filter(p => {
        p.draw(ctx);
        return p.update(crossIntensity);
    });
}

// ================================================
// Drawing: Vignette (canvas-based enhancement)
// ================================================
function drawVignetteCanvas(w, h) {
    if (crossIntensity < 0.01) return;
    // Subtle violet tint at edges when crossing
    const ci = crossIntensity;
    const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.7);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(20, 5, 40, ${ci * 0.15})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
}

// ================================================
// Utility
// ================================================
function lerp(a, b, t) { return a + (b - a) * t; }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function mapRange(v, inMin, inMax, outMin, outMax) {
    if (inMax <= inMin) return outMin;
    return outMin + (clamp(v, inMin, inMax) - inMin) * (outMax - outMin) / (inMax - inMin);
}

function lerpAngle(a, b, t) {
    const twoPi = Math.PI * 2;
    let d = ((((b - a) % twoPi) + twoPi * 1.5) % twoPi) - Math.PI;
    return a + d * t;
}

function palmCenter(lm) {
    const ids = [0, 5, 9, 17];
    let sx = 0, sy = 0;
    for (const id of ids) {
        sx += lm[id].x;
        sy += lm[id].y;
    }
    return { x: sx / ids.length, y: sy / ids.length };
}

function pinchDistance(lm) {
    return Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
}

function twoHandIndexSpan(leftLM, rightLM) {
    return Math.hypot(
        leftLM[8].x - rightLM[8].x,
        leftLM[8].y - rightLM[8].y
    );
}

function oneHandAngle(lm) {
    return Math.atan2(lm[9].y - lm[0].y, lm[9].x - lm[0].x);
}

function twoHandAngle(leftLM, rightLM) {
    return Math.atan2(
        rightLM[0].y - leftLM[0].y,
        rightLM[0].x - leftLM[0].x
    );
}

// ================================================
// Held celestial body — canvas drawing (procedural)
// ================================================
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a += 0x6d2b79f5;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function drawDiskGradient(ctx, r, lightX, lightY, stops) {
    const g = ctx.createRadialGradient(lightX * r, lightY * r, 0, 0, 0, r);
    for (const [pos, col] of stops) g.addColorStop(pos, col);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
}

function drawHeldCelestial(planet, cx, cy, radius, angleRad, now = 0) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angleRad);
    const r = radius;

    const drawSphere = grad => {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
    };

    switch (planet) {
        case "sun": {
            const corona = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.4);
            corona.addColorStop(0, "rgba(255, 240, 200, 0.45)");
            corona.addColorStop(0.25, "rgba(255, 180, 80, 0.22)");
            corona.addColorStop(0.55, "rgba(255, 120, 40, 0.08)");
            corona.addColorStop(1, "rgba(255, 80, 20, 0)");
            ctx.beginPath();
            ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
            ctx.fillStyle = corona;
            ctx.fill();

            const g = ctx.createRadialGradient(-r * 0.38, -r * 0.38, r * 0.05, 0, 0, r * 1.05);
            g.addColorStop(0, "rgba(255, 255, 245, 1)");
            g.addColorStop(0.15, "rgba(255, 248, 200, 1)");
            g.addColorStop(0.45, "rgba(255, 210, 100, 0.98)");
            g.addColorStop(0.75, "rgba(255, 150, 50, 0.85)");
            g.addColorStop(1, "rgba(200, 80, 20, 0.25)");
            drawSphere(g);

            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.98, 0, Math.PI * 2);
            ctx.clip();
            const gran = mulberry32(99);
            for (let i = 0; i < 55; i++) {
                const gx = (gran() - 0.5) * r * 1.9;
                const gy = (gran() - 0.5) * r * 1.9;
                if (gx * gx + gy * gy > r * r * 0.85) continue;
                ctx.beginPath();
                ctx.arc(gx, gy, r * (0.02 + gran() * 0.035), 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 200, 100, ${0.08 + gran() * 0.12})`;
                ctx.fill();
            }
            ctx.restore();

            ctx.beginPath();
            ctx.arc(0, 0, r * 1.12, 0, Math.PI * 2);
            const limb = ctx.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.3, 0, 0, r * 1.1);
            limb.addColorStop(0, "rgba(255, 220, 120, 0)");
            limb.addColorStop(1, "rgba(255, 100, 30, 0.35)");
            ctx.fillStyle = limb;
            ctx.fill();
            break;
        }
        case "moon": {
            drawDiskGradient(ctx, r, -0.42, -0.38, [
                [0, "rgba(235, 235, 240, 1)"],
                [0.35, "rgba(170, 172, 185, 0.98)"],
                [0.72, "rgba(110, 112, 125, 0.95)"],
                [1, "rgba(55, 58, 68, 0.92)"]
            ]);
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.99, 0, Math.PI * 2);
            ctx.clip();
            const cr = mulberry32(44021);
            for (let i = 0; i < 38; i++) {
                const a = cr() * Math.PI * 2;
                const dist = cr() * 0.72 * r;
                const cx0 = Math.cos(a) * dist;
                const cy0 = Math.sin(a) * dist;
                const rad = r * (0.04 + cr() * 0.12);
                const cg = ctx.createRadialGradient(cx0 - rad * 0.3, cy0 - rad * 0.3, 0, cx0, cy0, rad);
                cg.addColorStop(0, "rgba(60, 62, 72, 0.5)");
                cg.addColorStop(0.55, "rgba(45, 48, 58, 0.35)");
                cg.addColorStop(1, "rgba(90, 92, 105, 0)");
                ctx.beginPath();
                ctx.arc(cx0, cy0, rad, 0, Math.PI * 2);
                ctx.fillStyle = cg;
                ctx.fill();
            }
            ctx.fillStyle = "rgba(75, 78, 92, 0.25)";
            ctx.beginPath();
            ctx.ellipse(-r * 0.35, r * 0.2, r * 0.45, r * 0.35, 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            break;
        }
        case "earth": {
            const ocean = ctx.createRadialGradient(-r * 0.48, -r * 0.42, r * 0.1, 0, 0, r);
            ocean.addColorStop(0, "rgba(120, 200, 255, 1)");
            ocean.addColorStop(0.4, "rgba(40, 110, 200, 0.98)");
            ocean.addColorStop(0.75, "rgba(25, 75, 160, 0.95)");
            ocean.addColorStop(1, "rgba(12, 40, 100, 0.92)");
            drawSphere(ocean);

            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.98, 0, Math.PI * 2);
            ctx.clip();
            const land = [
                ["rgba(55, 130, 75, 0.82)", -0.25, 0.1, 0.42, 0.28, 0.25],
                ["rgba(95, 120, 65, 0.75)", 0.35, -0.15, 0.38, 0.22, -0.35],
                ["rgba(130, 110, 70, 0.55)", 0.1, 0.35, 0.25, 0.18, 0.1],
                ["rgba(45, 100, 60, 0.7)", -0.4, -0.2, 0.3, 0.2, 0.5],
                ["rgba(160, 140, 90, 0.45)", 0.15, -0.38, 0.22, 0.15, -0.2]
            ];
            for (const [col, px, py, rx, ry, rot] of land) {
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.ellipse(px * r, py * r, rx * r, ry * r, rot, 0, Math.PI * 2);
                ctx.fill();
            }
            const cl = mulberry32(777);
            for (let i = 0; i < 18; i++) {
                ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + cl() * 0.2})`;
                ctx.beginPath();
                ctx.ellipse((cl() - 0.5) * r * 1.6, (cl() - 0.5) * r * 1.6, r * (0.08 + cl() * 0.1), r * (0.04 + cl() * 0.05), cl() * Math.PI, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();

            ctx.beginPath();
            ctx.arc(0, 0, r * 1.02, 0, Math.PI * 2);
            const atm = ctx.createRadialGradient(0, 0, r * 0.85, 0, 0, r * 1.15);
            atm.addColorStop(0, "rgba(120, 200, 255, 0)");
            atm.addColorStop(0.85, "rgba(100, 180, 255, 0)");
            atm.addColorStop(1, "rgba(180, 220, 255, 0.35)");
            ctx.strokeStyle = "rgba(150, 210, 255, 0.4)";
            ctx.lineWidth = Math.max(1.5, r * 0.04);
            ctx.stroke();
            break;
        }
        case "mars": {
            drawDiskGradient(ctx, r, -0.36, -0.34, [
                [0, "rgba(240, 150, 110, 1)"],
                [0.45, "rgba(190, 90, 55, 0.97)"],
                [0.78, "rgba(140, 55, 40, 0.94)"],
                [1, "rgba(85, 35, 28, 0.9)"]
            ]);
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.98, 0, Math.PI * 2);
            ctx.clip();
            ctx.fillStyle = "rgba(60, 35, 30, 0.35)";
            ctx.beginPath();
            ctx.ellipse(-r * 0.15, r * 0.25, r * 0.5, r * 0.35, 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "rgba(220, 200, 160, 0.5)";
            ctx.beginPath();
            ctx.arc(r * 0.35, -r * 0.2, r * 0.12, 0, Math.PI * 2);
            ctx.fill();
            const mr = mulberry32(31337);
            for (let i = 0; i < 22; i++) {
                const a = mr() * Math.PI * 2;
                const d = mr() * 0.65 * r;
                ctx.fillStyle = `rgba(50, 28, 22, ${0.2 + mr() * 0.25})`;
                ctx.beginPath();
                ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.03 + mr() * 0.06), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
            break;
        }
        case "jupiter": {
            const base = ctx.createRadialGradient(-r * 0.42, -r * 0.4, 0, 0, 0, r);
            base.addColorStop(0, "rgba(235, 215, 185, 1)");
            base.addColorStop(0.55, "rgba(190, 155, 120, 0.96)");
            base.addColorStop(1, "rgba(130, 95, 70, 0.92)");
            drawSphere(base);

            const bands = [
                ["rgba(210, 175, 135, 0.9)", -0.88],
                ["rgba(165, 125, 95, 0.85)", -0.62],
                ["rgba(225, 200, 165, 0.88)", -0.35],
                ["rgba(175, 140, 105, 0.82)", -0.08],
                ["rgba(215, 185, 145, 0.9)", 0.18],
                ["rgba(155, 120, 90, 0.8)", 0.42],
                ["rgba(185, 150, 115, 0.78)", 0.68]
            ];
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.99, 0, Math.PI * 2);
            ctx.clip();
            for (const [col, ny] of bands) {
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.ellipse(0, ny * r, r * 0.99, r * 0.11, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.strokeStyle = "rgba(120, 90, 65, 0.25)";
            ctx.lineWidth = 1;
            for (let y = -0.9; y < 0.9; y += 0.18) {
                ctx.beginPath();
                ctx.ellipse(0, y * r, r * 0.98, r * 0.04, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
            const spot = ctx.createRadialGradient(r * 0.28, r * 0.12, 0, r * 0.28, r * 0.12, r * 0.28);
            spot.addColorStop(0, "rgba(190, 110, 75, 0.9)");
            spot.addColorStop(0.55, "rgba(170, 95, 65, 0.5)");
            spot.addColorStop(1, "rgba(170, 95, 65, 0)");
            ctx.fillStyle = spot;
            ctx.beginPath();
            ctx.ellipse(r * 0.28, r * 0.12, r * 0.26, r * 0.2, 0.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            break;
        }
        case "saturn": {
            const ringLayers = [
                [1.78, "rgba(160, 140, 110, 0.45)", 0.06],
                [1.58, "rgba(210, 185, 140, 0.65)", 0.1],
                [1.42, "rgba(120, 100, 80, 0.55)", 0.08],
                [1.22, "rgba(200, 175, 130, 0.5)", 0.07]
            ];
            ctx.save();
            ctx.scale(1, 0.41);
            for (const [rad, col, lw] of ringLayers) {
                ctx.strokeStyle = col;
                ctx.lineWidth = lw / 0.41;
                ctx.beginPath();
                ctx.ellipse(0, 0, r * rad, r * rad, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();

            const g = ctx.createRadialGradient(-r * 0.38, -r * 0.36, 0, 0, 0, r);
            g.addColorStop(0, "rgba(235, 210, 175, 1)");
            g.addColorStop(0.35, "rgba(210, 180, 140, 0.97)");
            g.addColorStop(0.65, "rgba(175, 145, 110, 0.94)");
            g.addColorStop(1, "rgba(130, 105, 80, 0.9)");
            drawSphere(g);

            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.99, 0, Math.PI * 2);
            ctx.clip();
            for (let y = -0.75; y < 0.75; y += 0.22) {
                ctx.strokeStyle = `rgba(100, 80, 60, ${0.12 + Math.abs(y) * 0.08})`;
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.ellipse(0, y * r, r * 0.98, r * 0.06, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();

            ctx.save();
            ctx.scale(1, 0.41);
            ctx.strokeStyle = "rgba(230, 200, 155, 0.35)";
            ctx.lineWidth = (r * 0.06) / 0.41;
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 1.68, r * 1.68, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            break;
        }
        case "uranus": {
            const g = ctx.createRadialGradient(-r * 0.42, -r * 0.38, r * 0.08, 0, 0, r);
            g.addColorStop(0, "rgba(200, 245, 255, 1)");
            g.addColorStop(0.35, "rgba(130, 210, 230, 0.98)");
            g.addColorStop(0.65, "rgba(70, 160, 195, 0.95)");
            g.addColorStop(1, "rgba(35, 90, 120, 0.92)");
            drawSphere(g);
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.99, 0, Math.PI * 2);
            ctx.clip();
            ctx.globalAlpha = 0.35;
            for (let y = -0.85; y < 0.85; y += 0.14) {
                ctx.fillStyle = `rgba(40, 100, 130, ${0.08 + (y * y) / 2})`;
                ctx.beginPath();
                ctx.ellipse(0, y * r, r * 0.99, r * 0.045, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.restore();
            ctx.strokeStyle = "rgba(180, 230, 255, 0.25)";
            ctx.lineWidth = Math.max(1, r * 0.025);
            ctx.beginPath();
            ctx.arc(0, 0, r * 1.02, 0, Math.PI * 2);
            ctx.stroke();
            break;
        }
        case "neptune": {
            const g = ctx.createRadialGradient(-r * 0.45, -r * 0.4, 0, 0, 0, r);
            g.addColorStop(0, "rgba(150, 210, 255, 1)");
            g.addColorStop(0.35, "rgba(60, 120, 220, 0.97)");
            g.addColorStop(0.7, "rgba(25, 65, 180, 0.95)");
            g.addColorStop(1, "rgba(12, 35, 95, 0.92)");
            drawSphere(g);
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.99, 0, Math.PI * 2);
            ctx.clip();
            const spot = ctx.createRadialGradient(-r * 0.25, r * 0.35, 0, -r * 0.2, r * 0.38, r * 0.22);
            spot.addColorStop(0, "rgba(30, 50, 120, 0.65)");
            spot.addColorStop(1, "rgba(30, 50, 120, 0)");
            ctx.fillStyle = spot;
            ctx.beginPath();
            ctx.ellipse(-r * 0.2, r * 0.38, r * 0.22, r * 0.14, -0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(160, 200, 255, 0.35)";
            ctx.lineWidth = 1.2;
            for (let i = -2; i <= 2; i++) {
                ctx.beginPath();
                ctx.ellipse(0, i * r * 0.18, r * 0.94, r * 0.045 + i * 0.01, 0.08 * i, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
            break;
        }
        case "galaxy": {
            const gBg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.15);
            gBg.addColorStop(0, "rgba(40, 20, 60, 1)");
            gBg.addColorStop(0.5, "rgba(15, 8, 35, 1)");
            gBg.addColorStop(1, "rgba(5, 2, 15, 1)");
            drawSphere(gBg);

            const arms = mulberry32(9001);
            for (let arm = 0; arm < 2; arm++) {
                const sign = arm === 0 ? 1 : -1;
                for (let i = 0; i < 120; i++) {
                    const t = i / 40;
                    const ang = sign * t * 2.8 + arm * Math.PI;
                    const dist = r * (0.08 + t * 0.85);
                    const px = Math.cos(ang) * dist;
                    const py = Math.sin(ang) * dist * 0.55;
                    const sz = r * (0.008 + arms() * 0.025);
                    ctx.fillStyle = `rgba(${Math.floor(180 + arms() * 75)}, ${Math.floor(120 + arms() * 80)}, ${Math.floor(200 + arms() * 55)}, ${0.15 + arms() * 0.5})`;
                    ctx.beginPath();
                    ctx.arc(px, py, sz, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.35);
            core.addColorStop(0, "rgba(255, 250, 230, 0.95)");
            core.addColorStop(0.4, "rgba(255, 200, 160, 0.5)");
            core.addColorStop(1, "rgba(255, 160, 120, 0)");
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = core;
            ctx.fill();

            const st = mulberry32(4242);
            for (let i = 0; i < 280; i++) {
                const a = st() * Math.PI * 2;
                const d = Math.sqrt(st()) * r * 0.95;
                const br = 0.3 + st() * 0.7;
                ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + st() * 0.55})`;
                ctx.beginPath();
                ctx.arc(Math.cos(a) * d, Math.sin(a) * d * 0.65, r * (0.003 + st() * 0.012), 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2);
            const halo = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.1);
            halo.addColorStop(0, "rgba(120, 80, 200, 0)");
            halo.addColorStop(0.7, "rgba(80, 40, 140, 0.15)");
            halo.addColorStop(1, "rgba(20, 10, 50, 0.45)");
            ctx.fillStyle = halo;
            ctx.fill();
            break;
        }
        case "meteors": {
            const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.25);
            core.addColorStop(0, "rgba(255, 255, 255, 1)");
            core.addColorStop(0.4, "rgba(255, 220, 180, 0.6)");
            core.addColorStop(1, "rgba(255, 160, 80, 0)");
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
            ctx.fillStyle = core;
            ctx.fill();

            const phase = now * 0.0022;
            for (let i = 0; i < 48; i++) {
                const base = (i / 48) * Math.PI * 2 + phase + Math.sin(i * 0.7) * 0.15;
                const len = r * (0.5 + (i % 7) * 0.08);
                const w0 = r * (0.04 + (i % 5) * 0.015);
                const x1 = Math.cos(base) * len;
                const y1 = Math.sin(base) * len * 0.85;
                const grad = ctx.createLinearGradient(0, 0, x1, y1);
                grad.addColorStop(0, `rgba(255, 240, 200, ${0.85 - (i % 8) * 0.05})`);
                grad.addColorStop(0.35, "rgba(255, 180, 100, 0.45)");
                grad.addColorStop(1, "rgba(255, 120, 60, 0)");
                ctx.strokeStyle = grad;
                ctx.lineWidth = w0;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(Math.cos(base) * r * 0.12, Math.sin(base) * r * 0.1);
                ctx.lineTo(x1, y1);
                ctx.stroke();
            }

            const rockRng = mulberry32(8888);
            for (let i = 0; i < 12; i++) {
                const a = rockRng() * Math.PI * 2;
                const d = r * (0.35 + rockRng() * 0.65);
                ctx.fillStyle = `rgba(90, 70, 60, ${0.35 + rockRng() * 0.4})`;
                ctx.beginPath();
                ctx.ellipse(Math.cos(a) * d, Math.sin(a) * d * 0.9, r * 0.04, r * 0.06, a, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2);
            const amb = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r);
            amb.addColorStop(0, "rgba(255, 200, 120, 0.15)");
            amb.addColorStop(1, "rgba(80, 40, 20, 0)");
            ctx.fillStyle = amb;
            ctx.fill();
            break;
        }
        default:
            break;
    }

    ctx.restore();
}

function updateHeldObjectTransform(leftLM, rightLM, w, h, dtFactor = 1) {
    const t = HELD_SMOOTH * dtFactor;
    let tx = heldSmooth.x;
    let ty = heldSmooth.y;
    let ts = 1;
    let ta = heldSmooth.angle;

    if (leftLM && rightLM) {
        const pcL = palmCenter(leftLM);
        const pcR = palmCenter(rightLM);
        tx = (pcL.x + pcR.x) / 2;
        ty = (pcL.y + pcR.y) / 2;
        const span = twoHandIndexSpan(leftLM, rightLM);
        ts = mapRange(span, 0.07, 0.52, 0.4, 2.6);
        ta = twoHandAngle(leftLM, rightLM);
    } else if (leftLM || rightLM) {
        const lm = leftLM || rightLM;
        const pc = palmCenter(lm);
        tx = pc.x;
        ty = pc.y;
        const pd = pinchDistance(lm);
        ts = mapRange(pd, 0.028, 0.26, 0.45, 2.8);
        ta = oneHandAngle(lm);
    }

    heldSmooth.x = lerp(heldSmooth.x, tx, t);
    heldSmooth.y = lerp(heldSmooth.y, ty, t);
    heldSmooth.scale = lerp(heldSmooth.scale, ts, t);
    heldSmooth.angle = lerpAngle(heldSmooth.angle, ta, t);
}

function drawHeldObjectLayer(leftLM, rightLM, w, h, now) {
    if (selectedPlanet === "none") return;
    if (!leftLM && !rightLM) return;

    const base = Math.min(w, h) * HELD_BASE_R;
    const r = base * heldSmooth.scale;
    const cx = heldSmooth.x * w;
    const cy = heldSmooth.y * h;

    drawHeldCelestial(selectedPlanet, cx, cy, r, heldSmooth.angle, now);
}

/** Readable title + description above the held object (screen space, after mirror restore) */
function drawHeldCaptionScreen(w, h, leftLM, rightLM) {
    if (selectedPlanet === "none" || (!leftLM && !rightLM)) return;
    const info = CELESTIAL_INFO[selectedPlanet];
    if (!info) return;

    const base = Math.min(w, h) * HELD_BASE_R;
    const r = base * heldSmooth.scale;
    const cx = w - heldSmooth.x * w;
    const cy = heldSmooth.y * h;
    const gap = Math.max(10, r * 0.15);
    const maxW = Math.min(340, w * 0.88);

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    const title = info.title;
    const desc = info.desc;
    ctx.font = "600 13px Inter, system-ui, sans-serif";
    const titleW = ctx.measureText(title).width;
    ctx.font = "400 11px Inter, system-ui, sans-serif";
    const words = desc.split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width <= maxW) line = test;
        else {
            if (line) lines.push(line);
            line = word;
        }
    }
    if (line) lines.push(line);

    const lineH = 14;
    const padX = 14;
    const padY = 10;
    const titleBlock = 18;
    const innerW = Math.max(maxW, Math.min(titleW, w * 0.9));
    const boxW = innerW + padX * 2;
    const boxH = padY * 2 + titleBlock + lines.length * lineH;
    // Place caption BELOW the object so it doesn't cover faces.
    // Clamp so it stays on-screen.
    let top = cy + r + gap;
    if (top + boxH > h - 8) top = Math.max(8, h - 8 - boxH);

    let bx = cx - boxW / 2;
    if (bx < 8) bx = 8;
    if (bx + boxW > w - 8) bx = w - 8 - boxW;
    const by = top;

    const rr = 10;
    ctx.beginPath();
    ctx.moveTo(bx + rr, by);
    ctx.lineTo(bx + boxW - rr, by);
    ctx.quadraticCurveTo(bx + boxW, by, bx + boxW, by + rr);
    ctx.lineTo(bx + boxW, by + boxH - rr);
    ctx.quadraticCurveTo(bx + boxW, by + boxH, bx + boxW - rr, by + boxH);
    ctx.lineTo(bx + rr, by + boxH);
    ctx.quadraticCurveTo(bx, by + boxH, bx, by + boxH - rr);
    ctx.lineTo(bx, by + rr);
    ctx.quadraticCurveTo(bx, by, bx + rr, by);
    ctx.closePath();
    ctx.fillStyle = "rgba(8, 8, 16, 0.82)";
    ctx.fill();
    ctx.strokeStyle = "rgba(124, 58, 237, 0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#e8e8f0";
    ctx.font = "600 13px Inter, system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(title, cx, by + padY + 2);

    ctx.fillStyle = "rgba(180, 180, 200, 0.95)";
    ctx.font = "400 11px Inter, system-ui, sans-serif";
    let ly = by + padY + titleBlock;
    for (const ln of lines) {
        ctx.fillText(ln, cx, ly);
        ly += lineH;
    }
    ctx.restore();
}

// ================================================
// Planet picker
// ================================================
function setupPlanetPicker() {
    const picker = $("planet-picker");
    if (!picker) return;
    picker.addEventListener("click", e => {
        const btn = e.target.closest(".planet-btn");
        if (!btn) return;
        const p = btn.dataset.planet;
        if (!p) return;
        selectedPlanet = p;
        picker.querySelectorAll(".planet-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        heldSmooth.scale = 1;
        heldSmooth.angle = 0;
        updateInfoPanel(selectedPlanet);
    });
}

setupPlanetPicker();

// ================================================
// Boot
// ================================================
init();
