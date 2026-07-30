import * as THREE from 'three';
import { buildFacetWedges, type Point2D, SHIELD_CENTER } from './shieldGeometry';

const SCALE = 0.026;
const SCATTER_DISTANCE = 1.6;
const DEPTH = 0.1;

export interface WedgeRuntime {
  index: number;
  geometry: THREE.ExtrudeGeometry;
  assembledPos: THREE.Vector3;
  scatteredPos: THREE.Vector3;
  scatteredRot: THREE.Euler;
}

function toLocal(pt: Point2D, origin: Point2D): THREE.Vector2 {
  return new THREE.Vector2((pt.x - origin.x) * SCALE, -(pt.y - origin.y) * SCALE);
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Builds one extruded, beveled wedge per capability facet, plus the
// "unforged" scattered transform each one animates in from.
export function buildWedgeRuntimes(): WedgeRuntime[] {
  return buildFacetWedges().map((wedge) => {
    const localCenter = toLocal(wedge.center, wedge.centroid);
    const localA = toLocal(wedge.a, wedge.centroid);
    const localB = toLocal(wedge.b, wedge.centroid);

    const shape = new THREE.Shape();
    shape.moveTo(localCenter.x, localCenter.y);
    shape.lineTo(localA.x, localA.y);
    shape.lineTo(localB.x, localB.y);
    shape.lineTo(localCenter.x, localCenter.y);

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: DEPTH,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 3,
      curveSegments: 1
    });
    // Center depth only — the XY origin is intentionally the wedge centroid so
    // position and rotation pivot correctly.
    geometry.translate(0, 0, -DEPTH / 2);

    const assembledPos = new THREE.Vector3(
      (wedge.centroid.x - SHIELD_CENTER.x) * SCALE,
      -(wedge.centroid.y - SHIELD_CENTER.y) * SCALE,
      0
    );

    const outward = new THREE.Vector3(wedge.outward.x, -wedge.outward.y, 0.35);
    const scatteredPos = assembledPos.
    clone().
    add(outward.multiplyScalar(SCATTER_DISTANCE));

    const scatteredRot = new THREE.Euler(
      (wedge.index % 2 === 0 ? 1 : -1) * 0.5,
      (wedge.index % 3 === 0 ? 1 : -1) * 0.4,
      (wedge.index % 2 === 0 ? -1 : 1) * 0.3
    );

    return { index: wedge.index, geometry, assembledPos, scatteredPos, scatteredRot };
  });
}

// A small brand-colored gradient used as an equirectangular environment map,
// so the brushed-chrome material has something credible to reflect without
// pulling in an external HDRI.
export function createEnvironmentTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#F7F8FA');
    gradient.addColorStop(0.35, '#C2C9D2');
    gradient.addColorStop(0.6, '#146575');
    gradient.addColorStop(1, '#0A1428');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // A soft specular band, so highlights sweep across the metal as it turns.
    const highlight = ctx.createRadialGradient(38, 18, 2, 38, 18, 26);
    highlight.addColorStop(0, 'rgba(255,255,255,0.95)');
    highlight.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = highlight;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}