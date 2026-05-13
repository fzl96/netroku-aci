import { describe, expect, it } from 'bun:test'
import {
  buildContractPath,
  buildEpgPath,
  contractAttachmentPayload,
  buildContractRelationPath,
  contractRelationDeletePayload,
  epgDeletePayload,
  epgPayload,
} from './paths'
import type { ParsedEpgContractRow } from './types'

const row: ParsedEpgContractRow = {
  rowIndex: 1,
  tenant: 'TenantA',
  anp: 'APP-A',
  epg: 'WEB-EPG',
  bd: 'WEB-BD',
  contract: 'WEB-CONTRACT',
  epg_desc: 'Web tier',
}

describe('EPG paths', () => {
  it('builds EPG and contract paths', () => {
    expect(buildEpgPath(row)).toBe('/api/node/mo/uni/tn-TenantA/ap-APP-A/epg-WEB-EPG.json')
    expect(buildContractPath('TenantA', 'WEB-CONTRACT')).toBe('/api/node/mo/uni/tn-TenantA/brc-WEB-CONTRACT.json')
  })
})

describe('EPG payloads', () => {
  it('builds EPG payload with BD relation', () => {
    const payload = JSON.parse(epgPayload(row))

    expect(payload.fvAEPg.attributes).toMatchObject({
      dn: 'uni/tn-TenantA/ap-APP-A/epg-WEB-EPG',
      prio: 'level3',
      name: 'WEB-EPG',
      descr: 'Web tier',
      status: 'created,modified',
    })
    expect(payload.fvAEPg.children[0].fvRsBd.attributes).toMatchObject({
      tnFvBDName: 'WEB-BD',
      status: 'created,modified',
    })
  })

  it('builds consumed and provided contract payloads', () => {
    const consumed = JSON.parse(contractAttachmentPayload(row, 'consumer', 'WEB-CONTRACT'))
    const provided = JSON.parse(contractAttachmentPayload(row, 'provider', 'WEB-CONTRACT'))

    expect(consumed.fvRsCons.attributes).toMatchObject({
      tnVzBrCPName: 'WEB-CONTRACT',
      status: 'created,modified',
    })
    expect(provided.fvRsProv.attributes).toMatchObject({
      tnVzBrCPName: 'WEB-CONTRACT',
      status: 'created,modified',
    })
  })

  it('builds consumed and provided contract delete payloads', () => {
    const consumed = JSON.parse(contractRelationDeletePayload(row, 'consumer', 'WEB-CONTRACT'))
    const provided = JSON.parse(contractRelationDeletePayload(row, 'provider', 'WEB-CONTRACT'))

    expect(buildContractRelationPath(row, 'consumer', 'WEB-CONTRACT')).toBe('/api/node/mo/uni/tn-TenantA/ap-APP-A/epg-WEB-EPG/rscons-WEB-CONTRACT.json')
    expect(consumed.fvRsCons.attributes).toEqual({
      dn: 'uni/tn-TenantA/ap-APP-A/epg-WEB-EPG/rscons-WEB-CONTRACT',
      status: 'deleted',
    })
    expect(provided.fvRsProv.attributes).toEqual({
      dn: 'uni/tn-TenantA/ap-APP-A/epg-WEB-EPG/rsprov-WEB-CONTRACT',
      status: 'deleted',
    })
  })

  it('builds delete payload for EPG rollback', () => {
    expect(JSON.parse(epgDeletePayload(row))).toEqual({
      fvAEPg: {
        attributes: {
          dn: 'uni/tn-TenantA/ap-APP-A/epg-WEB-EPG',
          status: 'deleted',
        },
        children: [],
      },
    })
  })
})
