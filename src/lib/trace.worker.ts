import { trace, type TraceInput, type TraceOptions } from './trace'

self.onmessage = (e: MessageEvent<{ id: number; image: TraceInput; options: TraceOptions }>) => {
  const { id, image, options } = e.data
  try {
    self.postMessage({ id, result: trace(image, options) })
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message })
  }
}
