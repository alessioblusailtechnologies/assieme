import { Composition } from 'remotion';
import { MemoriaViva, DURATION, FPS, HEIGHT, WIDTH } from './MemoriaViva';

export const Root: React.FC = () => (
  <Composition
    id="MemoriaViva"
    component={MemoriaViva}
    durationInFrames={DURATION}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);
