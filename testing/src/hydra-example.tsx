import { Reactive, Hydra } from '../../src'

export default function HydraExample() {
  return (
    <Reactive className='h-screen w-screen'>
      <Hydra
        name='hydra'
        className='h-full w-full'
        width={1080}
        height={1080}
        noResize
        setup={self => {
          self.osc(10, 0.5).out()
        }}
        draw={(self, { time }) => {
          // if (Math.floor(time) % 2) {
          //   self.solid(1, 0.5, 6).out()
          // } else {
          //   self.noise(100).out()
          // }
        }}
      />
    </Reactive>
  )
}
