import { Composition, Still } from 'remotion';
import { MemoriaViva, DURATION, FPS, HEIGHT, WIDTH } from './MemoriaViva';
import { AgentiStill, SHOT_H, SHOT_W, TabellaStill } from './Schermate';

export const Root: React.FC = () => (
  <>
    <Composition
      id="MemoriaViva"
      component={MemoriaViva}
      durationInFrames={DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Still id="Tabella" component={TabellaStill} width={SHOT_W} height={SHOT_H} />
    <Still id="Agenti" component={AgentiStill} width={SHOT_W} height={SHOT_H} />
  </>
);
