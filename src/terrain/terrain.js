import * as THREE from 'three';
import { config, scene, rand, disposeMesh, rngSeed } from '../simulation/engine.js';

export let navGrid = null;
export let heightMap = null;
export let terrain = null;
export const obstacles = [];

export function initNavGrid(){
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

export function worldToGrid(x, z){
  if(typeof x === 'object'){ z = x.z; x = x.x; }
  const gx = Math.floor((x + config.terrainSize/2) / navGrid.cellSize);
  const gz = Math.floor((z + config.terrainSize/2) / navGrid.cellSize);
  return {
    x: THREE.MathUtils.clamp(gx, 0, navGrid.width-1),
    z: THREE.MathUtils.clamp(gz, 0, navGrid.height-1)
  };
}

export function gridToWorld(gx, gz){
  const wx = gx * navGrid.cellSize - config.terrainSize/2 + navGrid.cellSize/2;
  const wz = gz * navGrid.cellSize - config.terrainSize/2 + navGrid.cellSize/2;
  const h = navGrid.cells[gz]?.[gx]?.height || 0;
  return new THREE.Vector3(wx, h + 1.1, wz);
}

export function getTerrainHeight(x, z){
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

export function findPath(start, end){
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

export function generateTerrain(){
  if(terrain) { scene.remove(terrain); disposeMesh(terrain); terrain = null; }
  initNavGrid();
  const geom = new THREE.PlaneGeometry(config.terrainSize, config.terrainSize, 64, 64);
  heightMap = Array.from({ length: navGrid.height }, () => Array(navGrid.width).fill(0));
  const pos = geom.attributes.position;
  for(let i=0; i<pos.count; i++){
    const x = pos.getX(i) * 0.08;
    const y = pos.getY(i) * 0.08;
    const h = fbmNoise(x, y) * 4.0;
    pos.setZ(i, h);
  }
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

export function generateObstacles(){
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
    const py = 0.0 + h;
    m.position.set(px, py, pz);
    m.userData.radius = isTree ? 1.0 : 1.2;
    scene.add(m); obstacles.push(m);

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

function baseNoise(x, y){
  const n = Math.sin((x*127.1 + y*311.7 + rngSeed) * 43758.5453);
  return (n - Math.floor(n));
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
  return lerp(nx0, nx1, yf) * 2 - 1;
}

function fbmNoise(x, y){
  let f = 0, amp = 1, freq = 1;
  for(let o=0; o<4; o++){ f += amp * smoothNoise(x*freq, y*freq); amp *= 0.5; freq *= 2.0; }
  return f;
}
