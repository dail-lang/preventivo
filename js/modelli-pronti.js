// Modelli di preventivo pronti, fatti con le voci del listino medio di Rimini.
// Le quantità sono quelle di un caso tipo (scritto nel nome): vanno corrette con le misure vere.
// Se nel listino dell'impresa una voce ha un prezzo diverso, si usa quello.
import { LISTINO_RIMINI } from './listino-rimini.js';

// [descrizione esatta del listino, quantità]
const MODELLI = [
  {
    nome: 'Tinteggiatura appartamento (80 mq)', oggetto: 'Tinteggiatura interna dell\'appartamento',
    tempi: 'Circa 5 giorni lavorativi.',
    sezioni: [
      ['Preparazione', [
        ['Allestimento cantiere, protezioni di pavimenti e arredi, pulizia giornaliera', '1'],
        ['Stuccatura e carteggiatura di piccole imperfezioni', '300']]],
      ['Tinteggiatura', [
        ['Tinteggiatura pareti e soffitti con idropittura traspirante, due mani', '300'],
        ['Trattamento antimuffa con risanante e pittura specifica', '15']]],
      ['Pulizia', [['Pulizia finale del cantiere', '1']]]
    ]
  },
  {
    nome: 'Ristrutturazione bagno completo (5 mq)', oggetto: 'Ristrutturazione completa del bagno',
    tempi: 'Circa 15 giorni lavorativi dall\'inizio lavori.',
    sezioni: [
      ['Demolizioni e rimozioni', [
        ['Rimozione di sanitari, rubinetterie e accessori del bagno', '4'],
        ['Demolizione di pavimento in piastrelle con relativo sottofondo', '5'],
        ['Rimozione di rivestimento in piastrelle a parete', '22'],
        ['Carico, trasporto e smaltimento macerie in discarica autorizzata', '3']]],
      ['Impianti', [
        ['Rifacimento impianto idraulico bagno, adduzione e scarichi', '1'],
        ['Punto luce sottotraccia completo di frutto e placca', '2'],
        ['Punto presa sottotraccia completo di frutto e placca', '2'],
        ['Assistenza muraria agli impianti (tracce, ripristini, aiuto agli impiantisti)', '1']]],
      ['Massetti e pavimenti', [
        ['Massetto alleggerito per coprire gli impianti, spessore fino a 8 cm', '5'],
        ['Impermeabilizzazione zona doccia con guaina liquida e bandelle', '4'],
        ['Fornitura di gres porcellanato di fascia media', '5,5'],
        ['Posa di pavimento in gres porcellanato fino a 60×60, collante compreso (materiale escluso)', '5']]],
      ['Rivestimenti', [
        ['Fornitura di rivestimento in ceramica di fascia media', '24'],
        ['Posa di rivestimento in ceramica a parete, collante compreso (materiale escluso)', '22'],
        ['Profili angolari in alluminio o acciaio, fornitura e posa', '10']]],
      ['Sanitari e doccia', [
        ['Piatto doccia filo pavimento, fornitura e posa', '1'],
        ['Box doccia in cristallo, fornitura e montaggio', '1'],
        ['Montaggio sanitari sospesi (wc e bidet) con cassetta a incasso', '1'],
        ['Montaggio mobile bagno con lavabo e rubinetteria', '1']]],
      ['Finiture e pulizia', [
        ['Tinteggiatura con pittura lavabile, due mani', '12'],
        ['Pulizia finale del cantiere', '1']]]
    ]
  },
  {
    nome: 'Rifacimento pavimenti appartamento (80 mq)', oggetto: 'Rifacimento dei pavimenti dell\'appartamento',
    tempi: 'Circa 10 giorni lavorativi.',
    sezioni: [
      ['Demolizioni', [
        ['Allestimento cantiere, protezioni di pavimenti e arredi, pulizia giornaliera', '1'],
        ['Demolizione di pavimento in piastrelle con relativo sottofondo', '80'],
        ['Carico, trasporto e smaltimento macerie in discarica autorizzata', '8']]],
      ['Massetti e pavimenti', [
        ['Massetto in sabbia e cemento, spessore medio 5 cm', '80'],
        ['Fornitura di gres porcellanato di fascia media', '88'],
        ['Posa di pavimento in gres porcellanato fino a 60×60, collante compreso (materiale escluso)', '80'],
        ['Battiscopa in gres o legno, fornitura e posa', '100']]],
      ['Pulizia', [['Pulizia finale del cantiere', '1']]]
    ]
  },
  {
    nome: 'Rifacimento cucina: impianti e rivestimento', oggetto: 'Rifacimento impianti e rivestimento della cucina',
    tempi: 'Circa 7 giorni lavorativi.',
    sezioni: [
      ['Demolizioni', [
        ['Rimozione di rivestimento in piastrelle a parete', '8'],
        ['Carico, trasporto e smaltimento macerie in discarica autorizzata', '1']]],
      ['Impianti', [
        ['Rifacimento impianto idraulico cucina', '1'],
        ['Punto presa sottotraccia completo di frutto e placca', '6'],
        ['Punto luce sottotraccia completo di frutto e placca', '2'],
        ['Ripristino di intonaco su piccole superfici e tracce', '6']]],
      ['Rivestimento e finiture', [
        ['Fornitura di rivestimento in ceramica di fascia media', '9'],
        ['Posa di rivestimento in ceramica a parete, collante compreso (materiale escluso)', '8'],
        ['Tinteggiatura con pittura lavabile, due mani', '40'],
        ['Pulizia finale del cantiere', '1']]]
    ]
  },
  {
    nome: 'Rifacimento impianto elettrico appartamento (80 mq)', oggetto: 'Rifacimento dell\'impianto elettrico a norma',
    tempi: 'Circa 10 giorni lavorativi.',
    sezioni: [
      ['Impianto elettrico', [
        ['Rifacimento impianto elettrico appartamento fino a 80 mq, a norma, con certificazione', '1'],
        ['Assistenza muraria agli impianti (tracce, ripristini, aiuto agli impiantisti)', '1']]],
      ['Ripristini e tinteggiatura', [
        ['Ripristino di intonaco su piccole superfici e tracce', '30'],
        ['Tinteggiatura pareti e soffitti con idropittura traspirante, due mani', '300'],
        ['Pulizia finale del cantiere', '1']]]
    ]
  },
  {
    nome: 'Tinteggiatura facciata con ponteggio (400 mq)', oggetto: 'Ripristino e tinteggiatura della facciata',
    tempi: 'Circa 4 settimane, tempo permettendo.',
    sezioni: [
      ['Ponteggio', [['Ponteggio di facciata: montaggio, primo mese di noleggio e smontaggio', '400']]],
      ['Ripristini', [
        ['Ripristino di intonaco esterno ammalorato', '30'],
        ['Ripristino frontalini e sottobalconi con malta strutturale', '20']]],
      ['Tinteggiatura', [
        ['Tinteggiatura facciata con pittura ai silossani, due mani', '400'],
        ['Pulizia finale del cantiere', '1']]]
    ]
  },
  {
    nome: 'Controsoffitto in cartongesso con luci (30 mq)', oggetto: 'Controsoffitto in cartongesso con veletta LED',
    tempi: 'Circa 5 giorni lavorativi.',
    sezioni: [
      ['Cartongesso', [
        ['Controsoffitto in cartongesso su orditura metallica', '30'],
        ['Veletta in cartongesso con predisposizione per strip LED', '8']]],
      ['Impianto elettrico', [['Punto luce sottotraccia completo di frutto e placca', '4']]],
      ['Finiture', [
        ['Tinteggiatura pareti e soffitti con idropittura traspirante, due mani', '30'],
        ['Pulizia finale del cantiere', '1']]]
    ]
  }
];

