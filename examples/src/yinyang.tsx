import { cloneDeep, last, pick, range, sample } from 'lodash'
import { Canvas2D, Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush from '../../src/asemic/Brush'
import Builder from '../../src/asemic/drawingSystem/Builder'
import { QuadraticBezierCurve, Vector2 } from 'three'
import { TransformApplication } from '../../dist/utilities/shaderGeneration/glsl/Glsl'
import { TransformDefinition } from '../../dist/utilities/shaderGeneration/glsl/transformDefinitions'

const letters = 'abcdefghijklmnopqrstuvwxyz'.split('')
const presets: Record<string, (g: Builder) => Builder> = {
  alphabet: g =>
    g
      .text(
        range(10)
          .map(() => sample(letters))
          .join('')
      )
      .setWarp({ translate: [0, 0.5] }),
  testing: g => g.text('testing').setWarp({ translate: [0, 0.5] }),
  lines: g =>
    g.eval(
      () =>
        g.newGroup().eval(() => {
          g.newCurve(
            g.getRandomAlong([0, 0], [1, 0]),
            g.getRandomAlong([0, 1], [1, 1])
          )
        }, 100),
      10
    )
}
export default function ParticlesTest() {
  // abcdefghijklmnopqrstuvwxyz
  // a poem in space
  const yin = (b: Builder) =>
    b
      .newCurve([0, 0], [0.4, 0])
      .newCurve([0.6, 0], [1, 0])
      .transform({ translate: [0, 1 / 6] })
  const yang = (b: Builder) =>
    b.newCurve([0, 0], [1, 0]).transform({ translate: [0, 1 / 6] })
  const abundance55 = (b: Builder) => {
    yang(b)
    yin(b)
    yang(b)
    yang(b)
    yin(b)
    yin(b)
  }
  const bInjured36 = (b: Builder) => {
    yang(b)
    yin(b)
    yang(b)
    yin(b)
    yin(b)
    yin(b)
  }
  const eliminating43 = (b: Builder) => {
    yang(b)
    yang(b)
    yang(b)
    yang(b)
    yang(b)
    yin(b)
  }
  const decrease41 = (b: Builder) => {
    yang(b)
    yang(b)
    yin(b)
    yin(b)
    yin(b)
    yang(b)
  }
  const return24 = (b: Builder) => {
    yang(b)
    yin(b)
    yin(b)
    yin(b)
    yin(b)
    yin(b)
  }
  const union8 = (b: Builder) => {
    yin(b)
    yin(b)
    yin(b)
    yin(b)
    yang(b)
    yin(b)
  }

  let i = 0
  const kf = new Builder(b => {
    const REP = 6
    b.transform({
      scale: [1, 1 / REP],
      translate: [0, 1 / REP / 6 / 2 / 2],
      push: true
    })

    b.eval(b => {
      b.eval(b => {
        b.newGroup()

        switch (i) {
          case 0:
            abundance55(b)
            break
          case 1:
            bInjured36(b)
            break
          case 2:
            eliminating43(b)
            break
          case 3:
            decrease41(b)
            break
          case 4:
            return24(b)
            break
          case 5:
            union8(b)
            break
        }

        b.transform({ reset: 'last', translate: [0, 1 / 6 / 2] })
      }, 2)

      b.transform({ reset: 'last', translate: [0, 1], push: true })
    }, REP)
    i = (i + 1) % 6
  })

  return (
    <Asemic>
      <Brush render={b => b.text('testing')} />
    </Asemic>
  )
}
