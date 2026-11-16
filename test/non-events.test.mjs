import test from 'node:test';
import assert from 'node:assert/strict';
import { isNonEventTitle } from '../lib/non-events.js';

test('administration and waste collection are not events', () => {
  for (const t of [
    'Restmüllabholung', 'Bio Entleerung', 'Gelber Sack', 'Altpapier -Abfuhrgebiet1', 'Abholung Altpapier (Rote Tonne)',
    'Sperrmüll- und Problemstoffsammlung', 'Müll 1', 'Müllabfuhr – Restmüll MP', 'Biomüll-Abfuhr', 'Kompostabfuhr',
    'Gemeinderatssitzung', '4. Gemeinderatssitzung', 'Öffentliche Sitzung des Gemeinderates', 'Gemeinderat',
    'Notarsprechtag', 'Amtstag Notariat Dr. Eberhard Wölfer', 'Sprechtag Volksanwaltschaft', 'Bürgermeister Sprechstunde',
    'Kostenlose Rechtsberatung', 'Sprechstunde_Community_Nurse', 'Betriebsanlagen-Sprechtage bei der BH Freistadt',
  ]) assert.equal(isNonEventTitle(t), true, t);
});

test('real events that mention those words stay', () => {
  for (const t of [
    'Blutspendeaktion', 'Friedenslicht Abholung', 'Mutter-Eltern-Beratung', 'Kindergemeinderat', 'Pfarrgemeinderatswahl',
    'Vortrag: Was kann ein Notar für mich tun?!', 'AK NÖ - Notar Infoveranstaltung', 'Tauschtag im ASZ - Neues Leben für schöne Dinge',
    '10 Jahre ASZ Region Hausruck', 'Basteln mit Altpapier', 'Faszination Leguminosen (Hülsenfrüchte)',
    'Weihnachtslesung von Gerda Müller-Wieser', 'Gebrüder-Neumüller-Nachwuchsfußballturnier', 'Adventmarkt',
  ]) assert.equal(isNonEventTitle(t), false, t);
});
