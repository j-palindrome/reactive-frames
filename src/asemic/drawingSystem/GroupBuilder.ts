import { Matrix, Matrix3, Vector2 } from 'three'

const vector = new Vector2()
export default class GroupBuilder extends Matrix3 {
  targetGroups: [number, number]
  groups: CurvePoint[][]

  constructor() {
    super()
    this.makeRotation(0).makeScale(1, 1).makeTranslation(0, 0)
    this.groups = []
    this.targetGroups = [0, 0]
  }

  targetGroup(from: number, to?: number) {
    if (from < 0) from += this.groups.length
    if (to === undefined) to = from
    else if (to < 0) to += this.groups.length
    this.targetGroups = [from, to]
    return this
  }

  shape(sides: number, strength: number, arcLength: Coordinate) {
    const points: CurvePoint[] = []
    vector.set(0.5, 0.5)
    for (let i = 0; i < sides; i++) {
      points.push({
        position: new Vector2(-0.5, -0.5)
          .rotateAround({ x: 0, y: 0 }, (Math.PI * 2) / sides)
          .add(vector),
        strength,
        curveProgress: 0,
        pointProgress: 0
      })
    }
  }

  addGroup() {
    this.groups.push([])
    this.targetGroup(-1)
  }
}
