import { range } from 'lodash'
import { Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Builder from '../../src/asemic/drawingSystem/Builder'
import { PointBuilder } from '../../src/asemic/drawingSystem/PointBuilder'

export default function ParticlesTest() {
  // abcdefghijklmnopqrstuvwxyz
  // a poem in space
  const strokes = `
wholesome > +0.1,0.5 *0.8 @[0 0.5] *[0.5 2 0.4] > +0,-0.5 *[0.5 2] @[-1 1] >0
`

  return (
    <Reactive
      progress={t => {
        return (t / 2) % 1
      }}>
      <Asemic
        name='a'
        src={() =>
          range(1).map(
            i =>
              new Builder(
                g =>
                  g.eval(g => {
                    g.newBlankFrame().eval(g => {
                      g.newGroup()
                        .newShape('circle')
                        .setWarpGroups([
                          {
                            translate: g.getRandomWithin(
                              [0.5, 0.5],
                              [0.3, 0.3]
                            ),
                            scale: g.getRandomWithin(0.1, 0.1)
                          }
                        ])
                        .newGroup({ transform: { reset: true } })
                        .newPoints(g.getRandomAlong([0, 0], [1, 0]))
                        .newPoints(
                          g.newIntersect(
                            [
                              g.getLastPoint(),
                              g.getLastGroup(-2).transform.translate
                            ],
                            { curve: 0, group: -2 }
                          )
                        )
                    }, 100)
                  }, 2),

                {
                  // timeOptions: {
                  //   modifyTime: t => ((t + i / 3) * (i / 10 + 0.5)) % 1
                  // },
                  loop: false,
                  recalculate: 1
                }
              )
          )
        }
      />
    </Reactive>
  )
}
