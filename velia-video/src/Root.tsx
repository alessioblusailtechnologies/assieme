import { Composition, Still } from 'remotion';
import { MemoriaViva, DURATION, FPS, HEIGHT, WIDTH } from './MemoriaViva';
import { AgentiStill, SHOT_H, SHOT_W, TabellaStill } from './Schermate';
import { BOARD_H, BOARD_W, LogoBoard } from './LogoBoard';
import {
  AGE_DUR,
  AST_FPS,
  AST_H,
  AST_W,
  AstrattoAgenti,
  AstrattoBiblioteca,
  AstrattoMetodo,
  BIB_DUR,
  MET_DUR,
} from './Astratti';

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
    <Still id="LogoBoard" component={LogoBoard} width={BOARD_W} height={BOARD_H} />
    <Composition
      id="AstrattoBiblioteca"
      component={AstrattoBiblioteca}
      durationInFrames={BIB_DUR}
      fps={AST_FPS}
      width={AST_W}
      height={AST_H}
    />
    <Composition
      id="AstrattoMetodo"
      component={AstrattoMetodo}
      durationInFrames={MET_DUR}
      fps={AST_FPS}
      width={AST_W}
      height={AST_H}
    />
    <Composition
      id="AstrattoAgenti"
      component={AstrattoAgenti}
      durationInFrames={AGE_DUR}
      fps={AST_FPS}
      width={AST_W}
      height={AST_H}
    />
  </>
);
