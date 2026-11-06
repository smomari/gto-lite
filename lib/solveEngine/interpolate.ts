/** A tuning point at one effective stack. Anchor lists are sorted by `stackBb`. */
export interface StackAnchor {
  stackBb: number;
}

/** The anchors either side of `stackBb` and how far it sits between them. Outside the first and last, both are that anchor. */
export function anchorsAround<A extends StackAnchor>(anchors: readonly A[], stackBb: number): { lo: A; hi: A; t: number } {
  const upper = anchors.findIndex((a) => a.stackBb >= stackBb);
  if (upper === 0) return { lo: anchors[0], hi: anchors[0], t: 0 };
  if (upper === -1) {
    const last = anchors[anchors.length - 1];
    return { lo: last, hi: last, t: 0 };
  }
  const lo = anchors[upper - 1];
  const hi = anchors[upper];
  return { lo, hi, t: (stackBb - lo.stackBb) / (hi.stackBb - lo.stackBb) };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** A value picked from each anchor, interpolated linearly between them and flat outside them. */
export function interpolateByStack<A extends StackAnchor>(anchors: readonly A[], stackBb: number, pick: (anchor: A) => number): number {
  const { lo, hi, t } = anchorsAround(anchors, stackBb);
  return lerp(pick(lo), pick(hi), t);
}
