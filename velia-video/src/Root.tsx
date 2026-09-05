import { Composition, Still } from 'remotion';
import { MemoriaViva, DURATION, FPS, HEIGHT, WIDTH } from './MemoriaViva';
import { AgentiStill, SHOT_H, SHOT_W, TabellaStill } from './Schermate';
import { BOARD_H, BOARD_W, LogoBoard } from './LogoBoard';
import { FAV_SIZE, Favicon } from './Favicon';
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
import {
  AGZ_DUR,
  BRO_DUR,
  CMP_DUR,
  INT_DUR,
  SoluzioneAgenzie,
  SoluzioneBroker,
  SoluzioneCompagnie,
  SoluzioneIntermediari,
} from './AstrattiSoluzioni';
import { IG_FONTE_DUR, IG_FPS, IG_H, IG_W, IgFonte, QUAD_H, QUAD_W } from './SocialIg';
import { CARD_IG_H, CARD_IG_W, CARD_QUAD_H, CARD_QUAD_W, CardMemoria } from './SocialCard';

export const Root: React.FC = () => (
  <>
    <Composition
      id="MemoriaViva"
      component={MemoriaViva}
      durationInFrames={DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ lingua: 'it' as const }}
    />
    {/* La stessa scena in francese: cambiano i testi e i riferimenti di
        mercato, non il montaggio. Un filmato di prodotto in italiano su una
        pagina francese disfa da solo tutto il lavoro di adattamento. */}
    <Composition
      id="MemoriaVivaFr"
      component={MemoriaViva}
      durationInFrames={DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ lingua: 'fr' as const }}
    />
    <Still id="Tabella" component={TabellaStill} width={SHOT_W} height={SHOT_H} />
    <Still id="Agenti" component={AgentiStill} width={SHOT_W} height={SHOT_H} />
    <Still id="LogoBoard" component={LogoBoard} width={BOARD_W} height={BOARD_H} />
    <Still id="Favicon" component={Favicon} width={FAV_SIZE} height={FAV_SIZE} />
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
    <Composition
      id="SoluzioneAgenzie"
      component={SoluzioneAgenzie}
      durationInFrames={AGZ_DUR}
      fps={AST_FPS}
      width={AST_W}
      height={AST_H}
    />
    <Composition
      id="SoluzioneBroker"
      component={SoluzioneBroker}
      durationInFrames={BRO_DUR}
      fps={AST_FPS}
      width={AST_W}
      height={AST_H}
    />
    <Composition
      id="SoluzioneIntermediari"
      component={SoluzioneIntermediari}
      durationInFrames={INT_DUR}
      fps={AST_FPS}
      width={AST_W}
      height={AST_H}
    />
    <Composition
      id="IgFonte"
      component={IgFonte}
      durationInFrames={IG_FONTE_DUR}
      fps={IG_FPS}
      width={IG_W}
      height={IG_H}
    />
    <Composition
      id="FonteQuadrata"
      component={IgFonte}
      durationInFrames={IG_FONTE_DUR}
      fps={IG_FPS}
      width={QUAD_W}
      height={QUAD_H}
    />
    <Still id="CardMemoria" component={CardMemoria} width={CARD_IG_W} height={CARD_IG_H} />
    <Still
      id="CardMemoriaQuadrata"
      component={CardMemoria}
      width={CARD_QUAD_W}
      height={CARD_QUAD_H}
    />
    <Composition
      id="SoluzioneCompagnie"
      component={SoluzioneCompagnie}
      durationInFrames={CMP_DUR}
      fps={AST_FPS}
      width={AST_W}
      height={AST_H}
    />
  </>
);
