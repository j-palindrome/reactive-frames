import { cloneDeep, sumBy } from 'lodash'
import { Vector2 } from 'three'
import GroupBuilder from './GroupBuilder'
import { PointVector } from './PointVector'

const vector = new Vector2()
const vector2 = new Vector2()
const vector3 = new Vector2()
export class Keyframes {
  keyframes: KeyframeData[]
  private targetFrames: [number, number]
  private targetGroups: [number, number]
  curveCounts: number[]

  constructor(generate: ((g: GroupBuilder) => GroupBuilder)[]) {
    const startCurves = generate.map(generate => generate(new GroupBuilder()))
    this.keyframes = [{ groups: startCurves.map(x => x.curves) }]
    this.targetGroups = [0, this.keyframes[0].groups.length]
    this.targetFrames = [0, 0]
    this.curveCounts = this.keyframes[0].groups.map(x => x.length)
  }

  debug() {
    console.log(
      cloneDeep(this.keyframes)
        .slice(this.targetFrames[0], this.targetFrames[1] + 1)
        .map(x =>
          x.groups
            .slice(this.targetGroups[0], this.targetGroups[1] + 1)
            .map(g =>
              g
                .map(c =>
                  c
                    .map(
                      p =>
                        `${p.position
                          .toArray()
                          .map(p => Math.floor(p * 100))
                          .join(',')}`
                    )
                    .join(' ')
                )
                .join('\n')
            )
            .join('\n\n')
        )
        .join('\n\n')
    )
    return this
  }

  copyFrame(keyframe: number, copyCount: number = 1) {
    if (keyframe < 0) keyframe += this.keyframes.length
    for (let i = 0; i < copyCount; i++) {
      this.keyframes.push(cloneDeep(this.keyframes[keyframe]))
    }
    this.targetFrames = [keyframe + 1, this.keyframes.length - 1]
    return this
  }

  interpolateFrame(keyframe: number, amount = 0.5) {
    const interpKeyframe = cloneDeep(this.keyframes[keyframe])
    interpKeyframe.groups.forEach((group, groupI) =>
      group.forEach((x, curveI) =>
        x.forEach((point, pointI) =>
          point.position.lerp(
            this.keyframes[keyframe + 1].groups[groupI][curveI][pointI]
              .position,
            amount
          )
        )
      )
    )
    this.keyframes.splice(keyframe + 1, 0, interpKeyframe)
    return this
  }

  targetFrame(from: number, to?: number) {
    if (from < 0) from += this.keyframes.length
    if (to === undefined) to = from
    else if (to < 0) to += this.keyframes.length
    this.targetFrames = [from, to]
    return this
  }

  targetGroup(from: number, to?: number) {
    if (from < 0) from += this.curveCounts.length
    if (to === undefined) to = from
    else if (to < 0) to += this.curveCounts.length
    this.targetGroups = [from, to]
    return this
  }

  eachFrame(callback: (frame: KeyframeData) => void) {
    for (let i = this.targetFrames[0]; i <= this.targetFrames[1]; i++) {
      callback(this.keyframes[i])
    }
    return this
  }

  eachGroup(callback: (curve: PointVector[]) => void) {
    return this.eachFrame(frame => {
      for (let i = this.targetGroups[0]; i <= this.targetGroups[1]; i++) {
        for (let curve of frame.groups[i]) {
          callback(curve)
        }
      }
    })
  }

  eachPoint(callback: (point: PointVector) => void) {
    return this.eachGroup(curve => {
      curve.forEach(point => callback(point))
    })
  }
}
