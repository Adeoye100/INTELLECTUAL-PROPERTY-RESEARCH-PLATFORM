// Shared geometry contract for the shield mark, used by both the WebGL scene
// (ShieldScene/shieldMeshes) and the 2D SVG fallback (ShieldStatic).
// The shield is a hexagonal outline divided into 6 triangular facets that
// radiate from a shared center — one facet per capability.

export interface Point2D {
  x: number;
  y: number;
}

// Outline vertices, clockwise from the top point. viewBox-style units (0-200 / 0-240).
export const SHIELD_OUTLINE: Point2D[] = [
{ x: 100, y: 4 }, // V0 - top point
{ x: 187, y: 58 }, // V1 - upper right
{ x: 160, y: 178 }, // V2 - lower right
{ x: 100, y: 234 }, // V3 - bottom point
{ x: 40, y: 178 }, // V4 - lower left
{ x: 13, y: 58 } // V5 - upper left
];

export const SHIELD_CENTER: Point2D = { x: 100, y: 108 };

export interface FacetWedge {
  index: number;
  center: Point2D;
  a: Point2D;
  b: Point2D;
  // Direction the wedge scatters toward when "unforged", normalized.
  outward: Point2D;
  // Centroid of the wedge, used for label placement / hit testing.
  centroid: Point2D;
}

function normalize(v: Point2D): Point2D {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

// Builds the 6 wedges [center, Vi, Vi+1] that tile the shield outline exactly.
export function buildFacetWedges(): FacetWedge[] {
  const wedges: FacetWedge[] = [];
  for (let i = 0; i < 6; i++) {
    const a = SHIELD_OUTLINE[i];
    const b = SHIELD_OUTLINE[(i + 1) % 6];
    const centroid = {
      x: (SHIELD_CENTER.x + a.x + b.x) / 3,
      y: (SHIELD_CENTER.y + a.y + b.y) / 3
    };
    const outward = normalize({
      x: centroid.x - SHIELD_CENTER.x,
      y: centroid.y - SHIELD_CENTER.y
    });
    wedges.push({ index: i, center: SHIELD_CENTER, a, b, outward, centroid });
  }
  return wedges;
}

export function svgWedgePath(wedge: FacetWedge): string {
  const { center, a, b } = wedge;
  return `M ${center.x} ${center.y} L ${a.x} ${a.y} L ${b.x} ${b.y} Z`;
}

export const SHIELD_VIEWBOX = '0 0 200 240';