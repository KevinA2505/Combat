import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { setupMenu, showMenu, validateComp, ui } from '../ui/menu.js';
import { generateTerrain, generateObstacles, obstacles, terrain } from '../terrain/terrain.js';
import { npcs, generateNPCs, updateNPCs } from '../entities/npcs.js';
import { projectiles, particleBursts, updateProjectiles } from '../entities/projectiles.js';

export const config = {
  terrainSize: 100,
  obstacleDensity: 0.05,
  maxSlope: 1.0,
  npcTypes: ['guerrero', 'arquero', 'mago'],
  attributes: {
    guerrero: { vida: 100, ataque: 20, velocidad: 3.0, defensa: 10, rango: 2.2, cadencia: 0.7 },
    arquero:  { vida:  80, ataque: 14, velocidad: 3.4, defensa:  5, rango: 9.0, cadencia: 1.2 },
    mago:     { vida:  60, ataque: 26, velocidad: 2.8, defensa:  0, rango: 7.0, cadencia: 1.6 }
  },
  projectile: {
    speed: 16,
    radius: 0.18
  }
};

export let scene, camera, renderer, controls, clock;
export let paused = false, battleStartTime = 0, timeScale = 1, isRunning = false;
export let rngSeed = 42;

export function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
export let rand = mulberry32(rngSeed);

export function setSeed(seed){ rngSeed = seed; rand = mulberry32(rngSeed); }
export function setPaused(v){ paused = v; }
export function setTimeScale(v){ timeScale = v; }

export function init(){
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

  const amb = new THREE.AmbientLight(0xffffff, 0.55); scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 0.75); dir.position.set(40, 80, 30); scene.add(dir);
  const grid = new THREE.GridHelper(config.terrainSize, 20, 0x333333, 0x999999);
  grid.position.y = 0.02; scene.add(grid);
  const box = new THREE.Box3Helper(new THREE.Box3(
    new THREE.Vector3(-config.terrainSize/2, 0, -config.terrainSize/2),
    new THREE.Vector3( config.terrainSize/2, 0,  config.terrainSize/2)
  ), 0x333333); scene.add(box);

  setupMenu({
    startBattle: comp => startBattle(comp),
    resetToMenu,
    setPaused: v => { paused = v; },
    resetCamera: () => { camera.position.set(0, 62, 68); controls.target.set(0,0,0); },
    setTimeScale: v => { timeScale = v; },
    setSeed: s => { setSeed(s); }
  });

  window.addEventListener('resize', onResize);

  showMenu();
  animate();
}

function onResize(){
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function startBattle(composition){
  if(!validateComp(composition)) { alert('Cada equipo debe tener al menos un NPC.'); return; }
  clearBattleEntities(true);
  setSeed(parseInt(ui.seed.value||'42', 10));

  ui.armySelection.classList.add('hidden');
  ui.controls.classList.remove('hidden');
  ui.stats.classList.remove('hidden');

  generateTerrain();
  generateObstacles();
  generateNPCs(composition);

  battleStartTime = performance.now();
  paused = false; isRunning = true; ui.battleStatus.textContent = 'Batalla en curso…';
}

function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta() * timeScale, 0.05);
  controls.update();

  if(isRunning && !paused){
    updateNPCs(dt);
    updateProjectiles(dt);
    checkBattleStatus();
  }

  for(const n of npcs){ if(n.healthBarGroup) n.healthBarGroup.lookAt(camera.position); }

  renderer.render(scene, camera);
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

function clearBattleEntities(removeEverything){
  for(const n of npcs){ scene.remove(n.mesh); disposeMesh(n.mesh); }
  npcs.length = 0;
  for(const p of projectiles){
    scene.remove(p.mesh); disposeMesh(p.mesh);
    if(p.trail){ scene.remove(p.trail); disposeMesh(p.trail); }
    if(p.light){ scene.remove(p.light); }
  }
  projectiles.length = 0;
  for(const b of particleBursts){ scene.remove(b.points); disposeMesh(b.points); }
  particleBursts.length = 0;
  for(const o of obstacles){ scene.remove(o); disposeMesh(o); }
  obstacles.length = 0;
  if(terrain){ scene.remove(terrain); disposeMesh(terrain); }

  if(removeEverything){
    const keep = new Set();
    scene.traverse(obj => { if(obj.type.includes('Light') || obj instanceof THREE.GridHelper || obj instanceof THREE.Box3Helper) keep.add(obj); });
    const toRemove = [];
    scene.children.forEach(ch => { if(!keep.has(ch)) toRemove.push(ch); });
    for(const ch of toRemove){ scene.remove(ch); disposeMesh(ch); }
  }
}

export function disposeMesh(obj){
  if(!obj) return;
  obj.traverse?.(child => {
    if(child.geometry){ child.geometry.dispose?.(); }
    if(child.material){
      if(Array.isArray(child.material)) child.material.forEach(m => m.dispose?.());
      else child.material.dispose?.();
    }
  });
}

export function resetToMenu(){ showMenu(); }
