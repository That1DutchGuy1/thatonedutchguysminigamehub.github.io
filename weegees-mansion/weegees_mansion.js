const isMobile = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 600;

const FLOOR_COUNT = 5;
const CELL = 4;
const MAZE_W = 8;
const MAZE_H = 8;

let scene, camera, renderer, clock;
let player = { x: 2, z: 2, yaw: 0, pitch: 0, floor: 0 };
let weegee = { x: 6, z: 6, floor: 0, mesh: null, visible: false, peeking: false, peekTimer: 0, teleportTimer: 0, teleportCooldown: 20, state: 'wander', targetCellX: null, targetCellZ: null, dirX: 0, dirZ: -1 };
let keys = {};
let isDead = false, gameStarted = false, isPaused = false;
let currentFloor = 0;
let floorMeshes = [];
let weegeePlane, weegeeTextures = {};
let wallTex, floorTex, ceilingTex;
let deathTimer = 0, deathScreen;
let lookAwayActive = false, lookAwayTimer = 0;
let stairPositions = [];
let walls3D = [];
let warningEl, overlayEl, timerBarWrap, timerFill;
let armsCanvas, armsCtx;
let joystickActive = false, joystickBase = {x:0,y:0}, joystickDelta = {x:0,y:0};
let lookTouchId = null, lastLookPos = {x:0,y:0};
let flashTimer = 0;
let weegeeActive = false;
let weegeeSpawnTimer = 0;

// Audio Session Playback Volatile Tracking Stacks
let wasMusicPlaying = false;
let wasFootstepsPlaying = false;

// Flashlight Mechanics Variables
let flashlight;
let flashlightActive = true;
let batteryCurrent = 100;
const BATTERY_DRAIN_RATE = 3.6; 

// Stamina Management Settings
let staminaCurrent = 100;
let isSprinting = false;
let mobileSprintActive = false;
const STAMINA_DRAIN_RATE = 5.0; 
const STAMINA_REGEN_RATE = 12.0;

// Inventory Arrays and State Global Data Maps
let inventory = [null, null, null, null]; 
let selectedSlot = 0;
let stakeFloor = Math.floor(Math.random() * FLOOR_COUNT);
let isWeegeeBanished = false;
let handMesh;
let spawnedItems = [];
let raycaster = new THREE.Raycaster();
let mouseVector = new THREE.Vector2(0, 0);

// ─── Item Use Animation State ───────────────────────────────────────────────
// itemUseAnim describes a currently-playing hand/item animation in the
// arms-overlay canvas. `type` matches an ITEM_DATA id, `t` runs 0..duration.
// `chugging` / `chugStartStamina` are used by the Mountain Dew animation to
// track stamina refill only while the "drinking" phase is playing.
let itemUseAnim = { active: false, type: null, t: 0, duration: 1.0, chugging: false, chugStartStamina: 0 };

const ITEM_ANIM_DURATIONS = {
  dew: 3.6,
  battery: 1.6,
  stake: 2.2
};

// Phase breakpoints (as fractions 0..1 of the animation's total duration)
// for each item's multi-stage use animation.
const DEW_PHASES    = { riseEnd: 0.15, chugEnd: 0.80 };     // rise -> chug -> throw
const BATTERY_PHASES = { riseEnd: 0.50, insertEnd: 0.65 };  // rise -> insert -> retreat off-screen
const STAKE_PHASES  = { raiseEnd: 0.18, holdEnd: 0.64 };    // raise -> hold -> throw away

// ─── Weegee Banishing Animation State ───────────────────────────────────────
// While weegeeBanishAnim.active is true, Weegee plays a "vanishing" animation
// (spin, shrink, float, fade) and CANNOT kill the player no matter what.
let weegeeBanishAnim = { active: false, t: 0, duration: 2.4 };
const WEEGEE_BANISH_DURATION = 2.4;

// Plain <img> elements used for 2D canvas drawing of hands & held items
// (separate from the THREE.Texture objects used in the 3D scene).
let marioHandLeftImg, marioHandRightImg;
let itemIconImages = {};

const ITEM_DATA = {
  dew: { id: 'dew', name: 'Mountain Dew', icon: 'mtndewbottle.png', texture: null },
  battery: { id: 'battery', name: 'Battery', icon: 'flashlightbattery.png', texture: null },
  stake: { id: 'stake', name: 'Weegee Banishing Stake', icon: 'weegeestake.png', texture: null }
};

let bgMusic = new Audio('weegees-mansion-theme.wav');
bgMusic.loop = true;

let footstepsAudio = new Audio('footsteps.mp3');
footstepsAudio.loop = true;
let isWalking = false;

let laughAudio = new Audio('weegee-evil-laugh.wav');

let yayAudio = new Audio('yay.mp3');

// ─── Weegee Spatial Audio System ────────────────────────────────────────────
// To add more voice lines in the future, simply push more filenames into this array.
const WEEGEE_VOICE_LINES = [
  'go-weegee.mp3',
  'obey-weegee-destroy-mario.mp3',
  'weegee-isolated.mp3',
  'weegee-scream.mp3',
  'im-weegee-number-1.mp3',
  'weegee-hurry-up-already-eh.mp3',
  'weegee-call-out-mario.mp3',
  'weegee-weegee-oh-yeah-oh-yeah.mp3'
];

// Distance at which volume reaches 0 (world units).
const WEEGEE_AUDIO_MAX_DIST = 22;
// Minimum gap (seconds) between voice line triggers.
const WEEGEE_AUDIO_COOLDOWN_MIN = 8;
const WEEGEE_AUDIO_COOLDOWN_MAX = 20;

let weegeeVoiceAudio = null;      // currently loaded Audio object
let weegeeVoiceCooldown = WEEGEE_AUDIO_COOLDOWN_MIN + Math.random() * (WEEGEE_AUDIO_COOLDOWN_MAX - WEEGEE_AUDIO_COOLDOWN_MIN);
let weegeeVoicePlaying = false;

function pickWeegeeVoiceLine() {
  const file = WEEGEE_VOICE_LINES[Math.floor(Math.random() * WEEGEE_VOICE_LINES.length)];
  weegeeVoiceAudio = new Audio(file);
  weegeeVoiceAudio.volume = 0;
  weegeeVoiceAudio.onended = () => {
    weegeeVoicePlaying = false;
    // Schedule next trigger after a fresh random cooldown.
    weegeeVoiceCooldown = WEEGEE_AUDIO_COOLDOWN_MIN + Math.random() * (WEEGEE_AUDIO_COOLDOWN_MAX - WEEGEE_AUDIO_COOLDOWN_MIN);
  };
}

function updateWeegeeVoice(dt) {
  // Only play while Weegee is active, not banished, and the game is running.
  if (!weegeeActive || isWeegeeBanished || isDead || !gameStarted || isPaused) {
    if (weegeeVoiceAudio && weegeeVoicePlaying) {
      weegeeVoiceAudio.pause();
      weegeeVoicePlaying = false;
    }
    return;
  }

  // Update volume of any currently playing clip based on distance.
  if (weegeeVoicePlaying && weegeeVoiceAudio) {
    const dx = weegee.x - player.x;
    const dz = weegee.z - player.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const vol = Math.max(0, 1 - dist / WEEGEE_AUDIO_MAX_DIST);
    weegeeVoiceAudio.volume = vol;
    return;
  }

  // Count down to next trigger.
  weegeeVoiceCooldown -= dt;
  if (weegeeVoiceCooldown > 0) return;

  // Fire a new voice line.
  pickWeegeeVoiceLine();
  const dx = weegee.x - player.x;
  const dz = weegee.z - player.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const vol = Math.max(0, 1 - dist / WEEGEE_AUDIO_MAX_DIST);
  if (vol > 0) {
    weegeeVoiceAudio.volume = vol;
    weegeeVoiceAudio.play().catch(err => console.warn('Weegee voice play blocked:', err));
    weegeeVoicePlaying = true;
  } else {
    // Too far away — skip this trigger and try again after cooldown.
    weegeeVoiceCooldown = WEEGEE_AUDIO_COOLDOWN_MIN + Math.random() * (WEEGEE_AUDIO_COOLDOWN_MAX - WEEGEE_AUDIO_COOLDOWN_MIN);
  }
}
// ─────────────────────────────────────────────────────────────────────────────

const WEEGEE_IMGS = {
  front: 'Weegee_Front.png',
  back: 'Weegee_Back.png',
  left: 'Weegee_Left.png',
  right: 'Weegee_Right.png'
};

function generateMaze(w, h) {
  const grid = Array.from({length: h}, () => Array(w).fill(0xF));
  const visited = Array.from({length: h}, () => Array(w).fill(false));
  function carve(cx, cy) {
    visited[cy][cx] = true;
    const dirs = [
      [-1, 0, 0, 1], 
      [1, 0, 1, 0],  
      [0, -1, 2, 3], 
      [0, 1, 3, 2]   
    ];
    dirs.sort(() => Math.random()-0.5);
    for (const [dy,dx,bit,opp] of dirs) {
      const nx=cx+dx, ny=cy+dy;
      if(nx>=0&&nx<w&&ny>=0&&ny<h&&!visited[ny][nx]){
        grid[cy][cx] &= ~(1<<bit);
        grid[ny][nx] &= ~(1<<opp);
        carve(nx,ny);
      }
    }
  }
  carve(0,0);
  return grid;
}

// Scale the UV coordinates of a BoxGeometry so a tiling texture repeats
// proportionally instead of stretching. Each face's UVs are multiplied by
// the real-world size of that face divided by the tile size (2 world units).
const UV_TILE = 2;
function scaleBoxUVs(geo, w, h, d) {
  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
  // Each face is 2 triangles = 4 vertices in the non-indexed BufferGeometry.
  // Three.js r128 BoxGeometry IS indexed; we work on the uv attribute directly.
  const uv = geo.attributes.uv;
  const faceSizes = [
    [d, h], // +X face: width=d, height=h
    [d, h], // -X face
    [w, d], // +Y face
    [w, d], // -Y face
    [w, h], // +Z face
    [w, h], // -Z face
  ];
  // Each face has 4 unique UV entries (BoxGeometry groups them 4 per face)
  for (let face = 0; face < 6; face++) {
    const [fw, fh] = faceSizes[face];
    const su = fw / UV_TILE;
    const sv = fh / UV_TILE;
    const base = face * 4;
    for (let i = 0; i < 4; i++) {
      uv.setXY(base + i, uv.getX(base + i) * su, uv.getY(base + i) * sv);
    }
  }
  uv.needsUpdate = true;
}

