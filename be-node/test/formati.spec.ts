import { describe, expect, it } from 'vitest';

import { schemaEsportazioneElaborata } from '../src/contratto/conversazioni.js';
import { consegnabile, estensioneDi, mimeDi, timbrabile } from '../src/contratto/formati.js';

/**
 * I formati in uscita (11/09/2026, fase 1 di `PIANO-LINK-E-FORMATI.md`):
 * qualsiasi file tranne gli eseguibili, col suo tipo, e il timbro
 * dell'agenzia solo dove il worker lo sa stampare.
 */
describe('i formati consegnabili', () => {
  it('qualsiasi estensione, PowerPoint compreso; gli eseguibili no', () => {
    for (const f of ['pdf', 'docx', 'xlsx', 'pptx', 'html', 'png', 'jpg', 'svg', 'csv', 'zip', 'mp4', 'md', 'json', '7z', 'dwg']) {
      expect(consegnabile(f), f).toBe(true);
    }
    for (const f of ['exe', 'msi', 'bat', 'cmd', 'ps1', 'vbs', 'js', 'jar', 'apk', 'sh', 'dmg', '', 'pdf.exe', 'PDF', 'formato-lunghissimo']) {
      expect(consegnabile(f), f).toBe(false);
    }
  });

  it('il tipo di ogni formato, e un binario generico per quelli che non conosciamo', () => {
    expect(mimeDi('pptx')).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    expect(mimeDi('html')).toBe('text/html; charset=utf-8');
    expect(mimeDi('png')).toBe('image/png');
    expect(mimeDi('dwg')).toBe('application/octet-stream');
  });

  it('il timbro solo su PDF, Word ed Excel', () => {
    expect(['pdf', 'docx', 'xlsx'].every(timbrabile)).toBe(true);
    expect(['pptx', 'html', 'png', 'csv'].some(timbrabile)).toBe(false);
  });

  it('l’estensione dal nome del file', () => {
    expect(estensioneDi('Presentazione Scudo Cyber.HTML')).toBe('html');
    expect(estensioneDi('archivio.tar.gz')).toBe('gz');
    expect(estensioneDi('senza-estensione')).toBe('');
    expect(estensioneDi('.nascosto')).toBe('');
    expect(estensioneDi('punto-finale.')).toBe('');
  });

  it('«Genera da modello» accetta qualsiasi formato, ripulito, ma non un eseguibile', () => {
    expect(schemaEsportazioneElaborata.parse({ formato: ' .HTML ' })).toEqual({ formato: 'html' });
    expect(schemaEsportazioneElaborata.safeParse({ formato: 'exe' }).success).toBe(false);
    expect(schemaEsportazioneElaborata.safeParse({}).success).toBe(false);
  });
});
