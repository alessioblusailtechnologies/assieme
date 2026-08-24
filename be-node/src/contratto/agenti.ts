import { z } from 'zod';

import type { Citazione } from './conversazioni.js';

/**
 * Agenti (Modulo E, RF-E-01…E-13) — lo specchio di
 * `fe-angular/core/models/agente.ts`, col comportamento fissato da
 * `mocks/agenti.mjs`. Le fonti viaggiano nude nei corpi di richiesta e
 * idratate (con l'etichetta pronta) nelle risposte, come il contesto della
 * chat.
 */

export type FormatoOutputAgente = 'testo' | 'tabella' | 'documento';

export type NuovaFonteAgente =
  | { tipo: 'documento'; documentoId: string; archivio: 'pubblico' | 'privato' }
  | {
      tipo: 'selezione';
      archivio: 'pubblico' | 'privato';
      ramoId?: string;
      compagniaId?: string;
      soloPreferiti?: boolean;
    }
  | { tipo: 'documenti-riferimento' };

export type FonteAgente = NuovaFonteAgente & { etichetta: string };

export interface ParametroAgente {
  chiave: string;
  etichetta: string;
  tipo: 'testo' | 'documento';
  obbligatorio: boolean;
  suggerimento?: string;
}

export interface Pianificazione {
  frequenza: 'giornaliera' | 'settimanale' | 'mensile';
  orario: string;
  giornoSettimana?: number;
  giornoMese?: number;
  sospesa: boolean;
}

export interface Agente {
  id: string;
  nome: string;
  descrizione: string;
  istruzioni: string;
  fonti: FonteAgente[];
  formatoOutput: FormatoOutputAgente;
  templateOutputId?: string;
  parametri: ParametroAgente[];
  pianificazione?: Pianificazione;
  attivo: boolean;
  creatoDa: string;
  aggiornatoIl: string;
}

export type StatoEsecuzione = 'in-coda' | 'in-corso' | 'completata' | 'fallita';

export interface RigaLog {
  istante: string;
  livello: 'info' | 'avviso' | 'errore';
  messaggio: string;
}

export interface EsecuzioneAgente {
  id: string;
  agenteId: string;
  avviataIl: string;
  conclusaIl?: string;
  modalita: 'manuale' | 'pianificata';
  stato: StatoEsecuzione;
  parametri?: Record<string, string>;
  tentativi: number;
  output?: string;
  citazioni: Citazione[];
  documentoGeneratoUrl?: string;
  log: RigaLog[];
  errore?: string;
}

export type EsecuzioneRiepilogo = Omit<EsecuzioneAgente, 'parametri' | 'output' | 'citazioni' | 'log'>;

export interface AgenteRiepilogo {
  id: string;
  nome: string;
  descrizione: string;
  attivo: boolean;
  formatoOutput: FormatoOutputAgente;
  pianificazione?: Pianificazione;
  numeroFonti: number;
  ultimaEsecuzione?: EsecuzioneRiepilogo;
}

export interface LimitiAgenti {
  agentiAttiviMax: number;
  agentiAttivi: number;
  esecuzioniConcorrentiMax: number;
  esecuzioniInCorso: number;
  frequenzaMinima: 'giornaliera' | 'settimanale' | 'mensile';
}

export const schemaFonte = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('documento'),
    documentoId: z.string().min(1),
    archivio: z.enum(['pubblico', 'privato']),
  }),
  z.object({
    tipo: z.literal('selezione'),
    archivio: z.enum(['pubblico', 'privato']),
    ramoId: z.string().min(1).optional(),
    compagniaId: z.string().min(1).optional(),
    soloPreferiti: z.boolean().optional(),
  }),
  z.object({ tipo: z.literal('documenti-riferimento') }),
]);

export const schemaParametro = z.object({
  chiave: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, 'La chiave del parametro è un identificatore.'),
  etichetta: z.string().trim().min(1).max(120),
  tipo: z.enum(['testo', 'documento']).default('testo'),
  obbligatorio: z.boolean().default(false),
  suggerimento: z.string().trim().min(1).max(200).optional(),
});

export const schemaPianificazione = z
  .object({
    frequenza: z.enum(['giornaliera', 'settimanale', 'mensile']),
    orario: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "L'orario è HH:mm."),
    giornoSettimana: z.number().int().min(1).max(7).optional(),
    giornoMese: z.number().int().min(1).max(28).optional(),
    sospesa: z.boolean().default(false),
  })
  .transform((p) => ({
    ...p,
    ...(p.frequenza === 'settimanale' && { giornoSettimana: p.giornoSettimana ?? 1 }),
    ...(p.frequenza === 'mensile' && { giornoMese: p.giornoMese ?? 1 }),
  }));

export const schemaNuovoAgente = z.object({
  nome: z.string().trim().min(1).max(120),
  descrizione: z.string().trim().max(500).default(''),
  istruzioni: z.string().trim().min(1).max(6000),
  fonti: z.array(schemaFonte).min(1).max(20),
  formatoOutput: z.enum(['testo', 'tabella', 'documento']).default('testo'),
  templateOutputId: z.string().min(1).optional(),
  parametri: z.array(schemaParametro).max(10).default([]),
  pianificazione: schemaPianificazione.optional(),
});

/** Ogni campo è indipendente; `null` toglie ciò che c'era (mock). */
export const schemaModificheAgente = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  descrizione: z.string().trim().max(500).optional(),
  istruzioni: z.string().trim().min(1).max(6000).optional(),
  fonti: z.array(schemaFonte).min(1).max(20).optional(),
  formatoOutput: z.enum(['testo', 'tabella', 'documento']).optional(),
  templateOutputId: z.string().min(1).nullable().optional(),
  parametri: z.array(schemaParametro).max(10).optional(),
  pianificazione: schemaPianificazione.nullable().optional(),
  attivo: z.boolean().optional(),
});

export const schemaAvvioEsecuzione = z.object({
  parametri: z.record(z.string(), z.string()).optional(),
});
