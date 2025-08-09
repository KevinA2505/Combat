import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ========================
// Configuración y constantes
// ========================
const config = {
  terrainSize: 100,
  obstacleDensity: 0.05,
  maxSlope: 1.0,
  npcTypes: ['guerrero', 'arquero', 'mago'],
  attributes: {
    guerrero: { vida: 100, ataque: 20, velocidad: 3.0, defensa: 10, rango: 2.2, cadencia: 0.7 }, // unidades/seg
    arquero:  { vida:  80, ataque: 14, velocidad: 3.4, defensa:  5, rango: 9.0, cadencia: 1.2 },
    mago:     { vida:  60, ataque: 26, velocidad: 2.8, defensa:  0, rango: 7.0, cadencia: 1.6 }
  },
  projectile: {
    speed: 16, // unidades/seg
    radius: 0.18
  }
};

// ========================
// Variables globales
// ========================
let scene, camera, renderer, controls, clock;
let terrain, npcs = [], obstacles = [], projectiles = [], particleBursts = [];
let ui = {}, paused = false, battleStartTime = 0, timeScale = 1, isRunning = false;
let rngSeed = 42;

// RNG determinista sencillo
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
let rand = mulberry32(rngSeed);

// ========================
// Mapa de navegación
// ========================
let navGrid = null, heightMap = null;

function initNavGrid(){
  const cellSize = 2;
  const width = Math.floor(config.terrainSize / cellSize);
  const height = Math.floor(config.terrainSize / cellSize);
  navGrid = {
    cellSize,
    width,
    height,
    cells: Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({ height: 0, walkable: true }))
    )
  };
}

function worldToGrid(x, z){
  if(typeof x === 'object'){ z = x.z; x = x.x; }
  const gx = Math.floor((x + config.terrainSize/2) / navGrid.cellSize);
  const gz = Math.floor((z + config.terrainSize/2) / navGrid.cellSize);
  return {
    x: THREE.MathUtils.clamp(gx, 0, navGrid.width-1),
    z: THREE.MathUtils.clamp(gz, 0, navGrid.height-1)
  };
}

function gridToWorld(gx, gz){
  const wx = gx * navGrid.cellSize - config.terrainSize/2 + navGrid.cellSize/2;
  const wz = gz * navGrid.cellSize - config.terrainSize/2 + navGrid.cellSize/2;
  const h = navGrid.cells[gz]?.[gx]?.height || 0;
  return new THREE.Vector3(wx, h + 1.1, wz);
}

function getTerrainHeight(x, z){
  if(!heightMap) return 0;
  const gx = (x + config.terrainSize/2) / navGrid.cellSize;
  const gz = (z + config.terrainSize/2) / navGrid.cellSize;
  const x0 = THREE.MathUtils.clamp(Math.floor(gx), 0, navGrid.width - 1);
  const z0 = THREE.MathUtils.clamp(Math.floor(gz), 0, navGrid.height - 1);
  const x1 = THREE.MathUtils.clamp(x0 + 1, 0, navGrid.width - 1);
  const z1 = THREE.MathUtils.clamp(z0 + 1, 0, navGrid.height - 1);
  const tx = gx - x0;
  const tz = gz - z0;
  const h00 = heightMap[z0]?.[x0] ?? 0;
  const h10 = heightMap[z0]?.[x1] ?? 0;
  const h01 = heightMap[z1]?.[x0] ?? 0;
  const h11 = heightMap[z1]?.[x1] ?? 0;
  const h0 = THREE.MathUtils.lerp(h00, h10, tx);
  const h1 = THREE.MathUtils.lerp(h01, h11, tx);
  return THREE.MathUtils.lerp(h0, h1, tz);
}

function isWalkable(gx, gz){
  return !!(navGrid.cells[gz] && navGrid.cells[gz][gx] && navGrid.cells[gz][gx].walkable);
}

function heuristic(x1, z1, x2, z2){
  return Math.hypot(x2 - x1, z2 - z1);
}

