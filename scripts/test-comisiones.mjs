import assert from "node:assert/strict"
import {
  calcularPagoProveedor,
  calcularPagoProveedorConTarifa,
  calcularTotalCliente,
  calcularReembolsoCliente,
  desglosarIvaIncluido,
  PLATFORM_CONFIG,
} from "../lib/comisiones.ts"

assert.equal(PLATFORM_CONFIG.comisionProveedorPorcentaje, 10)
assert.equal(PLATFORM_CONFIG.ivaDiimePorcentaje, 21)
assert.deepEqual(desglosarIvaIncluido(10), { baseImponible: 8.26, cuotaIva: 1.74, total: 10 })
assert.deepEqual(desglosarIvaIncluido(2), { baseImponible: 1.65, cuotaIva: 0.35, total: 2 })
assert.deepEqual(calcularTotalCliente(100), { precioBase: 100, comisionCliente: 10, totalCliente: 110 })
assert.deepEqual(calcularReembolsoCliente(20), { totalPagado: 22, reembolso: 20, retencionPlataforma: 2 })
assert.deepEqual(calcularPagoProveedor(10), { precioBase: 10, comisionProveedor: 2, pagoNeto: 8 })
assert.deepEqual(calcularPagoProveedor(20), { precioBase: 20, comisionProveedor: 2, pagoNeto: 18 })
assert.deepEqual(calcularPagoProveedor(100), { precioBase: 100, comisionProveedor: 10, pagoNeto: 90 })
assert.deepEqual(calcularPagoProveedor(20.05), { precioBase: 20.05, comisionProveedor: 2.01, pagoNeto: 18.04 })
assert.deepEqual(calcularTotalCliente(20.45), { precioBase: 20.45, comisionCliente: 2.05, totalCliente: 22.5 })
assert.deepEqual(calcularPagoProveedorConTarifa(100, 5, 2), {
  precioBase: 100,
  comisionProveedor: 5,
  pagoNeto: 95,
})

for (let centimos = 1; centimos <= 100_000; centimos += 1) {
  const precio = centimos / 100
  const cliente = calcularTotalCliente(precio)
  const proveedor = calcularPagoProveedor(precio)
  const tarifaAnterior = calcularPagoProveedorConTarifa(precio, 5, 2)
  const ivaDiime = desglosarIvaIncluido(cliente.comisionCliente)

  assert.equal(
    Math.round((cliente.precioBase + cliente.comisionCliente) * 100),
    Math.round(cliente.totalCliente * 100),
    `El total del cliente no cuadra para ${precio} EUR`,
  )
  assert.equal(
    Math.round((proveedor.comisionProveedor + proveedor.pagoNeto) * 100),
    centimos,
    `La liquidación al 10 % no cuadra para ${precio} EUR`,
  )
  assert.equal(
    Math.round((tarifaAnterior.comisionProveedor + tarifaAnterior.pagoNeto) * 100),
    centimos,
    `La liquidación histórica al 5 % no cuadra para ${precio} EUR`,
  )
  assert.equal(
    Math.round((ivaDiime.baseImponible + ivaDiime.cuotaIva) * 100),
    Math.round(ivaDiime.total * 100),
    `El desglose de IVA de Diime no cuadra para ${precio} EUR`,
  )
}

console.log("Comisiones e IVA de Diime correctos: tarifa, mínimo, histórico y conservación de céntimos.")
