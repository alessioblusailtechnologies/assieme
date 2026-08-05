import type { IconSvgObject } from '@hugeicons/angular';

/*
 * Import per singola icona anziché dal barile del pacchetto, e con export
 * predefinito: è la forma che espongono i sottopercorsi di Hugeicons.
 *
 * `@hugeicons/core-free-icons` contiene 5442 icone. Il barile si
 * tree-shakerebbe comunque in produzione (`sideEffects: false`), ma la build
 * di sviluppo non tree-shaka: importarlo intero significherebbe far
 * risolvere e servire migliaia di moduli a ogni avvio del dev server.
 * Il sottopercorso costa qualche riga in più e la ricarica resta immediata.
 */
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import AlertCircleIcon from '@hugeicons/core-free-icons/AlertCircleIcon';
import AtIcon from '@hugeicons/core-free-icons/AtIcon';
import ArrowDown01Icon from '@hugeicons/core-free-icons/ArrowDown01Icon';
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import Attachment01Icon from '@hugeicons/core-free-icons/Attachment01Icon';
import BotIcon from '@hugeicons/core-free-icons/BotIcon';
import Brain02Icon from '@hugeicons/core-free-icons/Brain02Icon';
import BubbleChatIcon from '@hugeicons/core-free-icons/BubbleChatIcon';
import Building03Icon from '@hugeicons/core-free-icons/Building03Icon';
import Calendar03Icon from '@hugeicons/core-free-icons/Calendar03Icon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
import Clock01Icon from '@hugeicons/core-free-icons/Clock01Icon';
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon';
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon';
import Download03Icon from '@hugeicons/core-free-icons/Download03Icon';
import File02Icon from '@hugeicons/core-free-icons/File02Icon';
import FileExportIcon from '@hugeicons/core-free-icons/FileExportIcon';
import FilterIcon from '@hugeicons/core-free-icons/FilterIcon';
import Folder01Icon from '@hugeicons/core-free-icons/Folder01Icon';
import FolderLibraryIcon from '@hugeicons/core-free-icons/FolderLibraryIcon';
import InformationCircleIcon from '@hugeicons/core-free-icons/InformationCircleIcon';
import LibraryIcon from '@hugeicons/core-free-icons/LibraryIcon';
import LinkSquare02Icon from '@hugeicons/core-free-icons/LinkSquare02Icon';
import Loading03Icon from '@hugeicons/core-free-icons/Loading03Icon';
import Logout03Icon from '@hugeicons/core-free-icons/Logout03Icon';
import Menu01Icon from '@hugeicons/core-free-icons/Menu01Icon';
import MoreVerticalIcon from '@hugeicons/core-free-icons/MoreVerticalIcon';
import PauseIcon from '@hugeicons/core-free-icons/PauseIcon';
import PencilEdit02Icon from '@hugeicons/core-free-icons/PencilEdit02Icon';
import PlayIcon from '@hugeicons/core-free-icons/PlayIcon';
import PlugSocketIcon from '@hugeicons/core-free-icons/PlugSocketIcon';
import PlusSignIcon from '@hugeicons/core-free-icons/PlusSignIcon';
import QuotesIcon from '@hugeicons/core-free-icons/QuotesIcon';
import RefreshIcon from '@hugeicons/core-free-icons/RefreshIcon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import SentIcon from '@hugeicons/core-free-icons/SentIcon';
import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon';
import Share08Icon from '@hugeicons/core-free-icons/Share08Icon';
import SidebarLeft01Icon from '@hugeicons/core-free-icons/SidebarLeft01Icon';
import StarIcon from '@hugeicons/core-free-icons/StarIcon';
import StopIcon from '@hugeicons/core-free-icons/StopIcon';
import Table01Icon from '@hugeicons/core-free-icons/Table01Icon';
import Upload03Icon from '@hugeicons/core-free-icons/Upload03Icon';
import User03Icon from '@hugeicons/core-free-icons/User03Icon';

/**
 * Registro delle icone.
 *
 * I nomi sono **di dominio, non di disegno**: `documento`, `agente`,
 * `memoria`, non `file-02` o `bot`. Due conseguenze pratiche.
 *
 * La prima: cambiare il disegno di un'icona è una riga qui, non una battuta
 * di caccia in trenta template. Se domani "agente" merita un simbolo
 * diverso, o se Hugeicons viene sostituito, l'applicazione non se ne accorge.
 *
 * La seconda: chi scrive un template non deve sfogliare un catalogo di 5442
 * icone per chiedersi quale rappresenti i documenti di riferimento. Il vocabolario
 * dell'interfaccia coincide con quello dei requisiti.
 */
export const REGISTRO_ICONE = {
  // --- Navigazione principale ---
  chat: BubbleChatIcon,
  'archivio-pubblico': LibraryIcon,
  'archivio-privato': Folder01Icon,
  riferimenti: FolderLibraryIcon,
  tabelle: Table01Icon,
  agente: BotIcon,
  memoria: Brain02Icon,
  impostazioni: Settings02Icon,
  mcp: PlugSocketIcon,

  // --- Dominio ---
  documento: File02Icon,
  compagnia: Building03Icon,
  citazione: QuotesIcon,
  utente: User03Icon,
  pianificazione: Calendar03Icon,
  preferito: StarIcon,

  // --- Azioni ---
  carica: Upload03Icon,
  scarica: Download03Icon,
  cerca: Search01Icon,
  filtra: FilterIcon,
  aggiungi: PlusSignIcon,
  modifica: PencilEdit02Icon,
  elimina: Delete02Icon,
  duplica: Copy01Icon,
  condividi: Share08Icon,
  allega: Attachment01Icon,
  esegui: PlayIcon,
  sospendi: PauseIcon,
  invia: SentIcon,
  ferma: StopIcon,
  referenzia: AtIcon,
  esporta: FileExportIcon,
  riprova: RefreshIcon,
  chiudi: Cancel01Icon,
  esci: Logout03Icon,
  'apri-esterno': LinkSquare02Icon,
  'altre-azioni': MoreVerticalIcon,

  // --- Stati e segnali ---
  attesa: Clock01Icon,
  'in-corso': Loading03Icon,
  pronto: CheckmarkCircle02Icon,
  errore: AlertCircleIcon,
  avviso: Alert02Icon,
  informazione: InformationCircleIcon,

  // --- Struttura ---
  menu: Menu01Icon,
  'comprimi-barra': SidebarLeft01Icon,
  'espandi-giu': ArrowDown01Icon,
  'espandi-destra': ArrowRight01Icon,
} as const satisfies Record<string, IconSvgObject>;

/** Nomi ammessi in `<ui-icon name="…">`. Un refuso è un errore di compilazione. */
export type NomeIcona = keyof typeof REGISTRO_ICONE;