function findPath(start, end){
  if(!navGrid) return null;
  const s = worldToGrid(start);
  const e = worldToGrid(end);
  if(!isWalkable(e.x, e.z)) return null;

  const open = [];
  const closed = new Set();
  const nodeKey = (x,z) => `${x},${z}`;
  const nodes = new Map();

  const startNode = { x:s.x, z:s.z, g:0, h:heuristic(s.x,s.z,e.x,e.z), f:0, parent:null };
  startNode.f = startNode.h;
  open.push(startNode);
  nodes.set(nodeKey(s.x,s.z), startNode);

  while(open.length){
    open.sort((a,b) => a.f - b.f);
    const cur = open.shift();
    const ck = nodeKey(cur.x, cur.z);
    if(cur.x === e.x && cur.z === e.z){
      const path = [];
      let n = cur;
      while(n.parent){
        path.push(gridToWorld(n.x, n.z));
        n = n.parent;
      }
      return path.reverse();
    }
    closed.add(ck);

    for(let dz=-1; dz<=1; dz++){
      for(let dx=-1; dx<=1; dx++){
        if(dx===0 && dz===0) continue;
        const nx = cur.x + dx;
        const nz = cur.z + dz;
        if(nx<0 || nz<0 || nx>=navGrid.width || nz>=navGrid.height) continue;
        if(!isWalkable(nx, nz)) continue;
        const nk = nodeKey(nx, nz);
        if(closed.has(nk)) continue;
        const step = (dx===0 || dz===0) ? 1 : Math.SQRT2;
        const heightCost = Math.abs(navGrid.cells[nz][nx].height - navGrid.cells[cur.z][cur.x].height);
        const g = cur.g + step + heightCost;
        let node = nodes.get(nk);
        if(!node){
          node = { x:nx, z:nz, g, h:heuristic(nx,nz,e.x,e.z), f:0, parent:cur };
          node.f = node.g + node.h;
          nodes.set(nk, node);
          open.push(node);
        } else if(g < node.g){
          node.g = g;
          node.parent = cur;
          node.f = g + node.h;
        }
      }
    }
  }
  return null;
}

// ========================
// Inicialización
// ========================
function init() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x8095a5, 0.015);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1200);
  camera.position.set(0, 62, 68);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);

  clock = new THREE.Clock();

  // Luces básicas
  const amb = new THREE.AmbientLight(0xffffff, 0.55); scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 0.75); dir.position.set(40, 80, 30); scene.add(dir);

  // Helper de límites
  const grid = new THREE.GridHelper(config.terrainSize, 20, 0x333333, 0x999999);
  grid.position.y = 0.02; scene.add(grid);
  const box = new THREE.Box3Helper(new THREE.Box3(
    new THREE.Vector3(-config.terrainSize/2, 0, -config.terrainSize/2),
    new THREE.Vector3( config.terrainSize/2, 0,  config.terrainSize/2)
  ), 0x333333); scene.add(box);

  // UI refs
  ui.start = document.getElementById('startBattleBtn');
  ui.quick = document.getElementById('quickSkirmishBtn');
  ui.pause = document.getElementById('pauseBtn');
  ui.resume = document.getElementById('resumeBtn');
  ui.restart = document.getElementById('restartBtn');
  ui.resetCam = document.getElementById('resetCamBtn');
  ui.runtimeSpeed = document.getElementById('runtimeSpeed');
  ui.seed = document.getElementById('seedInput');
  ui.speedSlider = document.getElementById('speedSlider');
  ui.armySelection = document.getElementById('armySelection');
  ui.controls = document.getElementById('controls');
  ui.stats = document.getElementById('stats');
  ui.teamAStatus = document.getElementById('teamAStatus');
  ui.teamBStatus = document.getElementById('teamBStatus');
  ui.battleStatus = document.getElementById('battleStatus');

  // Eventos UI
  ui.start.addEventListener('click', () => startBattle(readComposition()));
  ui.quick.addEventListener('click', () => {
    document.getElementById('teamAWarriors').value = 5;
    document.getElementById('teamAArchers').value = 3;
    document.getElementById('teamAMages').value = 2;
    document.getElementById('teamBWarriors').value = 5;
    document.getElementById('teamBArchers').value = 3;
    document.getElementById('teamBMages').value = 2;
    startBattle(readComposition());
  });
  ui.pause.addEventListener('click', () => { paused = true; ui.pause.classList.add('hidden'); ui.resume.classList.remove('hidden'); });
  ui.resume.addEventListener('click', () => { paused = false; ui.resume.classList.add('hidden'); ui.pause.classList.remove('hidden'); });
  ui.restart.addEventListener('click', resetToMenu);
  ui.resetCam.addEventListener('click', () => { camera.position.set(0, 62, 68); controls.target.set(0,0,0); });
  ui.runtimeSpeed.addEventListener('input', e => timeScale = parseFloat(e.target.value));
  ui.speedSlider.addEventListener('input', e => timeScale = parseFloat(e.target.value));
  ui.seed.addEventListener('change', e => { rngSeed = parseInt(e.target.value||'42', 10); rand = mulberry32(rngSeed); });

  window.addEventListener('resize', onResize);

  // Mostrar menú de ejércitos
  showMenu();

  // Render loop único
  animate();
}

