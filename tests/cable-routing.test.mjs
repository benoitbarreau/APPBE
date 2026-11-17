// Lot 5 de l'audit du 17/11/2026 : routage des câbles calculé une fois par rendu.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { loadSource } from './support/load-store.mjs'

const { obstaclesFor, baseRoutesFor, effectiveWaypoints, getHandlePos } = await import(loadSource(path.resolve('src/lib/cableRouting.ts')))

const handle = (id) => ({ id, x: 0, y: 10, width: 10, height: 10 })
const rfNode = (id, x, y) => ({
  internals: { positionAbsolute: { x, y }, handleBounds: { source: [handle('out:o')], target: [handle('in:i')] } },
})
const lookup = new Map([['a', rfNode('a', 0, 0)], ['b', rfNode('b', 400, 100)], ['c', rfNode('c', 0, 300)]])
const nodes = [
  { id: 'a', productId: 'p', position: { x: 0, y: 0 } },
  { id: 'b', productId: 'p', position: { x: 400, y: 100 } },
  { id: 'c', productId: 'p', position: { x: 0, y: 300 } },
]
const products = new Map([['p', { id: 'p', inputs: [{}, {}], outputs: [{}], middle: [] }]])
const cable = (id, from, to) => ({ id, fromNodeId: from, fromPortId: 'o', fromPortSide: 'out', toNodeId: to, toPortId: 'i', toPortSide: 'in' })

test('les obstacles d’un câble réduisent ses deux extrémités et gardent les autres produits entiers', () => {
  const obs = obstaclesFor(nodes, products, cable('k', 'a', 'b'))
  assert.equal(obs.length, 3)
  assert.deepEqual(obs[0], { x: 0, y: 0, width: 140, height: 82 })
  assert.deepEqual(obs[1], { x: 440, y: 100, width: 140, height: 82 })
  assert.deepEqual(obs[2], { x: 0, y: 300, width: 180, height: 82 })
})

test('le tracé de base d’un câble est celui qu’on calculait câble par câble', () => {
  const cables = [cable('k1', 'a', 'b'), cable('k2', 'c', 'b')]
  const routes = baseRoutesFor(cables, nodes, products, lookup)
  for (const c of cables) {
    const from = getHandlePos(lookup, c.fromNodeId, c.fromPortId, 'out')
    const to = getHandlePos(lookup, c.toNodeId, c.toPortId, 'in')
    const expected = [from, ...effectiveWaypoints(from, to, [], obstaclesFor(nodes, products, c)), to]
    assert.deepEqual(routes.get(c.id), expected)
  }
})

test('les tracés sont partagés par tous les câbles d’un même rendu, et recalculés si les données changent', () => {
  const cables = [cable('k1', 'a', 'b')]
  const first = baseRoutesFor(cables, nodes, products, lookup)
  assert.equal(baseRoutesFor(cables, nodes, products, lookup), first)
  assert.notEqual(baseRoutesFor(cables, [...nodes], products, lookup), first)
})

test('un câble dont une extrémité est introuvable n’a pas de tracé', () => {
  const routes = baseRoutesFor([cable('k', 'a', 'absent')], nodes, products, lookup)
  assert.equal(routes.has('k'), false)
})