function buildFloorGeometry(maze) {
  const group = new THREE.Group();
  
  const wallMat = new THREE.MeshStandardMaterial({map: wallTex, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1});
  const floorMat = new THREE.MeshStandardMaterial({map: floorTex, roughness: 1, metalness: 0});
  const ceilMat = new THREE.MeshStandardMaterial({map: ceilingTex, roughness: 1, metalness: 0});
  
  const totalW = MAZE_W * CELL;
  const totalH = MAZE_H * CELL;

  const floorGeo = new THREE.PlaneGeometry(totalW, totalH);
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI/2;
  floorMesh.position.set(totalW/2, 0, totalH/2);
  group.add(floorMesh);
  
  const ceilMesh = new THREE.Mesh(floorGeo, ceilMat);
  ceilMesh.rotation.x = Math.PI/2;
  ceilMesh.position.set(totalW/2, 3, totalH/2);
  group.add(ceilMesh);

  const wallSegs = [];
  const wh = 3, wt = 0.18;
  for (let row=0; row<MAZE_H; row++) {
    for (let col=0; col<MAZE_W; col++) {
      const cell = maze[row][col];
      const cx = col*CELL, cz = row*CELL;
      if (cell & 1) { 
        const g = new THREE.BoxGeometry(CELL+wt, wh, wt);
        const m = new THREE.Mesh(g, wallMat);
        m.position.set(cx + CELL/2, wh/2, cz);
        group.add(m); wallSegs.push({x:cx - wt/2, z:cz - wt/2, w:CELL + wt, d:wt});
      }
      if (cell & 4) { 
        const g = new THREE.BoxGeometry(wt, wh, CELL+wt);
        const m = new THREE.Mesh(g, wallMat);
        m.position.set(cx, wh/2, cz + CELL/2);
        group.add(m); wallSegs.push({x:cx - wt/2, z:cz - wt/2, w:wt, d:CELL + wt});
      }
    }
  }
  // Right outer wall (runs along Z axis, length = totalH)
  // Scale UVs on the geometry itself so the shared wallTex tiles correctly — no clone needed.
  const eg = new THREE.BoxGeometry(wt, wh, totalH + wt);
  scaleBoxUVs(eg, wt, wh, totalH + wt);
  const em = new THREE.Mesh(eg, wallMat);
  em.position.set(totalW, wh/2, totalH/2);
  group.add(em);
  wallSegs.push({x:totalW-wt/2, z:-wt/2, w:wt, d:totalH+wt});

  // South outer wall (runs along X axis, length = totalW)
  const sg = new THREE.BoxGeometry(totalW + wt, wh, wt);
  scaleBoxUVs(sg, totalW + wt, wh, wt);
  const sm = new THREE.Mesh(sg, wallMat);
  sm.position.set(totalW/2, wh/2, totalH);
  group.add(sm);
  wallSegs.push({x:-wt/2, z:totalH-wt/2, w:totalW+wt, d:wt});

  const stairX = (MAZE_W-2)*CELL + CELL/2;
  const stairZ = (MAZE_H-2)*CELL + CELL/2;
  const spiralMat = new THREE.MeshLambertMaterial({color:0x888888});
  const postGeo = new THREE.CylinderGeometry(0.15, 0.15, 2.6, 8);
  const postMesh = new THREE.Mesh(postGeo, spiralMat);
  postMesh.position.set(stairX, 1.3, stairZ);
  group.add(postMesh);
  const stepCount = 14;
  const stepRadius = 1.2;
  const stepGeo = new THREE.BoxGeometry(1.3, 0.12, 0.5);
  for (let i = 0; i < stepCount; i++) {
    const stepMesh = new THREE.Mesh(stepGeo, spiralMat);
    const angle = i * (Math.PI * 2 / 8);
    const y = 0.1 + i * 0.18;
    stepMesh.position.set(
      stairX + Math.cos(angle) * stepRadius * 0.5,
      y,
      stairZ + Math.sin(angle) * stepRadius * 0.5
    );
    stepMesh.rotation.y = -angle;
    group.add(stepMesh);
  }

  return {group, wallSegs, stairX, stairZ};
}

function initThree() {
  const canvas = document.getElementById('gameCanvas');
  renderer = new THREE.WebGLRenderer({canvas, antialias: false});
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000);
  renderer.fog = new THREE.Fog(0x000000, 1, 22);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050301, 0.16);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 60);
  clock = new THREE.Clock();

  scene.add(camera);

  const ambient = new THREE.AmbientLight(0x0d0702, 0.08);
  scene.add(ambient);
  const pt = new THREE.PointLight(0xff6600, 0.2, 6);
  pt.position.set(2,2,2);
  scene.add(pt);

  flashlight = new THREE.SpotLight(0xfffcaa, 4.5, 18, Math.PI/5.5, 0.55, 1.0);
  scene.add(flashlight);
  scene.add(flashlight.target);

  const wGeo = new THREE.PlaneGeometry(1.6, 2.8);
  const wMat = new THREE.MeshLambertMaterial({transparent: true, alphaTest: 0.5, side: THREE.DoubleSide});
  weegeePlane = new THREE.Mesh(wGeo, wMat);
  weegeePlane.position.y = 1.4;
  scene.add(weegeePlane);
  weegeePlane.visible = false;

  const loader = new THREE.TextureLoader();
  
  wallTex = loader.load('wall.png');
  wallTex.wrapS = THREE.RepeatWrapping;
  wallTex.wrapT = THREE.RepeatWrapping;
  
  floorTex = loader.load('floor.png');
  floorTex.wrapS = THREE.RepeatWrapping;
  floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(MAZE_W, MAZE_H); 
  
  ceilingTex = loader.load('ceiling.png');
  ceilingTex.wrapS = THREE.RepeatWrapping;
  ceilingTex.wrapT = THREE.RepeatWrapping;
  ceilingTex.repeat.set(MAZE_W, MAZE_H); 

  ITEM_DATA.dew.texture = loader.load(ITEM_DATA.dew.icon);
  ITEM_DATA.battery.texture = loader.load(ITEM_DATA.battery.icon);
  ITEM_DATA.stake.texture = loader.load(ITEM_DATA.stake.icon);

  const handGeo = new THREE.PlaneGeometry(0.32, 0.32);
  const handMat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, visible: false });
  handMesh = new THREE.Mesh(handGeo, handMat);
  handMesh.position.set(0.28, -0.22, -0.4); 
  camera.add(handMesh);

  // 2D <img> assets for the arms-overlay canvas (Mario hands + held-item icons)
  marioHandLeftImg = new Image();
  marioHandLeftImg.src = 'Mario-Hand-Left.png';
  marioHandRightImg = new Image();
  marioHandRightImg.src = 'Mario-Hand-Right.png';
  for (const id of Object.keys(ITEM_DATA)) {
    const img = new Image();
    img.src = ITEM_DATA[id].icon;
    itemIconImages[id] = img;
  }

  for (const [key, src] of Object.entries(WEEGEE_IMGS)) {
    loader.load(src, (tex) => {
      tex.minFilter = THREE.LinearFilter;
      weegeeTextures[key] = tex;
      if (key === 'front' && weegeePlane) {
        weegeePlane.material.map = tex;
        weegeePlane.material.needsUpdate = true;
      }
    }, undefined, () => {
      console.warn('Weegee PNG not found: ' + src);
    });
  }

  buildFloorScene(0);
}

let currentMaze;
function buildFloorScene(floorNum) {
  clearSpawnedItems();

  for (const m of floorMeshes) scene.remove(m);
  floorMeshes = [];
  walls3D = [];

  currentMaze = generateMaze(MAZE_W, MAZE_H);
  const {group, wallSegs, stairX, stairZ} = buildFloorGeometry(currentMaze);
  scene.add(group);
  floorMeshes.push(group);
  walls3D = wallSegs;
  stairPositions = [{x: stairX, z: stairZ}];

  player.x = CELL * 0.5;
  player.z = CELL * 0.5;
  player.yaw = 0;
  player.pitch = 0;

  weegee.x = (MAZE_W-2)*CELL + CELL * 0.5;
  weegee.z = (MAZE_H-2)*CELL + CELL * 0.5;
  weegee.dirX = 0;
  weegee.dirZ = -1;
  weegee.floor = floorNum;
  weegee.peeking = false;
  weegee.state = 'wander';
  weegee.targetCellX = null;
  weegee.targetCellZ = null;
  weegee._visitedCells = [];
  weegee._subOffX = 0;
  weegee._subOffZ = 0;
  weegeeInterceptTarget = null;
  weegeeInterceptTimer = 0;
  weegeeSidestepTimer    = 0;
  weegeeSidestepActive   = false;
  weegeeSidestepDuration = 0;
  weegeeSidestepDirX     = 0;
  weegeeSidestepDirZ     = 0;
  weegeePlane.visible = false;
  weegeeSpawnTimer = 6 + Math.random() * 4; 

  isWeegeeBanished = false;
  weegeeBanishAnim.active = false;
  weegeeBanishAnim.t = 0;
  itemUseAnim.active = false;
  itemUseAnim.t = 0;
  itemUseAnim.chugging = false;
  if (handMesh) updateHandItem();

  if (weegeeVoiceAudio && weegeeVoicePlaying) {
    weegeeVoiceAudio.pause();
    weegeeVoicePlaying = false;
  }
  weegeeVoiceCooldown = WEEGEE_AUDIO_COOLDOWN_MIN + Math.random() * (WEEGEE_AUDIO_COOLDOWN_MAX - WEEGEE_AUDIO_COOLDOWN_MIN);

  generateFloorLootPickups();

  document.getElementById('floor-num').textContent = floorNum + 1;
  document.getElementById('floor-num2').textContent = floorNum + 1;

  const stairBtn = document.getElementById('stair-btn');
  if (stairBtn) stairBtn.style.display = 'none';

  lookAwayActive = false;
  weegeeActive = false;
  document.getElementById('timer-bar-wrap').style.display = 'none';
  
  updateInventoryUI();
}

function clearSpawnedItems() {
  for(let i=0; i<spawnedItems.length; i++) {
    scene.remove(spawnedItems[i].mesh);
  }
  spawnedItems = [];
}

function generateFloorLootPickups() {
  const pCellX = Math.floor(player.x / CELL);
  const pCellZ = Math.floor(player.z / CELL);
  
  let validCells = [];
  for(let r=0; r<MAZE_H; r++) {
    for(let c=0; c<MAZE_W; c++) {
      if(r === pCellZ && c === pCellX) continue; 
      validCells.push({r, c});
    }
  }
  
  validCells.sort(() => Math.random() - 0.5);

  if(validCells.length > 0) {
    let loc = validCells.pop();
    spawnItemEntity(loc.c * CELL + CELL/2, loc.r * CELL + CELL/2, ITEM_DATA.dew);
  }
  for(let i=0; i<2; i++) {
    if(validCells.length > 0) {
      let loc = validCells.pop();
      spawnItemEntity(loc.c * CELL + CELL/2, loc.r * CELL + CELL/2, ITEM_DATA.battery);
    }
  }
  if (currentFloor === stakeFloor && validCells.length > 0) {
    let loc = validCells.pop();
    spawnItemEntity(loc.c * CELL + CELL/2, loc.r * CELL + CELL/2, ITEM_DATA.stake);
  }
}