function onResize(){
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function showMenu(){
  ui.armySelection.classList.remove('hidden');
  ui.controls.classList.add('hidden');
  ui.stats.classList.add('hidden');
  isRunning = false; paused = false;
  ui.pause.classList.remove('hidden'); ui.resume.classList.add('hidden');
  // Limpiar escena salvo helpers y luces
  clearBattleEntities();
}

function readComposition(){
  function parseField(id, desc){
    const value = document.getElementById(id).value;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      alert(`Valor inválido para ${desc}. Se usará 0.`);
    }
    return parsed || 0;
  }

  return {
    A: {
      guerrero: parseField('teamAWarriors', 'guerreros del Equipo A'),
      arquero:  parseField('teamAArchers', 'arqueros del Equipo A'),
      mago:     parseField('teamAMages', 'magos del Equipo A')
    },
    B: {
      guerrero: parseField('teamBWarriors', 'guerreros del Equipo B'),
      arquero:  parseField('teamBArchers', 'arqueros del Equipo B'),
      mago:     parseField('teamBMages', 'magos del Equipo B')
    }
  };
}

function validateComp(comp){
  const totalA = comp.A.guerrero + comp.A.arquero + comp.A.mago;
  const totalB = comp.B.guerrero + comp.B.arquero + comp.B.mago;
  return totalA >= 1 && totalB >= 1;
}

function startBattle(composition){
  if(!validateComp(composition)) { alert('Cada equipo debe tener al menos un NPC.'); return; }
  clearBattleEntities(true);
  rngSeed = parseInt(ui.seed.value||'42', 10); rand = mulberry32(rngSeed);

  ui.armySelection.classList.add('hidden');
  ui.controls.classList.remove('hidden');
  ui.stats.classList.remove('hidden');

  generateTerrain();
  generateObstacles();
  generateNPCs(composition);

  battleStartTime = performance.now();
  paused = false; isRunning = true; ui.battleStatus.textContent = 'Batalla en curso…';
}

// ========================
// Generación procedural
// ========================
function generateTerrain(){
  if(terrain) { scene.remove(terrain); disposeMesh(terrain); terrain = null; }
  initNavGrid();
  const geom = new THREE.PlaneGeometry(config.terrainSize, config.terrainSize, 64, 64);
  heightMap = Array.from({ length: navGrid.height }, () => Array(navGrid.width).fill(0));
  // Elevación simple (value noise / hash noise suavizado)
  const pos = geom.attributes.position;
  for(let i=0; i<pos.count; i++){
    const x = pos.getX(i) * 0.08; // escala
    const y = pos.getY(i) * 0.08;
    const h = fbmNoise(x, y) * 4.0; // altura máx ±4
    pos.setZ(i, h);
  }
  // Rellenar el mapa de navegación con alturas
  for(let gz=0; gz<navGrid.height; gz++){
    for(let gx=0; gx<navGrid.width; gx++){
      const wx = (gx/navGrid.width - 0.5) * config.terrainSize;
      const wz = (gz/navGrid.height - 0.5) * config.terrainSize;
      const h = fbmNoise(wx*0.08, wz*0.08) * 4.0;
      navGrid.cells[gz][gx].height = h;
      navGrid.cells[gz][gx].walkable = true;
      heightMap[gz][gx] = h;
    }
  }

  // marcar celdas no caminables si la pendiente con vecinos es muy pronunciada
  for(let gz=0; gz<navGrid.height; gz++){
    for(let gx=0; gx<navGrid.width; gx++){
      const h = navGrid.cells[gz][gx].height;
      const neighbors = [[gx+1,gz],[gx-1,gz],[gx,gz+1],[gx,gz-1]];
      for(const [nx,nz] of neighbors){
        if(nx<0||nz<0||nx>=navGrid.width||nz>=navGrid.height) continue;
        const h2 = navGrid.cells[nz][nx].height;
        const slope = Math.abs(h2 - h) / navGrid.cellSize;
        if(slope > config.maxSlope){
          navGrid.cells[gz][gx].walkable = false;
          break;
        }
      }
    }
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x6fae6f, roughness: 1.0, metalness: 0.0, flatShading: false });
  terrain = new THREE.Mesh(geom, mat);
  terrain.rotation.x = -Math.PI/2;
  terrain.receiveShadow = false;
  scene.add(terrain);
}

