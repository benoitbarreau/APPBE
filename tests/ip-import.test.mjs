// Lot 4 de l'audit du 17/11/2026 : import et contrôles du Tableau IP.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { loadSource } from './support/load-store.mjs'

const imp = await import(loadSource(path.resolve('src/lib/ipImport.ts')))
const sync = await import(loadSource(path.resolve('src/lib/ipTableSync.ts')))
const {
  decodeImportBytes, parseDelimited, mapHeader, pickDataTable, readImportedRows,
  planIPImport, checkImportFile,
} = imp
const { detectIPDuplicates, isValidIPv4, isValidMac, normalizeIPv4, normalizeMac, makeEmptyRow } = sync

const bytes = (...parts) => Uint8Array.from(parts.flatMap(p =>
  typeof p === 'string' ? [...Buffer.from(p, 'latin1')] : p))

// ── 1. Décodage des octets ─────────────────────────────────────────────

test('un CSV Windows-1252 garde « N° SERIE » et les accents', () => {
  const data = bytes('LABEL;N', [0xb0], ' SERIE;R', [0xe9], 'f', [0xe9], 'rence\r\nCAM1;AB', [0x80], '\r\n')
  const { text, encoding } = decodeImportBytes(data)
  assert.equal(encoding, 'windows-1252')
  assert.equal(text, 'LABEL;N° SERIE;Référence\r\nCAM1;AB€\r\n')
})

test('un CSV UTF-8 avec BOM est lu en UTF-8, sans le BOM', () => {
  const data = Uint8Array.from([0xef, 0xbb, 0xbf, ...Buffer.from('LABEL;N° SERIE\n', 'utf8')])
  const { text, encoding } = decodeImportBytes(data)
  assert.equal(encoding, 'utf-8')
  assert.equal(text, 'LABEL;N° SERIE\n')
})

test('un CSV UTF-8 sans BOM est lu en UTF-8', () => {
  const { text, encoding } = decodeImportBytes(Uint8Array.from(Buffer.from('Étiquette;Modèle', 'utf8')))
  assert.equal(encoding, 'utf-8')
  assert.equal(text, 'Étiquette;Modèle')
})

test('la colonne N° SERIE d’un CSV Windows-1252 est reconnue', () => {
  const { text } = decodeImportBytes(bytes('LABEL;N', [0xb0], ' SERIE\r\nCAM1;SN42\r\n'))
  const { rows } = readImportedRows(parseDelimited(text), [])
  assert.equal(rows[0].values.serialNumber, 'SN42')
})

// ── 2. En-têtes et séparateurs ─────────────────────────────────────────

test('IP DANTE SECONDAIRE est reconnue, avec ou sans accent', () => {
  for (const h of ['IP DANTE SECONDAIRE', 'ip dante sécondaire', ' Ip  Dante Secondaire ', 'IP DANTE SEC']) {
    assert.deepEqual(mapHeader(h, []), { kind: 'field', key: 'ipDanteSec' }, h)
  }
})

test('les en-têtes connus sont reconnus, les inconnus ignorés', () => {
  assert.deepEqual(mapHeader('N° série', []), { kind: 'field', key: 'serialNumber' })
  assert.deepEqual(mapHeader('Mot de passe', []), { kind: 'field', key: 'password' })
  assert.deepEqual(mapHeader('MAC DANTE', []), { kind: 'field', key: 'macDante' })
  assert.equal(mapHeader('Couleur', []), null)
})

test('un en-tête égal au libellé d’une colonne personnalisée la vise', () => {
  const cols = [{ id: 'custom_1', label: 'Emplacement', visible: true, custom: true }]
  assert.deepEqual(mapHeader(' emplacement ', cols), { kind: 'custom', id: 'custom_1' })
})

