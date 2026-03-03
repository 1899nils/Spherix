// Stub type declaration for @mapbox/point-geometry.
// The real @types/mapbox__point-geometry package is not installed, but some
// transitive dependency causes TypeScript to look for it. This stub satisfies
// the lookup without adding the package to the lockfile.
export = Point;

declare class Point {
  x: number;
  y: number;
  constructor(x: number, y: number);
  clone(): Point;
  add(p: Point): Point;
  sub(p: Point): Point;
  mult(k: number): Point;
  div(k: number): Point;
  neg(): Point;
  dot(p: Point): number;
  mag(): number;
  unit(): Point;
  perp(): Point;
  rotate(a: number): Point;
  dist(p: Point): number;
  distSqr(p: Point): number;
  angle(): number;
  static convert(a: [number, number] | Point): Point;
}