// Fractal Brownian Motion sobre un hash noise determinista
function baseNoise(x, y){
  // Hash 2D determinista con semilla
  const n = Math.sin((x*127.1 + y*311.7 + rngSeed) * 43758.5453);
  return (n - Math.floor(n)); // [0,1)
}
function smoothNoise(x, y){
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const xf = x - x0, yf = y - y0;
  function lerp(a,b,t){ return a + (b-a)*t; }
  const n00 = baseNoise(x0,   y0);
  const n10 = baseNoise(x0+1, y0);
  const n01 = baseNoise(x0,   y0+1);
  const n11 = baseNoise(x0+1, y0+1);
  const nx0 = lerp(n00, n10, xf);
  const nx1 = lerp(n01, n11, xf);
  return lerp(nx0, nx1, yf) * 2 - 1; // [-1,1]
}
function fbmNoise(x, y){
  let f = 0, amp = 1, freq = 1;
  for(let o=0; o<4; o++){ f += amp * smoothNoise(x*freq, y*freq); amp *= 0.5; freq *= 2.0; }
  return f;
}

function generateObstacles(){
  const count = Math.floor(config.terrainSize * config.terrainSize * config.obstacleDensity);
  for(let i=0; i<count; i++){
    const isTree = rand() > 0.5;
    let geom, mat, h;
    if(isTree){
      geom = new THREE.CylinderGeometry(0.4, 0.6, 4.8, 8);
      mat = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 1 });
      h = 2.4;
    } else {
      geom = new THREE.DodecahedronGeometry(1.2);
      mat = new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 1 });
      h = 1.2;
    }
    const m = new THREE.Mesh(geom, mat);
    const px = (rand()-0.5) * config.terrainSize;
    const pz = (rand()-0.5) * config.terrainSize;
    const py = 0.0 + h; // centrado aproximado
    m.position.set(px, py, pz);
    m.userData.radius = isTree ? 1.0 : 1.2; // para colisiones simples
    scene.add(m); obstacles.push(m);

    // marcar celdas como no caminables en el mapa
    const g = worldToGrid(px, pz);
    const rad = Math.ceil((m.userData.radius||1.0) / navGrid.cellSize);
    for(let dz=-rad; dz<=rad; dz++){
      for(let dx=-rad; dx<=rad; dx++){
        const nx = g.x + dx, nz = g.z + dz;
        if(nx>=0 && nz>=0 && nx<navGrid.width && nz<navGrid.height){
          navGrid.cells[nz][nx].walkable = false;
        }
      }
    }
  }
}

function generateNPCs(comp){
  npcs = []; projectiles = [];
  const teams = ['A','B'];
  const colors = { A: 0xff4d4d, B: 0x4d7dff };
  const sideX = { A: -config.terrainSize/3, B: config.terrainSize/3 };
  teams.forEach(team => {
    const conf = comp[team];
    for(const type of config.npcTypes){
      const n = conf[type]|0;
      for(let i=0;i<n;i++){
        const npc = createNPC(team, type, colors[team]);
        const row = Math.floor(i/5), col = i%5;
        const x = sideX[team] + (rand()-0.5)*6;
        const z = (row*2.0 - 8) + col*1.6 + (rand()-0.5)*1.5;
        const y = getTerrainHeight(x, z) + npc.modelHeight;
        npc.mesh.position.set(x, y, z);
        scene.add(npc.mesh);
        npcs.push(npc);
      }
    }
  });
}

