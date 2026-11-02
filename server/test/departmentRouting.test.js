import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseStaffForDepartment, departmentScope, normalizeDepartment } from '../src/services/departmentRouting.js'
import { routeDepartment, fallbackAnalysis } from '../src/services/aiService.js'

test('Finance issue categories and fallback payment keywords route to Finance Support', () => {
  assert.equal(routeDepartment({ category: 'Payment Issue', department: 'Account Support' }), 'Finance Support')
  assert.equal(routeDepartment({ category: 'Refund Issue', department: 'Customer Support' }), 'Finance Support')
  assert.equal(routeDepartment(fallbackAnalysis, 'Double payment', 'My account was charged twice.'), 'Finance Support')
})

test('department matching tolerates legacy case and whitespace but keeps departments isolated', () => {
  assert.equal(normalizeDepartment('  finance   SUPPORT '), 'finance support')
  const filter = departmentScope('  Finance   Support ')
  const regex = new RegExp(filter.department.$regex, filter.department.$options)
  assert.equal(regex.test('Finance Support'), true)
  assert.equal(regex.test(' finance   support '), true)
  assert.equal(regex.test('Technical Support'), false)
  assert.deepEqual(departmentScope(' '), { _id: null })
})

test('staff assignment finds matching department staff and selects the least-loaded one', async () => {
  let query
  const first = { _id: 'finance-1' }
  const second = { _id: 'finance-2' }
  const UserModel = { find: (value) => { query = value; return { select: () => ({ lean: async () => [first, second] }) } } }
  const ComplaintModel = { aggregate: async () => [{ _id: 'finance-1', count: 4 }, { _id: 'finance-2', count: 1 }] }

  assert.equal(await chooseStaffForDepartment('Finance Support', { UserModel, ComplaintModel }), 'finance-2')
  assert.equal(query.role, 'Support Staff')
  assert.equal(new RegExp(query.department.$regex, query.department.$options).test(' finance support '), true)
})

test('missing staff or a database lookup failure leaves the complaint queued without throwing', async () => {
  const noStaff = { find: () => ({ select: () => ({ lean: async () => [] }) }) }
  const failing = { find: () => ({ select: () => ({ lean: async () => { throw Object.assign(new Error('database unavailable'), { code: 'DB_DOWN' }) } }) }) }
  const unusedComplaints = { aggregate: async () => [] }

  assert.equal(await chooseStaffForDepartment('Product Support', { UserModel: noStaff, ComplaintModel: unusedComplaints }), null)
  assert.equal(await chooseStaffForDepartment('Finance Support', { UserModel: failing, ComplaintModel: unusedComplaints }), null)
})