function spawnItemEntity(x, z, itemType) {
  const geo = new THREE.PlaneGeometry(0.6, 0.6);
  const mat = new THREE.MeshBasicMaterial({
    map: itemType.texture, 
    transparent: true, 
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.4, z);
  scene.add(mesh);
  
  spawnedItems.push({
    typeId: itemType.id,
    mesh: mesh,
    x: x,
    z: z
  });
}

function getWeegeeTexture() {
  const weegeeAngle = Math.atan2(weegee.dirX, weegee.dirZ);
  const toPlayerX = player.x - weegee.x;
  const toPlayerZ = player.z - weegee.z;
  const angleToPlayer = Math.atan2(toPlayerX, toPlayerZ);
  
  let diff = angleToPlayer - weegeeAngle;
  diff = ((diff + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

  if (Math.abs(diff) < Math.PI/4) return weegeeTextures.front || null;
  if (Math.abs(diff) > Math.PI*3/4) return weegeeTextures.back || null;
  if (diff > 0) return weegeeTextures.right || null;
  return weegeeTextures.left || null;
}

function isWallBetween(x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const dist = Math.sqrt(dx*dx + dz*dz);
  if (dist < 0.1) return false;
  
  const stepSize = 0.02; 
  const steps = Math.floor(dist / stepSize);
  
  for (let i = 1; i < steps; i++) {
    const currX = x1 + (dx / dist) * (i * stepSize);
    const currZ = z1 + (dz / dist) * (i * stepSize);
    
    for (const w of walls3D) {
      if (currX >= w.x && currX <= w.x + w.w && currZ >= w.z && currZ <= w.z + w.d) {
        return true;
      }
    }
  }
  return false;
}

function isLookingAtWeegee() {
  if (isWeegeeBanished || weegeeBanishAnim.active || !weegeeActive || !weegeePlane.visible) return false;
  if (weegeeTextures.front && weegeePlane.material.map !== weegeeTextures.front) return false;
  
  const dx = weegee.x - player.x;
  const dz = weegee.z - player.z;
  const dist2D = Math.sqrt(dx*dx + dz*dz);
  if (dist2D > 14 || dist2D < 0.6) return false;
  
  const dy = 2.2 - 1.55; 
  const dist3D = Math.sqrt(dx*dx + dy*dy + dz*dz);
  
  const lookX = -Math.sin(player.yaw) * Math.cos(player.pitch);
  const lookY = Math.sin(player.pitch);
  const lookZ = -Math.cos(player.yaw) * Math.cos(player.pitch);
  
  const targetX = dx / dist3D;
  const targetY = dy / dist3D;
  const targetZ = dz / dist3D;
  
  const dot3D = lookX * targetX + lookY * targetY + lookZ * targetZ;
  
  if (dot3D > 0.996) {
    return !isWallBetween(player.x, player.z, weegee.x, weegee.z);
  }
  return false;
}

function isCollidingWithWeegee() {
  if (isWeegeeBanished || weegeeBanishAnim.active) return false;
  const dx = weegee.x - player.x, dz = weegee.z - player.z;
  return (dx*dx + dz*dz) < 1.2;
}

function toggleFlashlight() {
  if (isDead || !gameStarted || isPaused) return;
  if (batteryCurrent <= 0) return;
  
  flashlightActive = !flashlightActive;
  
  const mobileBtn = document.getElementById('mobile-flash-btn');
  if (mobileBtn) {
    if (flashlightActive) {
      mobileBtn.textContent = '💡 LIGHT ON';
      mobileBtn.style.background = 'rgba(0,255,200,0.2)';
      mobileBtn.style.borderColor = '#00ffcc';
    } else {
      mobileBtn.textContent = '🔦 LIGHT OFF';
      mobileBtn.style.background = 'rgba(0,0,0,0.6)';
      mobileBtn.style.borderColor = '#555';
    }
  }
}

function toggleMobileSprint() {
  if (isDead || !gameStarted || isPaused) return;
  mobileSprintActive = !mobileSprintActive;
  const btn = document.getElementById('mobile-sprint-btn');
  if(mobileSprintActive) {
    btn.textContent = '🏃 SPRINT ON';
    btn.style.background = 'rgba(0,255,0,0.4)';
    btn.style.borderColor = '#00ff00';
  } else {
    btn.textContent = '🏃 SPRINT OFF';
    btn.style.background = 'rgba(0,200,0,0.2)';
    btn.style.borderColor = '#555';
  }
}

// Global Pause Menu Toggle & Suspension Mechanics Hook
function togglePause() {
  if (!gameStarted || isDead) return;
  
  isPaused = !isPaused;
  const pauseMenuEl = document.getElementById('pause-screen');
  
  if (isPaused) {
    pauseMenuEl.style.display = 'flex';
    
    // Memory Cache and audio system freeze integration
    wasMusicPlaying = !bgMusic.paused;
    wasFootstepsPlaying = !footstepsAudio.paused;
    
    bgMusic.pause();
    footstepsAudio.pause();
    
    if (pointerLocked) {
      document.exitPointerLock();
    }
  } else {
    pauseMenuEl.style.display = 'none';
    
    // Restore exact audio channels mapping state
    if (wasMusicPlaying) {
      bgMusic.play().catch(err => console.warn(err));
    }
    if (wasFootstepsPlaying && isWalking) {
      footstepsAudio.play().catch(err => console.warn(err));
    }
    
    if (!isMobile) {
      document.getElementById('gameCanvas').requestPointerLock();
    }
  }
}

// Drop game back down to cleanly reload start variables state parameters
function quitToMainMenu() {
  isPaused = false;
  gameStarted = false;
  isDead = false;

  staminaCurrent = 100;
  batteryCurrent = 100;
  flashlightActive = true;
  
  document.getElementById('pause-screen').style.display = 'none';
  document.getElementById('start-screen').style.display = 'flex';
  document.getElementById('stamina-wrap').style.display = 'none';
  document.getElementById('hotbar-wrap').style.display = 'none';
  document.getElementById('timer-bar-wrap').style.display = 'none';
  document.getElementById('mobile-pause-btn').style.display = 'none';
  if (document.getElementById('stair-btn')) document.getElementById('stair-btn').style.display = 'none';
  
  bgMusic.pause();
  bgMusic.currentTime = 0;
  if (isWalking) {
    isWalking = false;
    footstepsAudio.pause();
  }
  laughAudio.pause();
  laughAudio.currentTime = 0;
  yayAudio.pause();
  yayAudio.currentTime = 0;
  if (weegeeVoiceAudio && weegeeVoicePlaying) {
    weegeeVoiceAudio.pause();
    weegeeVoicePlaying = false;
  }
  weegeeVoiceCooldown = WEEGEE_AUDIO_COOLDOWN_MIN + Math.random() * (WEEGEE_AUDIO_COOLDOWN_MAX - WEEGEE_AUDIO_COOLDOWN_MIN);
  
  clearSpawnedItems();
  for (const m of floorMeshes) scene.remove(m);
  floorMeshes = [];
  walls3D = [];
  if (weegeePlane) weegeePlane.visible = false;
  weegeeActive = false;
  overlayEl.style.background = 'rgba(0,0,0,0)';
  warningEl.style.display = 'none';
  const vs2 = document.getElementById('victory-screen');
  if (vs2) { vs2.style.display = 'none'; vs2.style.pointerEvents = 'none'; }
  const ds2 = document.getElementById('death-screen');
  if (ds2) { ds2.style.display = 'none'; ds2.style.pointerEvents = 'none'; }
}

function addItemToInventory(typeId) {
  for(let i=0; i<4; i++) {
    if(inventory[i] === null) {
      inventory[i] = typeId;
      updateInventoryUI();
      return true;
    }
  }
  return false; 
}

function useItemSlot(slotIndex) {
  if (isDead || !gameStarted || isPaused) return;
  
  if (selectedSlot === slotIndex) {
    useCurrentItem();
  } else {
    selectedSlot = slotIndex;
    updateInventoryUI();
  }
}

function useCurrentItem() {
  if (isDead || !gameStarted || isPaused) return;
  const item = inventory[selectedSlot];
  if(!item) return;

  if (itemUseAnim.active) return; // don't interrupt an in-progress animation

  if(item === 'dew') {
    // Stamina is no longer refilled instantly — it refills gradually
    // during the "chugging" phase of the drink animation (see the
    // itemUseAnim update loop).
    inventory[selectedSlot] = null;
  } else if(item === 'battery') {
    // Battery charge is applied once the full swap animation finishes
    // (see the itemUseAnim completion handler below).
    inventory[selectedSlot] = null;
    const mobileBtn = document.getElementById('mobile-flash-btn');
    if (mobileBtn && flashlightActive) {
      mobileBtn.textContent = '💡 LIGHT ON';
      mobileBtn.style.background = 'rgba(0,255,200,0.2)';
      mobileBtn.style.borderColor = '#00ffcc';
    }
  } else if(item === 'stake') {
    inventory[selectedSlot] = null;
    if (weegeeActive && weegeePlane.visible && !isWeegeeBanished && !weegeeBanishAnim.active) {
      // Begin the banishing animation — Weegee fades/spins/floats away
      // and cannot harm the player while this is playing out.
      weegeeBanishAnim.active = true;
      weegeeBanishAnim.t = 0;
      weegeeBanishAnim.duration = WEEGEE_BANISH_DURATION;
    } else {
      // Weegee isn't on-screen right now — just banish him quietly.
      isWeegeeBanished = true;
      weegeeActive = false;
      if (weegeePlane) weegeePlane.visible = false;
    }
  }

  // Kick off the held-item use animation (hides the static 3D hand item
  // while the 2D canvas animation plays).
  itemUseAnim.active = true;
  itemUseAnim.type = item;
  itemUseAnim.t = 0;
  itemUseAnim.duration = ITEM_ANIM_DURATIONS[item] || 1.0;
  itemUseAnim.chugging = false;
  itemUseAnim.chugStartStamina = staminaCurrent;
  if (handMesh) handMesh.material.visible = false;

  updateInventoryUI();
}

function updateHandItem() {
  if (!handMesh) return;
  const itemId = inventory[selectedSlot];
  if (itemId && ITEM_DATA[itemId] && ITEM_DATA[itemId].texture) {
    handMesh.material.map = ITEM_DATA[itemId].texture;
    handMesh.material.visible = true;
    handMesh.material.needsUpdate = true;
  } else {
    handMesh.material.visible = false;
  }
}

function updateInventoryUI() {
  for(let i=0; i<4; i++) {
    const slotEl = document.getElementById(`slot-${i}`);
    slotEl.classList.remove('selected');
    if (i === selectedSlot) {
      slotEl.classList.add('selected');
    }
    
    const oldImg = slotEl.querySelector('img');
    if(oldImg) oldImg.remove();
    
    const itemId = inventory[i];
    if(itemId) {
      const img = document.createElement('img');
      img.src = ITEM_DATA[itemId].icon;
      slotEl.appendChild(img);
    }
  }
  updateHandItem();
}

function tryPickupItem() {
  if(isDead || !gameStarted || isPaused) return;
  
  raycaster.setFromCamera(mouseVector, camera);
  const meshesToIntersect = spawnedItems.map(si => si.mesh);
  const intersects = raycaster.intersectObjects(meshesToIntersect);
  
  if(intersects.length > 0) {
    const targetMesh = intersects[0].object;
    const itemIndex = spawnedItems.findIndex(si => si.mesh === targetMesh);
    if(itemIndex !== -1) {
      const itemData = spawnedItems[itemIndex];
      const distance = camera.position.distanceTo(targetMesh.position);
      
      if(distance < 3.5) { 
        if(addItemToInventory(itemData.typeId)) {
          scene.remove(targetMesh);
          spawnedItems.splice(itemIndex, 1);
        }
      }
    }
  }
}

function mobilePickupInteraction() {
  if(isDead || !gameStarted || isPaused) return;
  let closestIdx = -1;
  let minDist = 2.5; 
  
  for(let i=0; i<spawnedItems.length; i++) {
    const dx = spawnedItems[i].x - player.x;
    const dz = spawnedItems[i].z - player.z;
    const d = Math.sqrt(dx*dx + dz*dz);
    if(d < minDist) {
      minDist = d;
      closestIdx = i;
    }
  }
  
  if(closestIdx !== -1) {
    const itemData = spawnedItems[closestIdx];
    if(addItemToInventory(itemData.typeId)) {
      scene.remove(itemData.mesh);
      spawnedItems.splice(closestIdx, 1);
    }
  }
}

// Scan loop bounding logic tracking item proximity indices 
function checkMobileItemsProximity() {
  if(!isMobile || isPaused) return;
  let nearItem = false;
  for(let i=0; i<spawnedItems.length; i++) {
    const dx = spawnedItems[i].x - player.x;
    const dz = spawnedItems[i].z - player.z;
    if((dx*dx + dz*dz) < 6.25) { 
      nearItem = true;
      break;
    }
  }
  document.getElementById('mobile-interact-btn').style.display = nearItem ? 'block' : 'none';
}

function killPlayer(msg) {
  if (isDead) return;
  isDead = true;
  
  bgMusic.pause();
  bgMusic.currentTime = 0;
  
  if (isWalking) {
    isWalking = false;
    footstepsAudio.pause();
  }

  laughAudio.currentTime = 0;
  laughAudio.play().catch(err => console.warn(err));
  
  if (weegeeVoiceAudio && weegeeVoicePlaying) {
    weegeeVoiceAudio.pause();
    weegeeVoicePlaying = false;
  }
  
  const ds = document.getElementById('death-screen');
  document.getElementById('death-msg').textContent = msg || "Weegee got you.";
  ds.style.display = 'flex';
  ds.style.pointerEvents = 'all';
  document.getElementById('mobile-pause-btn').style.display = 'none';
  overlayEl.style.background = 'rgba(150,0,0,0.85)';
  setTimeout(() => { overlayEl.style.background = 'rgba(0,0,0,0.7)'; }, 400);
}

function restartGame() {
  isDead = false;
  isPaused = false;
  currentFloor = 0;
  lookAwayActive = false;
  weegeeActive = false;
  
  stakeFloor = Math.floor(Math.random() * FLOOR_COUNT);
  selectedSlot = 0;
  isWeegeeBanished = false;
  weegeeBanishAnim.active = false;
  weegeeBanishAnim.t = 0;
  itemUseAnim.active = false;
  itemUseAnim.t = 0;
  itemUseAnim.chugging = false;
  staminaCurrent = 100;
  batteryCurrent = 100; // Reset battery
  flashlightActive = true; // Turn flashlight back on
  isSprinting = false;
  mobileSprintActive = false;
  inventory = [null, null, null, null];
  updateInventoryUI();

  const mobileBtn = document.getElementById('mobile-flash-btn');
  if (mobileBtn) {
    mobileBtn.textContent = '💡 LIGHT ON';
    mobileBtn.style.background = 'rgba(0,255,200,0.2)';
    mobileBtn.style.borderColor = '#00ffcc';
  }
  const sprBtn = document.getElementById('mobile-sprint-btn');
  if (sprBtn) {
    sprBtn.textContent = '🏃 SPRINT OFF';
    sprBtn.style.background = 'rgba(0,200,0,0.2)';
    sprBtn.style.borderColor = '#555';
  }
  
  if (isWalking) {
    isWalking = false;
    footstepsAudio.pause();
  }
  
  laughAudio.pause();
  laughAudio.currentTime = 0;
  yayAudio.pause();
  yayAudio.currentTime = 0;
  if (weegeeVoiceAudio && weegeeVoicePlaying) {
    weegeeVoiceAudio.pause();
    weegeeVoicePlaying = false;
  }
  weegeeVoiceCooldown = WEEGEE_AUDIO_COOLDOWN_MIN + Math.random() * (WEEGEE_AUDIO_COOLDOWN_MAX - WEEGEE_AUDIO_COOLDOWN_MIN);
  
  bgMusic.play().catch(err => console.warn(err));
  
  const ds = document.getElementById('death-screen');
  ds.style.display = 'none';
  const vs = document.getElementById('victory-screen');
  vs.style.display = 'none';
  vs.style.pointerEvents = 'none';
  overlayEl.style.background = 'rgba(0,0,0,0)';
  warningEl.style.display = 'none';
  document.getElementById('timer-bar-wrap').style.display = 'none';
  if (isMobile) {
    document.getElementById('mobile-pause-btn').style.display = 'block';
  }
  buildFloorScene(0);
}

function climbStairs() {
  if (currentFloor >= FLOOR_COUNT - 1) {
    isDead = true; 
    
    bgMusic.pause();
    bgMusic.currentTime = 0;
    
    if (isWalking) {
      isWalking = false;
      footstepsAudio.pause();
    }

    yayAudio.currentTime = 0;
    yayAudio.play().catch(err => console.warn(err));
    
    const vs = document.getElementById('victory-screen');
    vs.style.display = 'flex';
    vs.style.pointerEvents = 'all';
    document.getElementById('mobile-pause-btn').style.display = 'none';
    overlayEl.style.background = 'rgba(0,80,0,0.6)';
    return;
  }
  currentFloor++;
  buildFloorScene(currentFloor);
}

function checkNearStairs() {
  if (isPaused) return;
  let near = false;
  for (const s of stairPositions) {
    const dx = s.x - player.x, dz = s.z - player.z;
    if (dx*dx + dz*dz < 1.44) {
      near = true;
      break;
    }
  }
  
  const stairBtn = document.getElementById('stair-btn');
  if (near) {
    stairBtn.style.display = 'block';
    if (!isMobile) {
      stairBtn.textContent = '⬆ NEXT FLOOR (Press Up Arrow / W)';
    } else {
      stairBtn.textContent = '⬆ NEXT FLOOR';
    }
  } else {
    stairBtn.style.display = 'none';
  }
}

function movePlayer(dt) {
  let baseSpeed = 3.5;
  let movingInput = false;

  if (isMobile) {
    if (Math.abs(joystickDelta.x) > 0.05 || Math.abs(joystickDelta.y) > 0.05) {
      movingInput = true;
    }
    isSprinting = mobileSprintActive && movingInput && staminaCurrent > 0;
  } else {
    if (keys['w'] || keys['s'] || keys['a'] || keys['d'] || keys['arrowup'] || keys['arrowdown']) {
      movingInput = true;
    }
    isSprinting = keys['shift'] && movingInput && staminaCurrent > 0;
  }

  if (isSprinting) {
    staminaCurrent -= STAMINA_DRAIN_RATE * dt;
    if(staminaCurrent <= 0) {
      staminaCurrent = 0;
      isSprinting = false;
      mobileSprintActive = false;
      const sprBtn = document.getElementById('mobile-sprint-btn');
      if (sprBtn) {
        sprBtn.textContent = '🏃 SPRINT OFF';
        sprBtn.style.background = 'rgba(0,200,0,0.2)';
        sprBtn.style.borderColor = '#555';
      }
    }
  } else if (!movingInput) {
    staminaCurrent = Math.min(100, staminaCurrent + STAMINA_REGEN_RATE * dt);
  }

  document.getElementById('stamina-fill').style.width = staminaCurrent + '%';

  const currentSpeed = isSprinting ? baseSpeed * 1.5 : baseSpeed;
  let dx = 0, dz = 0;
  
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  const rx = Math.cos(player.yaw);
  const rz = -Math.sin(player.yaw);

  if (isMobile) {
    dx = (joystickDelta.x * rx + joystickDelta.y * fx) * currentSpeed * dt;
    dz = (joystickDelta.x * rz + joystickDelta.y * fz) * currentSpeed * dt;
  } else {
    if (keys['w']||keys['arrowup']) { dx += fx * currentSpeed * dt; dz += fz * currentSpeed * dt; }
    if (keys['s']||keys['arrowdown']) { dx -= fx * currentSpeed * dt; dz -= fz * currentSpeed * dt; }
    if (keys['a']) { dx -= rx * currentSpeed * dt; dz -= rz * currentSpeed * dt; }
    if (keys['d']) { dx += rx * currentSpeed * dt; dz += rz * currentSpeed * dt; }
    if (keys['arrowleft']) { player.yaw += 1.5 * dt; }
    if (keys['arrowright']) { player.yaw -= 1.5 * dt; }
  }
  const r = 0.35;
  const nx = player.x + dx, nz = player.z + dz;
  if (!collidesWithWalls(nx, player.z, r)) player.x = nx;
  if (!collidesWithWalls(player.x, nz, r)) player.z = nz;
  
  player.x = Math.max(r, Math.min(MAZE_W*CELL - r, player.x));
  player.z = Math.max(r, Math.min(MAZE_H*CELL - r, player.z));
}

function collidesWithWalls(x, z, r) {
  for (const w of walls3D) {
    if (x+r > w.x-0.1 && x-r < w.x+w.w+0.1 && z+r > w.z-0.1 && z-r < w.z+w.d+0.1) return true;
  }
  return false;
}

function bfsNextTarget(fromWorldX, fromWorldZ, toWorldX, toWorldZ) {
  const col = (x) => Math.floor(x / CELL);
  const row = (z) => Math.floor(z / CELL);
  const startC = Math.max(0, Math.min(MAZE_W-1, col(fromWorldX)));
  const startR = Math.max(0, Math.min(MAZE_H-1, row(fromWorldZ)));
  const goalC  = Math.max(0, Math.min(MAZE_W-1, col(toWorldX)));
  const goalR  = Math.max(0, Math.min(MAZE_H-1, row(toWorldZ)));

  if (startC === goalC && startR === goalR) return {x: toWorldX, z: toWorldZ};

  const visited = Array.from({length: MAZE_H}, () => Array(MAZE_W).fill(false));
  const parent  = Array.from({length: MAZE_H}, () => Array(MAZE_W).fill(null));
  const queue = [[startC, startR]];
  visited[startR][startC] = true;
  let found = false;

  outer: while (queue.length > 0) {
    const [c, r] = queue.shift();
    const neighbours = [
      [0, -1, 0],
      [0,  1, 1],
      [-1, 0, 2],
      [ 1, 0, 3],
    ];
    for (const [dc, dr, wb] of neighbours) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nc >= MAZE_W || nr < 0 || nr >= MAZE_H) continue;
      if (currentMaze[r][c] & (1 << wb)) continue;
      if (visited[nr][nc]) continue;
      visited[nr][nc] = true;
      parent[nr][nc] = [c, r];
      if (nc === goalC && nr === goalR) { found = true; break outer; }
      queue.push([nc, nr]);
    }
  }

  if (!found) return {x: toWorldX, z: toWorldZ};

  // Walk path back to find the SECOND cell from start (first step)
  let cc = goalC, cr = goalR;
  while (parent[cr][cc] && !(parent[cr][cc][0] === startC && parent[cr][cc][1] === startR)) {
    [cc, cr] = parent[cr][cc];
  }
  // Return a sub-cell point: centre offset by a small random nudge within safe interior
  const subOffX = weegee._subOffX !== undefined ? weegee._subOffX : 0;
  const subOffZ = weegee._subOffZ !== undefined ? weegee._subOffZ : 0;
  return {x: cc * CELL + CELL/2 + subOffX, z: cr * CELL + CELL/2 + subOffZ};
}

// How many recent cells we remember to avoid revisiting in wander mode
const WEEGEE_MEMORY = 6;
// Sub-cell margin to stay away from walls (world units)
const WEEGEE_WALL_MARGIN = 0.55;

// Pick a random sub-cell offset that keeps Weegee away from cell walls
function pickSubCellOffset() {
  const halfCell = CELL / 2;
  const safe = halfCell - WEEGEE_WALL_MARGIN;
  const ox = (Math.random() * 2 - 1) * safe;
  const oz = (Math.random() * 2 - 1) * safe;
  return {ox, oz};
}

function pickWanderTarget() {
  if (!weegee._visitedCells) weegee._visitedCells = [];

  const playerCol = Math.floor(player.x / CELL);
  const playerRow = Math.floor(player.z / CELL);

  // Build candidate list: all cells not recently visited and not the player's cell
  let candidates = [];
  for (let r = 0; r < MAZE_H; r++) {
    for (let c = 0; c < MAZE_W; c++) {
      if (c === playerCol && r === playerRow) continue;
      const key = r * MAZE_W + c;
      if (weegee._visitedCells.includes(key)) continue;
      candidates.push({c, r, key});
    }
  }
  // If memory filled all cells, clear and start fresh
  if (candidates.length === 0) {
    weegee._visitedCells = [];
    candidates = [];
    for (let r = 0; r < MAZE_H; r++) {
      for (let c = 0; c < MAZE_W; c++) {
        candidates.push({c, r, key: r * MAZE_W + c});
      }
    }
  }

  // Prefer cells that are reasonably far from Weegee's current cell
  const wCol = Math.floor(weegee.x / CELL);
  const wRow = Math.floor(weegee.z / CELL);
  const farCandidates = candidates.filter(({c, r}) => Math.abs(c - wCol) + Math.abs(r - wRow) >= 3);
  const pool = farCandidates.length > 0 ? farCandidates : candidates;

  const chosen = pool[Math.floor(Math.random() * pool.length)];
  // Track visit
  weegee._visitedCells.push(chosen.key);
  if (weegee._visitedCells.length > WEEGEE_MEMORY) weegee._visitedCells.shift();

  // Pick a random sub-cell offset so Weegee doesn't always go dead-center
  const {ox, oz} = pickSubCellOffset();
  weegee._subOffX = ox;
  weegee._subOffZ = oz;
  weegee.targetCellX = chosen.c * CELL + CELL/2 + ox;
  weegee.targetCellZ = chosen.r * CELL + CELL/2 + oz;
}

// Aggro intercept: look ahead by this many seconds of player movement
const WEEGEE_INTERCEPT_LOOKAHEAD = 1.4;
// Cooldown (seconds) between intercept re-calculations
let weegeeInterceptTimer = 0;
// Current intercept world target (null = direct chase)
let weegeeInterceptTarget = null;

// ── Sidestep counter-maneuver state ──────────────────────────────────────────
// When the player is close and charging directly at Weegee, he can shuffle
// left or right to block the player's path.  A random wrong-direction chance
// keeps the behaviour fair.
const WEEGEE_SIDESTEP_DIST      = 4.0;   // max world-units distance to trigger
const WEEGEE_SIDESTEP_DOT       = 0.72;  // player must be aimed this squarely at Weegee
const WEEGEE_SIDESTEP_WRONG_P   = 0.32;  // probability of picking the wrong side
const WEEGEE_SIDESTEP_COOLDOWN  = 1.8;   // seconds before he can sidestep again
const WEEGEE_SIDESTEP_DURATION  = 0.55;  // how long (s) the sidestep lasts
const WEEGEE_SIDESTEP_DIST_STEP = 1.4;   // how far to slide sideways (world units)
let weegeeSidestepTimer    = 0;          // cooldown countdown
let weegeeSidestepActive   = false;      // currently mid-sidestep?
let weegeeSidestepDuration = 0;          // remaining sidestep time
let weegeeSidestepDirX     = 0;          // sidestep movement direction
let weegeeSidestepDirZ     = 0;

function computeInterceptTarget() {
  // Estimate where the player will be by projecting their current velocity
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  const moving = keys['w'] || keys['arrowup'] ? 1 : (keys['s'] || keys['arrowdown'] ? -1 : 0);
  const strafeR = keys['d'] ? 1 : (keys['a'] ? -1 : 0);
  const spd = isSprinting ? 3.5 * 1.5 : 3.5;

  let predX = player.x + (fx * moving + Math.cos(player.yaw) * strafeR) * spd * WEEGEE_INTERCEPT_LOOKAHEAD;
  let predZ = player.z + (fz * moving + (-Math.sin(player.yaw)) * strafeR) * spd * WEEGEE_INTERCEPT_LOOKAHEAD;

  // Clamp to maze bounds
  predX = Math.max(0.5, Math.min(MAZE_W * CELL - 0.5, predX));
  predZ = Math.max(0.5, Math.min(MAZE_H * CELL - 0.5, predZ));

  // Only use intercept if it's a different cell from direct chase
  const pCell = {c: Math.floor(player.x/CELL), r: Math.floor(player.z/CELL)};
  const iCell = {c: Math.floor(predX/CELL), r: Math.floor(predZ/CELL)};
  if (iCell.c === pCell.c && iCell.r === pCell.r) return null; // no benefit

  return {x: predX, z: predZ};
}

function moveWeegee(dt) {
  if (isWeegeeBanished) return;

  // Player walk = 3.5, sprint = 5.25 (3.5 * 1.5).
  // Per-floor speed table (index = currentFloor, 0-based):
  //   Floor 1 (0): much slower than walk
  //   Floor 2 (1): slightly slower than walk
  //   Floor 3 (2): exactly walk speed
  //   Floor 4 (3): midpoint of walk and sprint
  //   Floor 5 (4): slightly faster than sprint (unchanged)
  const WEEGEE_FLOOR_SPEEDS = [2.2, 3.1, 3.5, 4.375, 5.35];
  const floorIdx = Math.max(0, Math.min(WEEGEE_FLOOR_SPEEDS.length - 1, currentFloor));
  const speed = WEEGEE_FLOOR_SPEEDS[floorIdx];

  const pDx = player.x - weegee.x;
  const pDz = player.z - weegee.z;
  const pDist = Math.sqrt(pDx*pDx + pDz*pDz);

  const AGGRO_RADIUS = 14;
  let targetX, targetZ;

  if (pDist <= AGGRO_RADIUS) {
    weegee.state = 'aggro';

    // Recompute intercept target every ~1.5 s or when we just switched to aggro
    weegeeInterceptTimer -= dt;
    if (weegeeInterceptTimer <= 0) {
      weegeeInterceptTarget = computeInterceptTarget();
      weegeeInterceptTimer = 1.2 + Math.random() * 0.6;
    }

    // If we have a valid intercept target and the wall-aware path to it is shorter
    // than to the player directly, use the intercept; otherwise fall back to direct chase
    if (weegeeInterceptTarget) {
      const iDx = weegeeInterceptTarget.x - weegee.x;
      const iDz = weegeeInterceptTarget.z - weegee.z;
      const iDist = Math.sqrt(iDx*iDx + iDz*iDz);
      // Only bother intercepting if the intercept point is meaningfully closer to us
      if (iDist < pDist * 1.35) {
        targetX = weegeeInterceptTarget.x;
        targetZ = weegeeInterceptTarget.z;
      } else {
        weegeeInterceptTarget = null;
        targetX = player.x;
        targetZ = player.z;
      }
    } else {
      targetX = player.x;
      targetZ = player.z;
    }
  } else {
    weegee.state = 'wander';
    weegeeInterceptTarget = null;
    weegeeInterceptTimer = 0;

    if (weegee.targetCellX === null || weegee.targetCellZ === null) {
      pickWanderTarget();
    }

    const tDx = weegee.targetCellX - weegee.x;
    const tDz = weegee.targetCellZ - weegee.z;
    if (Math.sqrt(tDx*tDx + tDz*tDz) < 0.45) {
      pickWanderTarget();
    }

    targetX = weegee.targetCellX;
    targetZ = weegee.targetCellZ;
  }

  const target = bfsNextTarget(weegee.x, weegee.z, targetX, targetZ);
  const dx = target.x - weegee.x, dz = target.z - weegee.z;
  const dist = Math.sqrt(dx*dx + dz*dz);

  // ── Sidestep counter-maneuver ───────────────────────────────────────────────
  // Tick down cooldown
  if (weegeeSidestepTimer > 0) weegeeSidestepTimer -= dt;

  if (weegeeSidestepActive) {
    // Continue the sidestep for its remaining duration
    weegeeSidestepDuration -= dt;
    if (weegeeSidestepDuration <= 0) {
      weegeeSidestepActive = false;
    } else {
      const stepX = weegeeSidestepDirX * speed * dt;
      const stepZ = weegeeSidestepDirZ * speed * dt;
      const nx = weegee.x + stepX;
      const nz = weegee.z + stepZ;
      const WRAD = 0.3;
      if (!collidesWithWalls(nx, weegee.z, WRAD)) weegee.x = nx;
      if (!collidesWithWalls(weegee.x, nz, WRAD)) weegee.z = nz;
      weegee.x = Math.max(WRAD, Math.min(MAZE_W * CELL - WRAD, weegee.x));
      weegee.z = Math.max(WRAD, Math.min(MAZE_H * CELL - WRAD, weegee.z));
      // Skip normal movement this frame while sidestepping
      return;
    }
  }

  // Check whether to trigger a new sidestep
  if (!weegeeSidestepActive && weegeeSidestepTimer <= 0 && weegee.state === 'aggro') {
    const toPx = player.x - weegee.x;
    const toPz = player.z - weegee.z;
    const toPdist = Math.sqrt(toPx * toPx + toPz * toPz);

    if (toPdist <= WEEGEE_SIDESTEP_DIST && toPdist > 0.5) {
      // Normalise direction from Weegee to player
      const nPx = toPx / toPdist;
      const nPz = toPz / toPdist;

      // Player's current forward vector
      const playerFwdX = -Math.sin(player.yaw);
      const playerFwdZ = -Math.cos(player.yaw);

      // How directly is the player walking toward Weegee?
      // dot( player_forward, direction_from_player_to_weegee )
      const toWeegeeX = -nPx; // direction from player to Weegee
      const toWeegeeZ = -nPz;
      const aimDot = playerFwdX * toWeegeeX + playerFwdZ * toWeegeeZ;

      if (aimDot >= WEEGEE_SIDESTEP_DOT) {
        // Player is charging straight at Weegee — decide which side to dodge to.
        // The two perpendicular directions to the player's approach vector are:
        //   left  = (-playerFwdZ,  playerFwdX)
        //   right = ( playerFwdZ, -playerFwdX)
        // Pick the side that puts Weegee more in the player's way (cross the path).
        // We determine which side the player is slightly offset from by the cross product.
        const crossY = playerFwdX * toPz - playerFwdZ * toPx; // positive = Weegee is to the right of player's path
        // Dodge toward the side the player seems to be trying to slip past
        // cross > 0 means player approaches from Weegee's left → dodge left to block
        let dodgeDirX, dodgeDirZ;
        if (crossY > 0) {
          dodgeDirX = -playerFwdZ;
          dodgeDirZ =  playerFwdX;
        } else {
          dodgeDirX =  playerFwdZ;
          dodgeDirZ = -playerFwdX;
        }

        // Random chance to pick the wrong side (fairness)
        if (Math.random() < WEEGEE_SIDESTEP_WRONG_P) {
          dodgeDirX = -dodgeDirX;
          dodgeDirZ = -dodgeDirZ;
        }

        // Only commit if there's actually room in that direction (wall check)
        const testDist = WEEGEE_SIDESTEP_DIST_STEP * 0.6;
        const testX = weegee.x + dodgeDirX * testDist;
        const testZ = weegee.z + dodgeDirZ * testDist;
        if (!collidesWithWalls(testX, weegee.z, 0.3) || !collidesWithWalls(weegee.x, testZ, 0.3)) {
          weegeeSidestepActive   = true;
          weegeeSidestepDuration = WEEGEE_SIDESTEP_DURATION;
          weegeeSidestepDirX     = dodgeDirX;
          weegeeSidestepDirZ     = dodgeDirZ;
          weegeeSidestepTimer    = WEEGEE_SIDESTEP_COOLDOWN;
          // Update facing direction toward player during sidestep
          weegee.dirX = nPx;
          weegee.dirZ = nPz;
          // Begin sidestep movement immediately this frame then return
          const stepX = weegeeSidestepDirX * speed * dt;
          const stepZ = weegeeSidestepDirZ * speed * dt;
          const WRAD = 0.3;
          const nx = weegee.x + stepX;
          const nz = weegee.z + stepZ;
          if (!collidesWithWalls(nx, weegee.z, WRAD)) weegee.x = nx;
          if (!collidesWithWalls(weegee.x, nz, WRAD)) weegee.z = nz;
          weegee.x = Math.max(WRAD, Math.min(MAZE_W * CELL - WRAD, weegee.x));
          weegee.z = Math.max(WRAD, Math.min(MAZE_H * CELL - WRAD, weegee.z));
          return;
        }
        // No room — just start cooldown so we don't re-check every frame
        weegeeSidestepTimer = 0.5;
      }
    }
  }
  // ── End sidestep ────────────────────────────────────────────────────────────
  if (dist > 0.05) {
    weegee.dirX = dx / dist;
    weegee.dirZ = dz / dist;

    const WRAD = 0.3;
    const stepX = weegee.dirX * speed * dt;
    const stepZ = weegee.dirZ * speed * dt;

    let nx = weegee.x + stepX;
    let nz = weegee.z + stepZ;

    const blockedX = collidesWithWalls(nx, weegee.z, WRAD);
    const blockedZ = collidesWithWalls(weegee.x, nz, WRAD);

    if (!blockedX && !blockedZ) {
      // Clear path — move normally
      weegee.x = nx;
      weegee.z = nz;
    } else if (!blockedX && blockedZ) {
      // Only Z is blocked — slide along X
      weegee.x = nx;
    } else if (blockedX && !blockedZ) {
      // Only X is blocked — slide along Z
      weegee.z = nz;
    } else {
      // Both axes blocked (corner). Try sliding along the dominant axis using full speed,
      // then fall back to the other axis. This keeps Weegee moving around corners
      // without any visible snapping or freezing.
      const slideX = weegee.x + Math.sign(stepX) * speed * dt;
      const slideZ = weegee.z + Math.sign(stepZ) * speed * dt;
      if (Math.abs(stepX) >= Math.abs(stepZ)) {
        if (!collidesWithWalls(slideX, weegee.z, WRAD)) {
          weegee.x = slideX;
        } else if (!collidesWithWalls(weegee.x, slideZ, WRAD)) {
          weegee.z = slideZ;
        }
        // else fully cornered this frame — BFS will route him out next tick
      } else {
        if (!collidesWithWalls(weegee.x, slideZ, WRAD)) {
          weegee.z = slideZ;
        } else if (!collidesWithWalls(slideX, weegee.z, WRAD)) {
          weegee.x = slideX;
        }
      }
    }

    weegee.x = Math.max(WRAD, Math.min(MAZE_W * CELL - WRAD, weegee.x));
    weegee.z = Math.max(WRAD, Math.min(MAZE_H * CELL - WRAD, weegee.z));
  }
}

function updateWeegeeSprite() {
  const tex = getWeegeeTexture();
  if (tex && weegeePlane.material.map !== tex) {
    weegeePlane.material.map = tex;
    weegeePlane.material.needsUpdate = true;
  }
  if (!weegeePlane.material.map) {
    weegeePlane.visible = false;
    return;
  }
  weegeePlane.position.x = weegee.x;
  weegeePlane.position.z = weegee.z;
  const dx = player.x - weegee.x, dz = player.z - weegee.z;
  weegeePlane.rotation.y = Math.atan2(dx, dz);
}

function updateWeegeeVisibility() {
  if (isWeegeeBanished) {
    weegeePlane.visible = false;
    return;
  }
  const dx = weegee.x - player.x, dz = weegee.z - player.z;
  const dist = Math.sqrt(dx*dx + dz*dz);
  
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  const nx = dx / (dist || 1);
  const nz = dz / (dist || 1);
  const dot = fx * nx + fz * nz;
  
  const inFOV = dot > 0.5 && dist < 20;
  const clearLOS = !isWallBetween(player.x, player.z, weegee.x, weegee.z);
  
  weegeePlane.visible = weegeeActive && clearLOS && (inFOV || dist < 1.5);
}

function spawnWeegeefarAway() {
  if (isWeegeeBanished) return;
  const playerCol = Math.floor(player.x / CELL);
  const playerRow = Math.floor(player.z / CELL);
  const candidates = [];
  for (let r = 0; r < MAZE_H; r++) {
    for (let c = 0; c < MAZE_W; c++) {
      if (Math.abs(c - playerCol) + Math.abs(r - playerRow) >= 4) {
        candidates.push([c, r]);
      }
    }
  }
  if (candidates.length === 0) {
    weegee.x = (MAZE_W-2)*CELL + CELL/2;
    weegee.z = (MAZE_H-2)*CELL + CELL/2;
  } else {
    const [c, r] = candidates[Math.floor(Math.random() * candidates.length)];
    weegee.x = c * CELL + CELL/2;
    weegee.z = r * CELL + CELL/2;
  }
  weegeeActive = true;
  weegeePlane.visible = false;
  weegee.state = 'wander';
  weegee.targetCellX = null;
  weegee.targetCellZ = null;
  weegee._visitedCells = weegee._visitedCells || [];
  weegee._subOffX = 0;
  weegee._subOffZ = 0;
  weegeeInterceptTarget = null;
  weegeeInterceptTimer = 0;
  weegeeSidestepActive   = false;
  weegeeSidestepDuration = 0;
  weegeeSidestepTimer    = 0;
}

function updateWeegeeBanishAnim(dt) {
  weegeeBanishAnim.t += dt;
  const p = Math.min(1, weegeeBanishAnim.t / weegeeBanishAnim.duration);

  // Ease-in spin/shrink/float/fade — Weegee gets yanked upward, spinning
  // and shrinking, while fading out completely by the end.
  const ease = p * p; // accelerate
  weegeePlane.visible = true;
  weegeePlane.position.x = weegee.x;
  weegeePlane.position.z = weegee.z;
  weegeePlane.position.y = 1.4 + ease * 3.2;
  const scale = Math.max(0.001, 1 - ease);
  weegeePlane.scale.set(scale, scale, scale);
  weegeePlane.rotation.y += dt * (3 + ease * 18);
  weegeePlane.material.opacity = Math.max(0, 1 - ease);
  weegeePlane.material.transparent = true;

  if (p >= 1) {
    weegeeBanishAnim.active = false;
    isWeegeeBanished = true;
    weegeeActive = false;
    weegeePlane.visible = false;
    weegeePlane.scale.set(1, 1, 1);
    weegeePlane.rotation.y = 0;
    weegeePlane.material.opacity = 1;
    weegeePlane.position.y = 1.4;
  }
}

function updateWeegee(dt) {
  if (weegeeBanishAnim.active) {
    updateWeegeeBanishAnim(dt);
    return;
  }
  if (isWeegeeBanished) {
    weegeeActive = false;
    weegeePlane.visible = false;
    return;
  }
  if (!weegeeActive) {
    weegeeSpawnTimer -= dt;
    if (weegeeSpawnTimer <= 0) {
      spawnWeegeefarAway();
    }
    return;
  }
  moveWeegee(dt);
  updateWeegeeVisibility();
  if (weegeePlane.visible) updateWeegeeSprite();
}

function updateLookAway(dt) {}

function imgDims(img, baseW) {
  if (img && img.complete && img.naturalWidth) {
    return {w: baseW, h: baseW * img.naturalHeight / img.naturalWidth};
  }
  return {w: baseW, h: baseW};
}

function safeDraw(ctx, img, x, y, w, h) {
  if (!img || !img.complete || img.naturalWidth === 0) return;
  ctx.drawImage(img, x, y, w, h);
}

// Linear interpolation and a smoothstep-style ease for natural-feeling
// accelerate/decelerate motion in the item-use animations below.
function lerp(a, b, t) { return a + (b - a) * t; }
function easeInOut(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

// Draws the right-hand item-use animation (Mountain Dew, Battery, or
// Banishing Stake), each with its own unique multi-phase motion.
function drawItemUseAnimation(ctx, w, h, swayR, bobR) {
  const p = Math.min(1, itemUseAnim.t / itemUseAnim.duration);
  const rSize = imgDims(marioHandRightImg, 280);
  const icon = itemIconImages[itemUseAnim.type];
  const iconSize = imgDims(icon, 280);

  // "Translate point" — dynamically calculated from the hand's actual resting position!
  // This makes the transition completely seamless regardless of screen size.
  const tx0 = w - rSize.w/2 + 40 + swayR;
  const ty0 = h - rSize.h/2 + 40 + bobR;

  if (itemUseAnim.type === 'dew') {
    // 1) Raise the bottle to the middle of the screen, flipping it
    //    upside down. 2) Hold it upside down and "chug" with a little
    //    shake/tilt for a few seconds (stamina refills during this part).
    // 3) Toss the empty bottle away off-screen.
    const txC = w * 0.5, tyC = h * 0.42;
    let tx, ty, rot, alpha = 1;

    if (p < DEW_PHASES.riseEnd) {
      const rp = easeInOut(p / DEW_PHASES.riseEnd);
      tx = lerp(tx0, txC, rp);
      ty = lerp(ty0, tyC, rp);
      rot = lerp(0, Math.PI, rp);
    } else if (p < DEW_PHASES.chugEnd) {
      tx = txC + Math.sin(itemUseAnim.t * 14) * 4;
      ty = tyC + Math.sin(itemUseAnim.t * 11) * 3;
      rot = Math.PI + Math.sin(itemUseAnim.t * 22) * 0.07;
    } else {
      const thP = easeInOut((p - DEW_PHASES.chugEnd) / (1 - DEW_PHASES.chugEnd));
      tx = lerp(txC, w + rSize.w + iconSize.w, thP);
      ty = lerp(tyC, h + rSize.h + iconSize.h, thP);
      rot = Math.PI + thP * Math.PI * 1.4;
      alpha = 1 - thP;
    }

    ctx.save();
ctx.globalAlpha = alpha;
ctx.translate(tx, ty);
ctx.rotate(rot);
safeDraw(ctx, icon, -iconSize.w/2, -rSize.h/2 - iconSize.h * 0.7, iconSize.w, iconSize.h);
safeDraw(ctx, marioHandRightImg, -rSize.w/2, -rSize.h/2, rSize.w, rSize.h);
ctx.restore();
  } else if (itemUseAnim.type === 'battery') {
    // 1) Carry the battery up toward the flashlight, twisting it into
    //    place. 2) Slot it in (the battery icon fades out — flashlight
    //    charge is applied once this whole animation finishes). 3) Bring
    //    the empty hand back down and off-screen at normal size.
    const tx1 = w * 0.62, ty1 = h * 0.50;
    let tx, ty, twist = 0, iconAlpha = 0;

    if (p < BATTERY_PHASES.riseEnd) {
      const rp = easeInOut(p / BATTERY_PHASES.riseEnd);
      tx = lerp(tx0, tx1, rp);
      ty = lerp(ty0, ty1, rp);
      twist = Math.sin(rp * Math.PI * 2) * 0.22;
      iconAlpha = 1;
    } else if (p < BATTERY_PHASES.insertEnd) {
      tx = tx1; ty = ty1;
      const ip = (p - BATTERY_PHASES.riseEnd) / (BATTERY_PHASES.insertEnd - BATTERY_PHASES.riseEnd);
      iconAlpha = 1 - ip;
    } else {
      const rp2 = easeInOut((p - BATTERY_PHASES.insertEnd) / (1 - BATTERY_PHASES.insertEnd));
      // Carry the empty hand straight down, well past the bottom edge of the full canvas.
      const offScreenY = h + rSize.h + iconSize.h + 100;
      tx = lerp(tx1, tx0, rp2);
      ty = lerp(ty1, offScreenY, rp2);
      iconAlpha = 0;
    }

    ctx.save();
ctx.translate(tx, ty);
ctx.rotate(twist);
if (iconAlpha > 0) {
  ctx.globalAlpha = iconAlpha;
  safeDraw(ctx, icon, -iconSize.w/2, -rSize.h * 0.55, iconSize.w, iconSize.h);
  ctx.globalAlpha = 1;
}
safeDraw(ctx, marioHandRightImg, -rSize.w/2, -rSize.h/2, rSize.w, rSize.h);
ctx.restore();
  } else if (itemUseAnim.type === 'stake') {
    // 1) Raise the stake up high overhead. 2) Hold it aloft for a beat.
    // 3) Hurl it away off-screen, fading out once it's out of sight.
    const tx1 = w * 0.5, ty1 = h * 0.25;
    let tx, ty, rot, scale, alpha = 1;

    if (p < STAKE_PHASES.raiseEnd) {
      const rp = easeInOut(p / STAKE_PHASES.raiseEnd);
      tx = lerp(tx0, tx1, rp);
      ty = lerp(ty0, ty1, rp);
      rot = lerp(0, -0.2, rp);
      scale = lerp(1, 1.3, rp);
    } else if (p < STAKE_PHASES.holdEnd) {
      tx = tx1;
      ty = ty1 + Math.sin(itemUseAnim.t * 6) * 3;
      rot = -0.2 + Math.sin(itemUseAnim.t * 5) * 0.03;
      scale = 1.3;
    } else {
      const tp = easeInOut((p - STAKE_PHASES.holdEnd) / (1 - STAKE_PHASES.holdEnd));
      tx = lerp(tx1, -(rSize.w + iconSize.w), tp);
      ty = lerp(ty1, -(rSize.h + iconSize.h), tp);
      rot = -0.2 - tp * 1.2;
      scale = 1.3;
      alpha = tp < 0.6 ? 1 : Math.max(0, 1 - (tp - 0.6) / 0.4);
    }

    ctx.save();
ctx.globalAlpha = alpha;
ctx.translate(tx, ty);
ctx.rotate(rot);
ctx.scale(scale, scale);
safeDraw(ctx, icon, -iconSize.w * 0.2, -rSize.h * 0.75, iconSize.w, iconSize.h);
safeDraw(ctx, marioHandRightImg, -rSize.w/2, -rSize.h/2, rSize.w, rSize.h);
ctx.restore();
  }
}

// Light vertical view-bob while walking, heavier while sprinting.
function computeViewBob(elapsed, walking) {
  if (!walking) return 0;
  const amp = isSprinting ? 0.09 : 0.045;
  const speed = isSprinting ? 14 : 8;
  return Math.abs(Math.sin(elapsed * speed)) * amp;
}

function drawArms(canvas, ctx) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const w = canvas.width, h = canvas.height;
  const t = Date.now() / 1000;
  const moving = keys['w']||keys['s']||keys['a']||keys['d']||keys['arrowup']||keys['arrowdown']||keys['arrowleft']||keys['arrowright']
    || (isMobile && (Math.abs(joystickDelta.x) > 0.05 || Math.abs(joystickDelta.y) > 0.05));

  // Light bob while walking, heavier bob (with extra sway) while sprinting.
  const bobAmp  = isSprinting ? 20 : (moving ? 9 : 2);
  const bobSpeed = isSprinting ? 14 : (moving ? 8 : 1.5);
  const swayAmp = isSprinting ? 16 : (moving ? 7 : 0);
  const phase = t * bobSpeed;

  const bobL = Math.sin(phase) * bobAmp;
  const bobR = Math.sin(phase + Math.PI) * bobAmp;
  const swayL = Math.cos(phase) * swayAmp;
  const swayR = -Math.cos(phase) * swayAmp;

  // ── Mario's left hand (always visible) ─────────────────────────────────────
  const lSize = imgDims(marioHandLeftImg, 280);
  safeDraw(ctx, marioHandLeftImg, -40 + swayL, h - lSize.h + 40 + bobL, lSize.w, lSize.h);

  // ── Mario's right hand ───────────────────────────────────────────────────────
  // Hidden whenever a held item is showing on the right side of the screen,
  // or while a per-item use animation is playing (which draws its own hand).
  const heldItemVisible = handMesh && handMesh.material.visible;
  if (itemUseAnim.active) {
    drawItemUseAnimation(ctx, w, h, swayR, bobR);
  } else if (!heldItemVisible) {
    const rSize = imgDims(marioHandRightImg, 280);
    safeDraw(ctx, marioHandRightImg, w - rSize.w + 40 + swayR, h - rSize.h + 40 + bobR, rSize.w, rSize.h);
  }
}

function gameLoop() {
  requestAnimationFrame(gameLoop);
  if (!gameStarted || isDead) return;
  
  // Early return freeze optimization to preserve state tracking when menu is suspended
  if (isPaused) {
    renderer.render(scene, camera);
    return;
  }
  
  const dt = Math.min(clock.getDelta(), 0.05);

  movePlayer(dt);

  // Apply look-joystick rotation (right-side joystick, landscape mobile)
  if (isMobile && window._lookJoystickDelta) {
    const ld = window._lookJoystickDelta;
    if (Math.abs(ld.x) > 0.05 || Math.abs(ld.y) > 0.05) {
      player.yaw   -= ld.x * (window._LOOK_SENSITIVITY || 2.2) * dt;
      player.pitch -= ld.y * (window._LOOK_SENSITIVITY || 2.2) * dt;
      player.pitch  = Math.max(-0.8, Math.min(0.8, player.pitch));
    }
  }

  updateWeegee(dt);
  updateWeegeeVoice(dt);
  updateLookAway(dt);
  checkNearStairs();
  checkMobileItemsProximity();

  const elapsed = clock.getElapsedTime();
  for(let i=0; i<spawnedItems.length; i++) {
    let item = spawnedItems[i];
    item.mesh.rotation.y = camera.rotation.y;
    item.mesh.position.y = 0.4 + Math.sin(elapsed * 3 + i) * 0.08;
  }

  if (itemUseAnim.active) {
    itemUseAnim.t += dt;

    // Mountain Dew: stamina only refills during the "chugging" phase of
    // the drink animation, ramping from whatever it was when chugging
    // started up to a full bar by the time chugging ends.
    if (itemUseAnim.type === 'dew') {
      const p = Math.min(1, itemUseAnim.t / itemUseAnim.duration);
      if (p >= DEW_PHASES.riseEnd && p < DEW_PHASES.chugEnd) {
        if (!itemUseAnim.chugging) {
          itemUseAnim.chugging = true;
          itemUseAnim.chugStartStamina = staminaCurrent;
        }
        const chugP = (p - DEW_PHASES.riseEnd) / (DEW_PHASES.chugEnd - DEW_PHASES.riseEnd);
        staminaCurrent = Math.min(100, itemUseAnim.chugStartStamina + (100 - itemUseAnim.chugStartStamina) * chugP);
        document.getElementById('stamina-fill').style.width = staminaCurrent + '%';
      } else if (p >= DEW_PHASES.chugEnd) {
        staminaCurrent = 100;
        document.getElementById('stamina-fill').style.width = staminaCurrent + '%';
      }
    }

    if (itemUseAnim.t >= itemUseAnim.duration) {
      // Battery: charge is applied only once the full swap animation
      // (carry up, insert, retreat off-screen) has finished playing.
      if (itemUseAnim.type === 'battery') {
        batteryCurrent = 100;
        document.getElementById('battery-fill').style.width = batteryCurrent + '%';
      }
      itemUseAnim.active = false;
      itemUseAnim.t = 0;
      itemUseAnim.chugging = false;
      updateHandItem();
    }
  }

  if (handMesh && handMesh.material.visible) {
    const moving = keys['w']||keys['s']||keys['a']||keys['d']||keys['arrowup']||keys['arrowdown']||keys['arrowleft']||keys['arrowright'] || (isMobile && (Math.abs(joystickDelta.x) > 0.05 || Math.abs(joystickDelta.y) > 0.05));
    const bSpeed = isSprinting ? 12 : (moving ? 7 : 2);
    const bAmt = isSprinting ? 0.03 : (moving ? 0.015 : 0.003);
    handMesh.position.y = -0.22 + Math.sin(elapsed * bSpeed) * bAmt;
    handMesh.position.x = 0.28 + Math.cos(elapsed * bSpeed * 0.5) * (bAmt * 0.6);
  }

  if (flashlightActive && batteryCurrent > 0) {
    batteryCurrent -= BATTERY_DRAIN_RATE * dt;
    if (batteryCurrent <= 0) {
      batteryCurrent = 0;
      flashlightActive = false;
      const mobileBtn = document.getElementById('mobile-flash-btn');
      if (mobileBtn) {
        mobileBtn.textContent = '🔦 OUT OF JUICE';
        mobileBtn.style.background = 'rgba(40,0,0,0.6)';
        mobileBtn.style.borderColor = '#444';
      }
    }
  }
  document.getElementById('battery-fill').style.width = batteryCurrent + '%';

  if (flashlightActive && batteryCurrent > 0) {
    flashlight.visible = true;
    flashlight.position.set(player.x, 1.55, player.z);
    
    const lookX = -Math.sin(player.yaw) * Math.cos(player.pitch);
    const lookY = Math.sin(player.pitch);
    const lookZ = -Math.cos(player.yaw) * Math.cos(player.pitch);
    flashlight.target.position.set(player.x + lookX, 1.55 + lookY, player.z + lookZ);

    if (batteryCurrent < 15) {
      flashlight.intensity = 4.5 * (batteryCurrent / 15);
    } else {
      flashlight.intensity = 4.5;
    }
  } else {
    flashlight.visible = false;
  }

  const currentlyWalking = gameStarted && !isDead && (
    isMobile ? (Math.abs(joystickDelta.x) > 0.1 || Math.abs(joystickDelta.y) > 0.1) :
    (keys['w'] || keys['s'] || keys['a'] || keys['d'] || keys['arrowup'] || keys['arrowdown'])
  );

  if (currentlyWalking) {
    if (!isWalking) {
      isWalking = true;
      footstepsAudio.currentTime = 0;
      footstepsAudio.play().catch(err => console.warn(err));
    }
    footstepsAudio.playbackRate = isSprinting ? 1.5 : 1.0;
  } else {
    if (isWalking) {
      isWalking = false;
      footstepsAudio.pause();
    }
  }

  if (!isDead && isCollidingWithWeegee()) {
    killPlayer("You walked into Weegee!");
    return;
  }
  if (!isDead && isLookingAtWeegee()) {
    killPlayer("You looked into Weegee's eyes!");
    return;
  }

  camera.position.set(player.x, 1.55 + computeViewBob(elapsed, currentlyWalking), player.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  camera.rotation.z = currentlyWalking ? Math.sin(elapsed * (isSprinting ? 14 : 8)) * (isSprinting ? 0.022 : 0.01) : 0;

  scene.children.filter(c => c.isPointLight && c !== scene.children[0] && c !== flashlight).forEach(l => {
    l.position.set(player.x, 1.5, player.z);
  });

  if (armsCanvas && armsCtx) drawArms(armsCanvas, armsCtx);

  renderer.render(scene, camera);
}

document.addEventListener('keydown', e => { 
  keys[e.key.toLowerCase()] = true; 
  if (e.key === ' ' && isDead) {
    restartGame();
  }
  
  if (e.key.toLowerCase() === 'f') {
    toggleFlashlight();
  }

  if(['1','2','3','4'].includes(e.key)) {
    selectedSlot = parseInt(e.key) - 1;
    updateInventoryUI();
  }

  if(e.key.toLowerCase() === 'q') {
    tryPickupItem();
  }

  // Keyboard Pause Toggle hook logic
  if(e.key.toLowerCase() === 'p') {
    togglePause();
  }

  if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && !isDead && gameStarted && !isPaused) {
    for (const s of stairPositions) {
      const dx = s.x - player.x, dz = s.z - player.z;
      if (dx*dx + dz*dz < 1.44) {
        climbStairs();
        break;
      }
    }
  }
});
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

window.addEventListener('wheel', e => {
  if (!gameStarted || isDead || isMobile || isPaused) return;
  if (e.deltaY > 0) {
    selectedSlot = (selectedSlot + 1) % 4;
  } else if (e.deltaY < 0) {
    selectedSlot = (selectedSlot - 1 + 4) % 4;
  }
  updateInventoryUI();
});

let pointerLocked = false;
document.addEventListener('click', (e) => {
  if (gameStarted && !isMobile && !isPaused) {
    if (!pointerLocked) {
      const lockPromise = document.getElementById('gameCanvas').requestPointerLock();
      if (lockPromise && typeof lockPromise.catch === 'function') {
        lockPromise.catch((err) => {
          if (err.name === 'SecurityError') {
            console.warn("Pointer lock blocked: standard browser cooldown active.");
          }
        });
      }
    } else {
      if (e.button === 0) {
        useCurrentItem();
      }
    }
  }
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === document.getElementById('gameCanvas');
  // Auto-pause if pointer lock dropped externally by desktop browsers focus shifts
  if (!pointerLocked && gameStarted && !isDead && !isMobile && !isPaused) {
    togglePause();
  }
});

document.addEventListener('mousemove', e => {
  if (!pointerLocked || !gameStarted || isPaused) return;
  player.yaw -= e.movementX * 0.002;
  player.pitch -= e.movementY * 0.002;
  player.pitch = Math.max(-0.8, Math.min(0.8, player.pitch));
});

if (isMobile) {
  document.getElementById('mobile-controls').style.display = 'block';
  document.getElementById('mobile-flash-btn').style.display = 'block';
  document.getElementById('mobile-sprint-btn').style.display = 'block';

  // ── Move joystick ──────────────────────────────────────────────────────────
  const jBase = document.getElementById('joystick-base');
  const jKnob = document.getElementById('joystick-knob');
  const jArea = document.getElementById('joystick-area');
  let moveJoystickTouchId = null;

  const getMoveRect = () => jBase.getBoundingClientRect();
  const MOVE_MAX_R = 36;

  jArea.addEventListener('touchstart', e => {
    if (isPaused) return;
    if (moveJoystickTouchId === null) {
      moveJoystickTouchId = e.changedTouches[0].identifier;
      joystickActive = true;
    }
    e.preventDefault();
  }, {passive: false});

  // ── Look joystick ──────────────────────────────────────────────────────────
  const lBase = document.getElementById('look-joystick-base');
  const lKnob = document.getElementById('look-joystick-knob');
  const lArea = document.getElementById('look-joystick-area');
  let lookJoystickTouchId = null;
  let lookJoystickDelta = {x: 0, y: 0};
  const LOOK_MAX_R = 36;
  // Sensitivity for look joystick (radians per second per normalised unit)
  const LOOK_SENSITIVITY = 2.2;

  const getLookRect = () => lBase.getBoundingClientRect();

  lArea.addEventListener('touchstart', e => {
    if (isPaused) return;
    if (lookJoystickTouchId === null) {
      lookJoystickTouchId = e.changedTouches[0].identifier;
    }
    e.preventDefault();
  }, {passive: false});

  // ── Fallback swipe-to-look area (portrait / non-landscape) ─────────────────
  document.getElementById('look-area').addEventListener('touchstart', e => {
    if (isPaused) return;
    if (lookTouchId === null) {
      lookTouchId = e.changedTouches[0].identifier;
      lastLookPos = {x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY};
    }
    e.preventDefault();
  }, {passive: false});

  // ── Unified touchmove ──────────────────────────────────────────────────────
  document.addEventListener('touchmove', e => {
    if (isPaused) return;
    for (const t of e.changedTouches) {
      // Move joystick
      if (t.identifier === moveJoystickTouchId) {
        const r = getMoveRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const dx = t.clientX - cx, dy = t.clientY - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        const clampedX = d > MOVE_MAX_R ? (dx / d) * MOVE_MAX_R : dx;
        const clampedY = d > MOVE_MAX_R ? (dy / d) * MOVE_MAX_R : dy;
        jKnob.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;
        joystickDelta.x = clampedX / MOVE_MAX_R;
        joystickDelta.y = clampedY / MOVE_MAX_R;
      }

      // Look joystick (right-side joystick, landscape mode)
      if (t.identifier === lookJoystickTouchId) {
        const r = getLookRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const dx = t.clientX - cx, dy = t.clientY - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        const clampedX = d > LOOK_MAX_R ? (dx / d) * LOOK_MAX_R : dx;
        const clampedY = d > LOOK_MAX_R ? (dy / d) * LOOK_MAX_R : dy;
        lKnob.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;
        lookJoystickDelta.x = clampedX / LOOK_MAX_R;
        lookJoystickDelta.y = clampedY / LOOK_MAX_R;
      }

      // Fallback swipe-to-look area (portrait mode)
      if (t.identifier === lookTouchId) {
        const dx = t.clientX - lastLookPos.x, dy = t.clientY - lastLookPos.y;
        player.yaw -= dx * 0.005;
        player.pitch -= dy * 0.005;
        player.pitch = Math.max(-0.8, Math.min(0.8, player.pitch));
        lastLookPos = {x: t.clientX, y: t.clientY};
      }
    }
    e.preventDefault();
  }, {passive: false});

  // ── Unified touchend ───────────────────────────────────────────────────────
  document.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === moveJoystickTouchId) {
        moveJoystickTouchId = null;
        joystickActive = false;
        joystickDelta = {x: 0, y: 0};
        jKnob.style.transform = 'translate(-50%,-50%)';
      }
      if (t.identifier === lookJoystickTouchId) {
        lookJoystickTouchId = null;
        lookJoystickDelta = {x: 0, y: 0};
        lKnob.style.transform = 'translate(-50%,-50%)';
      }
      if (t.identifier === lookTouchId) {
        lookTouchId = null;
      }
    }
  });

  // ── Integrate look joystick into the game loop ─────────────────────────────
  // Hook into the existing gameLoop by patching the per-frame camera update.
  // We store the delta on a globally accessible object so gameLoop can use it.
  window._lookJoystickDelta = lookJoystickDelta;
  window._LOOK_SENSITIVITY   = LOOK_SENSITIVITY;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  const ac = document.getElementById('arms-overlay');
  if (ac) { ac.width = window.innerWidth; ac.height = window.innerHeight; }
});