function createNPC(team, type, color){
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  group.add(body);

  // barra de vida (billboard sencillo)
  const barBg = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.22, 0.22), new THREE.MeshBasicMaterial({ color: 0x222222 }));
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
  const barGroup = new THREE.Group();
  barGroup.add(barBg); barGroup.add(bar); barGroup.position.set(0, 1.6, 0);
  bar.position.x = -0.99 + 0.99; // centrado inicial
  group.add(barGroup);

  const base = config.attributes[type];
  const stats = { vida: base.vida, vidaMax: base.vida, ataque: base.ataque, velocidad: base.velocidad, defensa: base.defensa, rango: base.rango, cadencia: base.cadencia };

  return {
    team, type, attributes: stats,
    mesh: group,
    healthBar: bar,
    healthBarGroup: barGroup,
    modelHeight: 1.1,
    target: null,
    status: 'vivo',
    cooldown: 0,
    path: null,
    pathIndex: 0,
    pathTarget: null,
    pathEnd: null
  };
}

// ========================
// Bucle principal
// ========================
function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta() * timeScale, 0.05); // tope por estabilidad
  controls.update();

  if(isRunning && !paused){
    updateNPCs(dt);
    updateProjectiles(dt);
    checkBattleStatus();
  }

  // billboards de vida miran a cámara
  for(const n of npcs){ if(n.healthBarGroup) n.healthBarGroup.lookAt(camera.position); }

  renderer.render(scene, camera);
}

function updateNPCs(dt){
  for(const npc of npcs){
    if(npc.status !== 'vivo') continue;
    if(!npc.target || npc.target.status !== 'vivo'){
      npc.target = findNearestEnemy(npc);
      npc.path = null;
    }
    if(!npc.target) continue;

    // recalcular ruta si cambia el objetivo o se mueve
    if(!npc.path || npc.pathTarget !== npc.target || (npc.pathEnd && npc.pathEnd.distanceTo(npc.target.mesh.position) > navGrid.cellSize)){
      npc.path = findPath(npc.mesh.position, npc.target.mesh.position);
      npc.pathIndex = 0;
      npc.pathTarget = npc.target;
      npc.pathEnd = npc.target.mesh.position.clone();
    } else if(npc.path && npc.pathIndex < npc.path.length){
      const next = npc.path[npc.pathIndex];
      const g = worldToGrid(next);
      if(!isWalkable(g.x, g.z)){
        npc.path = findPath(npc.mesh.position, npc.target.mesh.position);
        npc.pathIndex = 0;
        npc.pathEnd = npc.target.mesh.position.clone();
      }
    }

    const dist = npc.mesh.position.distanceTo(npc.target.mesh.position);
    const inRange = dist <= npc.attributes.rango;
    if(!inRange){
      moveTowards(npc, dt);
    } else {
      npc.path = null;
      tryAttack(npc, npc.target);
    }
    updateHealthBar(npc);
  }
}