const prezzoTesto = n => String(n).replace('.', ',');

/** I modelli pronti, con i prezzi del listino dell'impresa quando ci sono (altrimenti i prezzi medi di Rimini). */
export function modelliPronti(listinoImpresa) {
  const rimini = new Map(LISTINO_RIMINI.map(v => [v.desc, v]));
  const mio = new Map((listinoImpresa || []).filter(v => v && v.desc).map(v => [v.desc.trim(), v]));
  let n = 0; const id = () => 'mp' + (++n);
  return MODELLI.map(m => ({
    nome: m.nome, oggetto: m.oggetto, tempi: m.tempi,
    note: 'Sono esclusi i lavori non indicati nel presente preventivo.',
    iva: 10, dettaglio: 'voci', sconto: { tipo: '%', valore: '' },
    sezioni: m.sezioni.map(([titolo, voci]) => ({
      id: id(), titolo,
      voci: voci.map(([desc, qta]) => {
        const r = rimini.get(desc); const p = mio.get(desc);
        const prezzo = p && isFinite(Number(p.prezzo)) && Number(p.prezzo) > 0 ? p.prezzo : r.prezzo;
        return { id: id(), desc, um: r.um, qta, prezzo: prezzoTesto(prezzo), ...(p && p.costo != null && p.costo !== '' ? { costo: prezzoTesto(p.costo) } : {}) };
      })
    }))
  }));
}
