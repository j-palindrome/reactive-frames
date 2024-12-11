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
  return (
    <Asemic>
      <Brush
        render={b =>
          b
            .text('the open', {
              translate: [0.1, 0.5],
              scale: 0.8,
              alpha: 0
            })
            .debug()
        }
      />
    </Asemic>
  )
}
