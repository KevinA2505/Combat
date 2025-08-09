import * as THREE from 'three';
import { scene, config, disposeMesh } from '../simulation/engine.js';
import { dealDamage } from './npcs.js';

export const projectiles = [];
export const particleBursts = [];

export function shootProjectile(npc, target){
  const startPos = npc.mesh.position.clone();
  const endPos = target.mesh.position.clone();
  const dir = endPos.clone().sub(startPos).normalize();
  let m, trail, light;
  if(npc.type === 'mago'){
    const geom = new THREE.SphereGeometry(0.2, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0x8844ff });
    m = new THREE.Mesh(geom, mat);
    m.position.copy(startPos);
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

export function spawnHitParticles(pos){
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

export function updateProjectiles(dt){
  for(let i=projectiles.length-1; i>=0; i--){
    const p = projectiles[i];
    p.mesh.position.addScaledVector(p.vel, dt);
    const dir = p.vel.clone().normalize();
    p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
    if(p.light){ p.light.position.copy(p.mesh.position); }
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