test('les séparateurs point-virgule, virgule et tabulation sont reconnus', () => {
  assert.deepEqual(parseDelimited('LABEL;IP\nA;1.2.3.4'), [['LABEL', 'IP'], ['A', '1.2.3.4']])
  assert.deepEqual(parseDelimited('LABEL,IP\nA,1.2.3.4'), [['LABEL', 'IP'], ['A', '1.2.3.4']])
  assert.deepEqual(parseDelimited('LABEL\tIP\tN° SERIE\nA\t1.2.3.4\tX;Y'), [['LABEL', 'IP', 'N° SERIE'], ['A', '1.2.3.4', 'X;Y']])
})

test('les guillemets et les retours à la ligne dans une cellule sont gardés', () => {
  assert.deepEqual(parseDelimited('LABEL;LOGIN\r\n"A;B";"dit ""x"""\r\n'), [['LABEL', 'LOGIN'], ['A;B', 'dit "x"']])
})

// ── 3. Choix du tableau d'un .xls HTML ─────────────────────────────────

test('à égalité de lignes, le tableau des données est préféré au cartouche', () => {
  const cartouche = [['PLAGE IP', 'MASQUE', 'DNS', 'PASSERELLE', 'NTP'], ['10.0.0.0', '255.0.0.0', '', '', '']]
  const donnees = [['PRODUIT', 'LABEL', 'IP', 'MAC'], ['Sony X', 'CAM1', '10.0.0.1', '']]
  assert.equal(pickDataTable([cartouche, donnees], []), 1)
  assert.equal(pickDataTable([donnees, cartouche], []), 0)
})

test('aucun tableau reconnu donne -1', () => {
  assert.equal(pickDataTable([[['A', 'B'], ['1', '2']]], []), -1)
  assert.equal(pickDataTable([], []), -1)
})

// ── Lecture des lignes ─────────────────────────────────────────────────

test('les lignes sont lues avec leurs colonnes fixes et personnalisées', () => {
  const cols = [{ id: 'custom_1', label: 'Emplacement', visible: true, custom: true }]
  const matrix = [['LABEL', 'IP', 'Emplacement', 'Inconnue'], ['CAM1', ' 10.0.0.1 ', 'Baie 2', 'x'], ['', '', '', ''], ['', '', '', 'y']]
  const { rows, ignored, recognized } = readImportedRows(matrix, cols)
  assert.equal(recognized, 3)
  assert.equal(rows.length, 1)
  assert.equal(ignored, 1)
  assert.deepEqual(rows[0], { values: { label: 'CAM1', ip: '10.0.0.1' }, customFields: { custom_1: 'Baie 2' } })
})

// ── 4. Fusion par label ────────────────────────────────────────────────

const existingRows = () => [
  { ...makeEmptyRow(false), id: 'r1', label: 'CAM1', product: 'Sony X', productInstanceIds: ['n1'], ip: '10.0.0.1', login: 'admin', customFields: { custom_1: 'Baie 1' } },
  { ...makeEmptyRow(true), id: 'r2', label: 'Ecran 2', product: 'LG', mac: 'aa:bb:cc:dd:ee:ff' },
]

test('une ligne de même label (casse et espaces ignorés) met à jour ses champs non vides', () => {
  const existing = existingRows()
  const snapshot = structuredClone(existing)
  const imported = [
    { values: { label: ' cam1 ', ip: '10.0.0.9', login: '', serialNumber: 'SN1' }, customFields: { custom_1: 'Baie 3' } },
    { values: { label: 'NOUVEAU', ip: '10.0.0.50' }, customFields: {} },
    { values: { label: '', ip: '10.0.0.51' }, customFields: {} },
  ]
  const plan = planIPImport(existing, imported, true)
  assert.deepEqual(existing, snapshot, 'l’entrée n’est pas modifiée')
  assert.equal(plan.updates.length, 1)
  assert.equal(plan.updates[0].rowId, 'r1')
  assert.deepEqual(plan.updates[0].patch, { ip: '10.0.0.9', serialNumber: 'SN1', customFields: { custom_1: 'Baie 3' } })
  assert.equal(plan.additions.length, 2)
  assert.ok(plan.additions.every(r => r.manual && r.productInstanceIds.length === 0))
  assert.equal(plan.additions[0].label, 'NOUVEAU')
  assert.equal(plan.additions[0].ip, '10.0.0.50')
  assert.equal(plan.unchanged, 0)
})

