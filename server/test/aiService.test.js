import test from 'node:test'
import assert from 'node:assert/strict'
import { routeDepartment } from '../src/services/aiService.js'

const analysis = (category, department = 'Customer Support') => ({ category, department })

test('payment, billing, invoice, and refund complaints always route to Finance Support', () => {
  assert.equal(routeDepartment(analysis('Payment Issue', 'Account Support')), 'Finance Support')
  assert.equal(routeDepartment(analysis('Refund Issue', 'Customer Support')), 'Finance Support')
  assert.equal(routeDepartment(analysis('Other'), 'Invoice total is incorrect', 'The bill charged me twice.'), 'Finance Support')
})

test('category routes use the matching operational department', () => {
  assert.equal(routeDepartment(analysis('Technical Issue', 'Finance Support')), 'Technical Support')
  assert.equal(routeDepartment(analysis('Delivery Issue', 'Finance Support')), 'Delivery/Logistics')
  assert.equal(routeDepartment(analysis('Product Issue', 'Finance Support')), 'Product Support')
  assert.equal(routeDepartment(analysis('Account/Login Issue', 'Finance Support')), 'Account Support')
  assert.equal(routeDepartment(analysis('Delivery Issue', 'Finance Support'), 'Shipping charge', 'My delivery is late.'), 'Delivery/Logistics')
})

test('security complaints keep security routing even when they mention payment details', () => {
  assert.equal(routeDepartment(analysis('Security Issue', 'Finance Support'), 'Card exposure', 'Someone accessed my saved payment card.'), 'Security Team')
})

test('general complaints preserve the AI-selected department', () => {
  assert.equal(routeDepartment(analysis('General Complaint', 'Customer Support')), 'Customer Support')
})

test('fallback complaints use strong issue keywords to reach a department', () => {
  const fallback = analysis('General Complaint', 'Customer Support')
  assert.equal(routeDepartment(fallback, 'Duplicate payment', 'My bank card was charged twice.'), 'Finance Support')
  assert.equal(routeDepartment(fallback, 'Package tracking', 'The courier has not delivered my parcel.'), 'Delivery/Logistics')
  assert.equal(routeDepartment(fallback, 'Account access', 'I cannot sign in after resetting my password.'), 'Account Support')
  assert.equal(routeDepartment(fallback, 'App issue', 'The website crashes with a server error.'), 'Technical Support')
})
