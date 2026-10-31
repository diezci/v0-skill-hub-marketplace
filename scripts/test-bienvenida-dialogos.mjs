import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {INICIAR_BIENVENIDA} from '../lib/bienvenida.ts'

// Real native <dialog> behavior, in a loopback-only fixture. This regression
// suite does not execute or approve workflow-matrix rows.
const browser=await chromium.launch({headless:true})
let passed=0
try {
  for (const initiallyBlocked of [true,false]) {
    const c=await browser.newContext()
    await c.route('**/*',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><button id="outside">Fuera</button><dialog id="diime-bienvenida"><h1>Bienvenida</h1><button data-cerrar-bienvenida>Cerrar bienvenida</button></dialog>${initiallyBlocked?'<div id="other" role="dialog"><button>Otro formulario</button></div>':''}`}))
    const p=await c.newPage()
    await p.goto('http://127.0.0.1:3200/qa-initializer')
    await p.evaluate(()=>localStorage.setItem('diime_cookies_consentimiento','rechazadas'))
    await p.evaluate(INICIAR_BIENVENIDA)
    const welcome=p.locator('#diime-bienvenida')
    if(initiallyBlocked) {
      assert.equal(await welcome.evaluate(e=>e.open),false,'A direct-link form takes priority over the welcome')
    } else {
      assert.equal(await welcome.evaluate(e=>e.matches(':modal')),true)
      // Reproduce a form arriving asynchronously after native showModal().
      await p.evaluate(()=>{const other=document.createElement('div');other.id='other';other.role='dialog';other.textContent='Formulario asíncrono';document.body.append(other)})
      await p.waitForFunction(()=>!document.querySelector('#diime-bienvenida').open)
      assert.equal(await p.evaluate(()=>localStorage.getItem('diime_bienvenida_vista')),null,'Deferral is not a user dismissal')
    }
    await p.evaluate(()=>document.querySelector('#other').remove())
    await p.waitForFunction(()=>document.querySelector('#diime-bienvenida').matches(':modal'))
    const close=welcome.getByRole('button',{name:'Cerrar bienvenida'})
    assert.equal(await close.evaluate(e=>{const b=e.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===e}),true,'Deferred welcome has an unobscured real close control')
    await close.click()
    assert.equal(await p.evaluate(()=>localStorage.getItem('diime_bienvenida_vista')),'1')
    assert.equal(await welcome.evaluate(e=>e.open),false)
    console.log('PASS',initiallyBlocked?'Existing form defers welcome until it closes':'Asynchronous form yields and restores welcome without falsely recording dismissal')
    passed++
    await c.close()
  }
} finally {await browser.close()}
console.log(JSON.stringify({passed,matrixRowsExecuted:0,scope:'Browser regression fixture; no production or remote services'}))