test('la mise à jour garde les autres colonnes personnalisées', () => {
  const existing = [{ ...makeEmptyRow(true), id: 'r1', label: 'A', customFields: { custom_1: 'x', custom_2: 'y' } }]
  const plan = planIPImport(existing, [{ values: { label: 'a' }, customFields: { custom_2: 'z' } }], true)
  assert.deepEqual(plan.updates[0].patch, { customFields: { custom_1: 'x', custom_2: 'z' } })
})

test('le produit calculé d’une ligne liée n’est pas remplacé, celui d’une ligne manuelle oui', () => {
  const plan = planIPImport(existingRows(), [
    { values: { label: 'CAM1', product: 'Autre' }, customFields: {} },
    { values: { label: 'ECRAN 2', product: 'Samsung' }, customFields: {} },
  ], true)
  assert.deepEqual(plan.updates, [{ rowId: 'r2', patch: { product: 'Samsung' } }])
  assert.equal(plan.unchanged, 1)
})

test('une ligne identique est comptée inchangée, pas mise à jour', () => {
  const plan = planIPImport(existingRows(), [{ values: { label: 'CAM1', ip: '10.0.0.1' }, customFields: {} }], true)
  assert.equal(plan.updates.length, 0)
  assert.equal(plan.additions.length, 0)
  assert.equal(plan.unchanged, 1)
})

test('deux lignes importées de même label mettent à jour une seule ligne', () => {
  const plan = planIPImport(existingRows(), [
    { values: { label: 'CAM1', ip: '10.0.0.7' }, customFields: {} },
    { values: { label: 'CAM1', mac: '00:11:22:33:44:55' }, customFields: {} },
  ], true)
  assert.deepEqual(plan.updates, [{ rowId: 'r1', patch: { ip: '10.0.0.7', mac: '00:11:22:33:44:55' } }])
})

test('option décochée : toutes les lignes sont ajoutées', () => {
  const plan = planIPImport(existingRows(), [{ values: { label: 'CAM1', ip: '10.0.0.9' }, customFields: { custom_1: 'B' } }], false)
  assert.equal(plan.updates.length, 0)
  assert.equal(plan.additions.length, 1)
  assert.equal(plan.additions[0].ip, '10.0.0.9')
  assert.deepEqual(plan.additions[0].customFields, { custom_1: 'B' })
})

test('une ligne ajoutée sans colonne personnalisée n’a pas de customFields', () => {
  const plan = planIPImport([], [{ values: { label: 'X' }, customFields: {} }], true)
  assert.equal(plan.additions[0].customFields, undefined)
})

// ── 5. Fichiers acceptés (glisser-déposer et bouton) ───────────────────

test('les fichiers CSV, TSV, TXT et XLS sont acceptés, par extension ou par type', () => {
  assert.deepEqual(checkImportFile({ name: 'liste.CSV', type: '' }), { ok: true, kind: 'csv' })
  assert.deepEqual(checkImportFile({ name: 'liste.csv', type: 'application/vnd.ms-excel' }), { ok: true, kind: 'csv' })
  assert.deepEqual(checkImportFile({ name: 'liste.tsv', type: '' }), { ok: true, kind: 'csv' })
  assert.deepEqual(checkImportFile({ name: 'liste.txt', type: 'text/plain' }), { ok: true, kind: 'csv' })
  assert.deepEqual(checkImportFile({ name: 'tableau.xls', type: 'application/vnd.ms-excel' }), { ok: true, kind: 'xls' })
  assert.deepEqual(checkImportFile({ name: 'sans-extension', type: 'text/csv' }), { ok: true, kind: 'csv' })
})