function moveTowards(npc, dt){
  let targetPos = null;

  if(npc.path && npc.pathIndex < npc.path.length){
    targetPos = npc.path[npc.pathIndex];
    const distNode = npc.mesh.position.distanceTo(targetPos);
    if(distNode < 0.5){
      npc.pathIndex++;
      targetPos = null; // recalcular en siguiente cuadro
    }
  } else if(npc.target){
    targetPos = npc.target.mesh.position;
  }

  if(!targetPos) return;

  // =============================
  // Vector de búsqueda/arribo
  // =============================
  const desired = new THREE.Vector3().subVectors(targetPos, npc.mesh.position);
  desired.y = 0;
  const dist = desired.length();
  const slowingRadius = 3.5;
  const desiredSpeed = dist < slowingRadius ? npc.attributes.velocidad * (dist / slowingRadius) : npc.attributes.velocidad;
  desired.setLength(desiredSpeed);

  // =============================
  // Desviación por obstáculos
  // =============================
  const avoid = new THREE.Vector3();
  const forward = desired.clone().normalize();
  for(const obs of obstacles){
    const offset = new THREE.Vector3().subVectors(obs.position, npc.mesh.position);
    const ahead = offset.dot(forward);
    if(ahead <= 0) continue; // solo evitar los que están delante
    const radius = 1.6 + (obs.userData.radius || 1.0);
    const distObs = offset.length();
    const danger = radius * 2;
    if(distObs < danger){
      const strength = (danger - distObs) / danger;
      avoid.add(offset.normalize().multiplyScalar(-strength * npc.attributes.velocidad));
    }
  }

  // =============================
  // Combinación y movimiento
  // =============================
  const steering = desired.add(avoid);
  if(steering.lengthSq() === 0) return;

  const step = steering.length() * dt;
  const direction = steering.normalize();
  const candidate = npc.mesh.position.clone().addScaledVector(direction, step);
  const h1 = getTerrainHeight(npc.mesh.position.x, npc.mesh.position.z);
  const h2 = getTerrainHeight(candidate.x, candidate.z);
  const horiz = Math.hypot(candidate.x - npc.mesh.position.x, candidate.z - npc.mesh.position.z);
  const slope = horiz > 0 ? Math.abs(h2 - h1) / horiz : 0;
  if(slope <= config.maxSlope){
    npc.mesh.position.copy(candidate);
  }

  // límites
  npc.mesh.position.x = THREE.MathUtils.clamp(npc.mesh.position.x, -config.terrainSize/2, config.terrainSize/2);
  npc.mesh.position.z = THREE.MathUtils.clamp(npc.mesh.position.z, -config.terrainSize/2, config.terrainSize/2);
  npc.mesh.position.y = getTerrainHeight(npc.mesh.position.x, npc.mesh.position.z) + npc.modelHeight;
}

function lineOfSight(a, b){
  // Chequeo simple: si un obstáculo está muy cerca del segmento AB, se considera bloqueado
  const A = a.mesh.position, B = b.mesh.position;
  const AB = new THREE.Vector3().subVectors(B, A);
  const ab2 = AB.lengthSq();
  for(const o of obstacles){
    const AO = new THREE.Vector3().subVectors(o.position, A);
    const t = THREE.MathUtils.clamp(AO.dot(AB)/ab2, 0, 1);
    const P = new THREE.Vector3().copy(AB).multiplyScalar(t).add(A);
    const d = P.distanceTo(o.position);
    if(d < (o.userData.radius||1.0) + 0.6) return false;
  }
  return true;
}

function tryAttack(npc, target){
  if(npc.cooldown > 0) { npc.cooldown -= clock.getDelta() * timeScale; return; }
  // chequeo de línea de visión para distancia > melee
  const ranged = npc.attributes.rango > 3.0;
  if(ranged && !lineOfSight(npc, target)) return;

  if(npc.type === 'guerrero'){
    // daño directo
    dealDamage(npc, target, npc.attributes.ataque);
  } else {
    // proyectil
    spawnProjectile(npc, target);
  }
  npc.cooldown = npc.attributes.cadencia;
}

function dealDamage(attacker, target, raw){
  const dmg = Math.max(0, raw - (target.attributes.defensa||0));
  target.attributes.vida -= dmg;
  spawnHitParticles(target.mesh.position);
  if(target.attributes.vida <= 0){ target.status = 'muerto'; scene.remove(target.mesh); }
}