document.getElementById('start-btn').addEventListener('click', () => {
  document.getElementById('start-screen').style.display = 'none';
  gameStarted = true;
  clock.start();
  
  bgMusic.play().catch(err => console.warn("Audio play blocked until interaction:", err));
  
  document.getElementById('stamina-wrap').style.display = 'flex';
  document.getElementById('hotbar-wrap').style.display = 'flex';
  if (isMobile) {
    document.getElementById('mobile-pause-btn').style.display = 'block';
  }

  const fl = new THREE.PointLight(0xffddaa, 1.0, 10);
  fl.position.set(player.x, 1.5, player.z);
  scene.add(fl);
  
  updateInventoryUI();

  if (!isMobile) {
    const lockPromise = document.getElementById('gameCanvas').requestPointerLock();
    if (lockPromise && typeof lockPromise.catch === 'function') {
      lockPromise.catch(() => {});
    }
  }
});

window.climbStairs = climbStairs;
window.restartGame = restartGame;
window.toggleFlashlight = toggleFlashlight;
window.toggleMobileSprint = toggleMobileSprint;
window.useItemSlot = useItemSlot;
window.mobilePickupInteraction = mobilePickupInteraction;
window.togglePause = togglePause;
window.quitToMainMenu = quitToMainMenu;

warningEl = document.getElementById('warning');
overlayEl = document.getElementById('overlay');
timerBarWrap = document.getElementById('timer-bar-wrap');
timerFill = document.getElementById('timer-fill');
armsCanvas = document.getElementById('arms-overlay');
armsCtx = armsCanvas.getContext('2d');
armsCanvas.width = window.innerWidth;
armsCanvas.height = window.innerHeight;

initThree();
gameLoop();