test('les autres fichiers sont refusés avec un message', () => {
  for (const f of [
    { name: 'photo.png', type: 'image/png' },
    { name: 'tableau.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    { name: 'doc.pdf', type: 'application/pdf' },
    { name: 'inconnu', type: '' },
  ]) {
    const r = checkImportFile(f)
    assert.equal(r.ok, false, f.name)
    assert.match(r.message, /\S/)
  }
  assert.match(checkImportFile({ name: 'tableau.xlsx', type: '' }).message, /CSV/)
})

// ── 6. Doublons normalisés ─────────────────────────────────────────────

const row = (id, patch) => ({ ...makeEmptyRow(true), id, ...patch })

test('les IPv4 sont comparées normalisées (zéros de tête, espaces)', () => {
  const dups = detectIPDuplicates([
    row('a', { ip: '192.168.1.010' }),
    row('b', { ipDante: ' 192.168.1.10' }),
    row('c', { ipDanteSec: '192.168. 1.10' }),
    row('d', { ip: '192.168.1.11' }),
  ])
  assert.deepEqual([...dups.keys()].sort(), ['a', 'b', 'c'])
  assert.deepEqual([...dups.get('b')], ['ipDante'])
})

test('les MAC en doublon sont détectées, quel que soit le format', () => {
  const dups = detectIPDuplicates([
    row('a', { mac: 'AA:BB:CC:DD:EE:FF' }),
    row('b', { macDante: 'aa-bb-cc-dd-ee-ff' }),
    row('c', { mac: 'aabb.ccdd.eeff' }),
    row('d', { mac: 'AABBCCDDEEFF' }),
    row('e', { mac: '00:11:22:33:44:55' }),
  ])
  assert.deepEqual([...dups.keys()].sort(), ['a', 'b', 'c', 'd'])
  assert.deepEqual([...dups.get('b')], ['macDante'])
})

test('une IP et une MAC ne se comparent pas entre elles, les vides sont ignorés', () => {
  const dups = detectIPDuplicates([row('a', { ip: '10.0.0.1', mac: '' }), row('b', { ip: '', mac: '' })])
  assert.equal(dups.size, 0)
})

test('les formes normalisées', () => {
  assert.equal(normalizeIPv4(' 010.001.000.009 '), '10.1.0.9')
  assert.equal(normalizeMac('AA-bb-CC-dd-EE-ff'), 'aabbccddeeff')
  assert.equal(normalizeMac('aabb.ccdd.eeff'), 'aabbccddeeff')
})

// ── 7. Validation de format ────────────────────────────────────────────

test('isValidIPv4', () => {
  for (const v of ['', '   ', '192.168.1.10', '0.0.0.0', '255.255.255.255', ' 10.0.0.1 ', '192.168.1.010']) assert.equal(isValidIPv4(v), true, v)
  for (const v of ['192.168.1', '192.168.1.256', '1.2.3.4.5', 'abc', '10.0.0.-1', '10..0.1', '10.0.0.1/24', '1234.1.1.1']) assert.equal(isValidIPv4(v), false, v)
})

test('isValidMac', () => {
  for (const v of ['', 'AA:BB:CC:DD:EE:FF', 'aa-bb-cc-dd-ee-ff', 'aabb.ccdd.eeff', 'AABBCCDDEEFF', ' 00:11:22:33:44:55 ']) assert.equal(isValidMac(v), true, v)
  for (const v of ['AA:BB:CC:DD:EE', 'GG:BB:CC:DD:EE:FF', 'AA:BB-CC:DD:EE:FF', 'AABBCCDDEEF', 'AA:BB:CC:DD:EE:FF:00', 'aabb.ccdd.eef']) assert.equal(isValidMac(v), false, v)
})
