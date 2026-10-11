declare module 'clipper-lib' {
  type IntPoint = { X: number; Y: number }
  type Path = IntPoint[]
  type Paths = Path[]

  class Clipper {
    AddPath(path: Path, polyType: number, closed: boolean): boolean
    AddPaths(paths: Paths, polyType: number, closed: boolean): boolean
    Execute(clipType: number, solution: Paths, subjFill?: number, clipFill?: number): boolean
    static CleanPolygons(paths: Paths, distance?: number): Paths
  }

  class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number)
    AddPaths(paths: Paths, joinType: number, endType: number): void
    Execute(solution: Paths, delta: number): void
  }

  const ClipperLib: {
    Clipper: typeof Clipper
    ClipperOffset: typeof ClipperOffset
    ClipType: { ctIntersection: number; ctUnion: number; ctDifference: number; ctXor: number }
    PolyType: { ptSubject: number; ptClip: number }
    PolyFillType: { pftEvenOdd: number; pftNonZero: number; pftPositive: number; pftNegative: number }
    JoinType: { jtSquare: number; jtRound: number; jtMiter: number }
    EndType: { etOpenSquare: number; etOpenRound: number; etOpenButt: number; etClosedLine: number; etClosedPolygon: number }
  }
  export default ClipperLib
}
