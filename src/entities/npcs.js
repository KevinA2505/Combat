import * as THREE from 'three';
import { scene, config, rand } from '../simulation/engine.js';
import { getTerrainHeight, findPath, navGrid } from '../terrain/terrain.js';
import { shootProjectile, spawnHitParticles } from './projectiles.js';

export const npcs = [];

export function createNPC(team, type, color){
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  group.add(body);
  const barBg = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.22, 0.22), new THREE.MeshBasicMaterial({ color: 0x222222 }));
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
  const barGroup = new THREE.Group();
  barGroup.add(barBg); barGroup.add(bar); barGroup.position.set(0, 1.6, 0);
  bar.position.x = -0.99 + 0.99;
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

export function generateNPCs(comp){
  npcs.length = 0;
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

export function updateNPCs(dt){
  for(const npc of npcs){
    if(npc.status !== 'vivo') continue;
    if(!npc.target || npc.target.status !== 'vivo'){
      npc.target = findNearestEnemy(npc);
      npc.path = null;
    }
    if(!npc.target) continue;
    if(!npc.path || npc.pathTarget !== npc.target || (npc.pathEnd && npc.pathEnd.distanceTo(npc.target.mesh.position) > navGrid.cellSize)){
      npc.path = findPath(npc.mesh.position, npc.target.mesh.position);
      npc.pathIndex = 0;
      npc.pathTarget = npc.target;
      npc.pathEnd = npc.target.mesh.position.clone();
    }
    if(npc.path){
      const dest = npc.path[npc.pathIndex];
      if(dest){
        const dir = dest.clone().sub(npc.mesh.position);
        const dist = dir.length();
        if(dist < 0.2){
          npc.pathIndex++;
        } else {
          dir.normalize();
          npc.mesh.position.addScaledVector(dir, npc.attributes.velocidad * dt);
          const y = getTerrainHeight(npc.mesh.position.x, npc.mesh.position.z) + npc.modelHeight;
          npc.mesh.position.y = y;
        }
      }
    }
    npc.cooldown -= dt;
    const d = npc.mesh.position.distanceTo(npc.target.mesh.position);
    if(d < npc.attributes.rango){
      if(npc.cooldown <= 0){
        shootProjectile(npc, npc.target);
        npc.cooldown = npc.attributes.cadencia;
      }
    }
    updateHealthBar(npc);
  }
}

export function updateHealthBar(npc){
  const r = Math.max(0, npc.attributes.vida / npc.attributes.vidaMax);
  npc.healthBar.scale.x = Math.max(0.001, r);
  npc.healthBar.position.x = -0.99 + 0.99*r;
  const h = 0.33 * r;
  npc.healthBar.material.color.setHSL(h, 1, 0.5);
}

export function findNearestEnemy(npc){
  let nearest = null, minD = Infinity;
  for(const e of npcs){
    if(e.team === npc.team || e.status !== 'vivo') continue;
    const d = npc.mesh.position.distanceTo(e.mesh.position);
    if(d < minD){ minD = d; nearest = e; }
  }
  return nearest;
}

export function dealDamage(attacker, target, amount){
  const dmg = Math.max(0, amount - target.attributes.defensa);
  target.attributes.vida -= dmg;
  spawnHitParticles(target.mesh.position.clone());
  if(target.attributes.vida <= 0){
    target.status = 'muerto';
    scene.remove(target.mesh);
  }
}
