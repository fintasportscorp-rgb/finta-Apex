import { describe, it, expect } from 'vitest'
import { getBuiltInScripts, lintScript } from '../lib/scripts'

describe('catalog integration — v1.1 bascule', () => {
  it('loads at least 100 built-in scripts', () => {
    const scripts = getBuiltInScripts()
    expect(scripts.length).toBeGreaterThanOrEqual(100)
  })

  it('every built-in script reports dsl_version 1.1', () => {
    const scripts = getBuiltInScripts()
    const offenders = scripts.filter(s => s.dsl_version !== '1.1')
    expect(offenders.map(s => `${s.id}@${s.dsl_version}`)).toEqual([])
  })

  it('every built-in script carries at least one available_view', () => {
    const scripts = getBuiltInScripts()
    const offenders = scripts.filter(s => !s.available_views || s.available_views.length === 0)
    expect(offenders.map(s => s.id)).toEqual([])
  })

  it('every built-in script has a primary view with priority 1', () => {
    const scripts = getBuiltInScripts()
    const offenders = scripts.filter(s => {
      const primary = s.available_views?.find(v => v.primary === true)
      return !primary || primary.priority !== 1
    })
    expect(offenders.map(s => s.id)).toEqual([])
  })

  it('every built-in script passes lintScript() with zero errors', () => {
    const scripts = getBuiltInScripts()
    const failures: { id: string; messages: string[] }[] = []
    for (const s of scripts) {
      const errors = lintScript(s)
      if (errors.length > 0) {
        failures.push({ id: s.id, messages: errors.map(e => `[${e.field}] ${e.message}`) })
      }
    }
    expect(failures).toEqual([])
  })

  it('top-level convenience fields (view, measures, side) are denormalized from primary', () => {
    const scripts = getBuiltInScripts()
    for (const s of scripts) {
      const primary = s.available_views?.find(v => v.primary === true)
      expect(primary).toBeDefined()
      expect(s.view).toBe(primary!.view)
      // The top-level measures should be a superset of the primary view's measures.
      const primaryIds = new Set(primary!.measures.map(m => m.id))
      const topLevelIds = new Set(s.measures.map(m => m.id))
      for (const id of primaryIds) {
        expect(topLevelIds.has(id)).toBe(true)
      }
    }
  })
})
