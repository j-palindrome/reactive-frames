import { Processing, Reactive } from '../../src'

export default function P5Test() {
  return (
    <Reactive className='h-screen w-screen'>
      <Processing
        name='p'
        type='p2d'
        className='!h-full !w-full'
        draw={p => {
          // drowowowow
          console.log(p.height, p.width)
        }}
      />
    </Reactive>
  )
}