function spawnProjectile(npc, target){
  const startPos = npc.mesh.position.clone().add(new THREE.Vector3(0, 0.2, 0));
  const dir = new THREE.Vector3().subVectors(target.mesh.position, npc.mesh.position).normalize();

  let m, trail, light;
  if(npc.type === 'arquero'){
    // Arrow composed of a shaft and tip
    const group = new THREE.Group();

    const shaftGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8);
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0x8b4513 });
    const shaft = new THREE.Mesh(shaftGeom, shaftMat);
    group.add(shaft);

    const coneGeom = new THREE.ConeGeometry(0.06, 0.25, 8);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
    const cone = new THREE.Mesh(coneGeom, coneMat);
    cone.position.y = 0.4 + 0.125; // place tip at end of shaft
    group.add(cone);

    group.position.copy(startPos);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
    m = group;

    const trailGeom = new THREE.BufferGeometry().setFromPoints([startPos.clone(), startPos.clone()]);
    const trailMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    trail = new THREE.Line(trailGeom, trailMat);
    trail.userData.type = 'line';
    scene.add(trail);
  } else if(npc.type === 'mago'){
    const mat = new THREE.SpriteMaterial({ color: 0x8844ff, transparent: true, blending: THREE.AdditiveBlending });
    m = new THREE.Sprite(mat);
    m.position.copy(startPos);
    m.scale.set(0.6,0.6,0.6);

    light = new THREE.PointLight(0x8844ff, 1, 5);
    light.position.copy(startPos);
    scene.add(light);

    const count = 20;
    const trailGeom = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3);
    trailGeom.setAttribute('position', new THREE.BufferAttribute(positions,3));
    const trailMat = new THREE.PointsMaterial({ color: 0x8844ff, size: 0.15, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    trail = new THREE.Points(trailGeom, trailMat);
    trail.userData.type = 'particle';
    scene.add(trail);
  } else {
    const geom = new THREE.SphereGeometry(config.projectile.radius, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    m = new THREE.Mesh(geom, mat);
    m.position.copy(startPos);

    const trailGeom = new THREE.BufferGeometry().setFromPoints([startPos.clone(), startPos.clone()]);
    const trailMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    trail = new THREE.Line(trailGeom, trailMat);
    trail.userData.type = 'line';
    scene.add(trail);
  }

  projectiles.push({ mesh: m, team: npc.team, damage: npc.attributes.ataque, vel: dir.multiplyScalar(config.projectile.speed), ttl: 2.5, target, trail, light });
  scene.add(m);
}

function spawnHitParticles(pos){
  const count = 20;
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(count*3);
  const velocities = new Float32Array(count*3);
  for(let i=0;i<count;i++){
    positions[3*i] = pos.x;
    positions[3*i+1] = pos.y;
    positions[3*i+2] = pos.z;
    const dir = new THREE.Vector3(Math.random()-0.5, Math.random(), Math.random()-0.5).normalize().multiplyScalar(4);
    velocities[3*i] = dir.x;
    velocities[3*i+1] = dir.y;
    velocities[3*i+2] = dir.z;
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions,3));
  const mat = new THREE.PointsMaterial({ color: 0x8844ff, size: 0.2, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const points = new THREE.Points(geom, mat);
  scene.add(points);
  particleBursts.push({ points, velocities, ttl: 0.5 });
}

function updateProjectiles(dt){
  for(let i=projectiles.length-1; i>=0; i--){
    const p = projectiles[i];
    p.mesh.position.addScaledVector(p.vel, dt);

    // orient projectile to follow its velocity
    const dir = p.vel.clone().normalize();
    p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);

    if(p.light){ p.light.position.copy(p.mesh.position); }

    // update trail
    if(p.trail){
      const posAttr = p.trail.geometry.attributes.position;
      const arr = posAttr.array;
      if(p.trail.userData.type === 'line'){
        arr[3] = p.mesh.position.x;
        arr[4] = p.mesh.position.y;
        arr[5] = p.mesh.position.z;
      } else if(p.trail.userData.type === 'particle'){
        for(let j=arr.length-3; j>=3; j-=3){
          arr[j] = arr[j-3];
          arr[j+1] = arr[j-2];
          arr[j+2] = arr[j-1];
        }
        arr[0] = p.mesh.position.x;
        arr[1] = p.mesh.position.y;
        arr[2] = p.mesh.position.z;
      }
      posAttr.needsUpdate = true;
    }

    p.ttl -= dt;
    // impacta si llega cerca del target vivo
    if(p.target && p.target.status==='vivo'){
      if(p.mesh.position.distanceTo(p.target.mesh.position) < 1.1){
        dealDamage({team:p.team}, p.target, p.damage);
        scene.remove(p.mesh); disposeMesh(p.mesh);
        if(p.trail){ scene.remove(p.trail); disposeMesh(p.trail); }
        if(p.light){ scene.remove(p.light); }
        projectiles.splice(i,1); continue;
      }
    }
    if(p.ttl <= 0){
      scene.remove(p.mesh); disposeMesh(p.mesh);
      if(p.trail){ scene.remove(p.trail); disposeMesh(p.trail); }
      if(p.light){ scene.remove(p.light); }
      projectiles.splice(i,1);
    }
  }

  // update hit particle bursts
  for(let i=particleBursts.length-1; i>=0; i--){
    const b = particleBursts[i];
    const posAttr = b.points.geometry.attributes.position;
    const arr = posAttr.array;
    for(let j=0; j<arr.length; j+=3){
      arr[j]   += b.velocities[j] * dt;
      arr[j+1] += b.velocities[j+1] * dt;
      arr[j+2] += b.velocities[j+2] * dt;
    }
    posAttr.needsUpdate = true;
    b.ttl -= dt;
    if(b.ttl <= 0){
      scene.remove(b.points); disposeMesh(b.points);
      particleBursts.splice(i,1);
    }
  }
}

function updateHealthBar(npc){
  const r = Math.max(0, npc.attributes.vida / npc.attributes.vidaMax);
  npc.healthBar.scale.x = Math.max(0.001, r);
  npc.healthBar.position.x = -0.99 + 0.99*r;
  // verde -> rojo aproximado via HSL
  const h = 0.33 * r; // 0.33 ≈ 120°
  npc.healthBar.material.color.setHSL(h, 1, 0.5);
}

function findNearestEnemy(npc){
  let nearest = null, minD = Infinity;
  for(const e of npcs){
    if(e.team === npc.team || e.status !== 'vivo') continue;
    const d = npc.mesh.position.distanceTo(e.mesh.position);
    if(d < minD){ minD = d; nearest = e; }
  }
  return nearest;
}

function checkBattleStatus(){
  const aAlive = npcs.filter(n => n.team==='A' && n.status==='vivo').length;
  const bAlive = npcs.filter(n => n.team==='B' && n.status==='vivo').length;
  ui.teamAStatus.textContent = `Equipo A: ${aAlive} vivos`;
  ui.teamBStatus.textContent = `Equipo B: ${bAlive} vivos`;
  if(aAlive===0 || bAlive===0){
    const winner = aAlive>0 ? 'Equipo A' : 'Equipo B';
    const duration = ((performance.now() - battleStartTime)/1000).toFixed(2);
    ui.battleStatus.textContent = `Ganador: ${winner}. Duración: ${duration}s`;
    paused = true; isRunning = false;
  }
}

// ========================
// Limpieza y utilidades
// ========================
function clearBattleEntities(removeEverything){
  // Quita NPCs, proyectiles, terreno y obstáculos
  for(const n of npcs){ scene.remove(n.mesh); disposeMesh(n.mesh); }
  for(const p of projectiles){
    scene.remove(p.mesh); disposeMesh(p.mesh);
    if(p.trail){ scene.remove(p.trail); disposeMesh(p.trail); }
    if(p.light){ scene.remove(p.light); }
  }
  npcs.length = 0; projectiles.length = 0;
  for(const b of particleBursts){ scene.remove(b.points); disposeMesh(b.points); }
  particleBursts.length = 0;
  for(const o of obstacles){ scene.remove(o); disposeMesh(o); }
  obstacles.length = 0;
  if(terrain){ scene.remove(terrain); disposeMesh(terrain); terrain = null; }

  // Si se pide completo, mantener luces y helpers, borrar resto
  if(removeEverything){
    const keep = new Set();
    scene.traverse(obj => { if(obj.type.includes('Light') || obj instanceof THREE.GridHelper || obj instanceof THREE.Box3Helper) keep.add(obj); });
    const toRemove = [];
    scene.children.forEach(ch => { if(!keep.has(ch)) toRemove.push(ch); });
    for(const ch of toRemove){ scene.remove(ch); disposeMesh(ch); }
  }
}

function disposeMesh(obj){
  if(!obj) return;
  obj.traverse?.(child => {
    if(child.geometry){ child.geometry.dispose?.(); }
    if(child.material){
      if(Array.isArray(child.material)) child.material.forEach(m => m.dispose?.());
      else child.material.dispose?.();
    }
  });
}

function resetToMenu(){ showMenu(); }

// ========================
// Arranque
// ========================
init();
