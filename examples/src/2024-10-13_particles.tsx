import { cloneDeep, pick, range, sample } from 'lodash'
import { Canvas2D, Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush from '../../src/asemic/Brush'
import Builder from '../../src/asemic/drawingSystem/Builder'
import { QuadraticBezierCurve, Vector2 } from 'three'

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
      .transform({ translate: [0, 0.33] })
  const yang = (b: Builder) =>
    b.newCurve([0, 0], [1, 0]).transform({ translate: [0, 0.33] })
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
    b.eval(b => {
      b.newGroup({
        scale: [1, 0.3],
        translate: [0, 0.1]
      })

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

      i = (i + 1) % 6
      return b
    })
  })

  return (
    <Reactive progress={t => (t * 5) % 1}>
      <Asemic name='a'>
        <Brush
          keyframes={kf}
          name='b'
          defaults={{
            a: 1,
            size: [1, 1]
          }}
          recalculate
        />
      </Asemic>
    </Reactive>
  )
}
