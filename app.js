'use strict';
const $ = id => document.getElementById(id);
const val = id => parseFloat($(id).value) || 0;
const radio = n => document.querySelector(`input[name="${n}"]:checked`).value;
const money = n => '$' + n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const r2 = n => Math.round(n * 100) / 100;
const iso = d => d.toISOString().slice(0, 10);
const today = iso(new Date());
let fechasDescanso = [];
let resultado = null;

// Días entre fechas con meses comerciales de 30 días y años de 360
function dias360(a, b) {
  const d1 = Math.min(a.getUTCDate(), 30), d2 = Math.min(b.getUTCDate(), 30);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 360 + (b.getUTCMonth() - a.getUTCMonth()) * 30 + (d2 - d1);
}
const fecha = s => new Date(s + 'T00:00:00Z');

// ---- Bloqueos de interfaz ----
function actualizarBloqueos() {
  const an = $('anonimo').checked;
  ['nombre', 'dui'].forEach(id => { $(id).disabled = an; if (an) $(id).value = ''; });
  const tipo = radio('tipo');
  $('boxAviso').hidden = tipo !== 'renuncia';
  $('fIni').max = $('fFin').max = tipo === 'despido' ? today : '';
  if (tipo === 'despido') {
    [$('fIni'), $('fFin')].forEach(i => { if (i.value > today) i.value = today; });
    $('hintFechas').textContent = 'En despido solo se permiten fechas hasta hoy.';
  } else {
    $('hintFechas').textContent = 'En renuncia puedes simular con fechas futuras antes de presentarla.';
  }
  const v = $('vacOn').checked;
  document.querySelectorAll('input[name=vacTipo],#vacIni,#vacFin,#vacAloj,#vacCom,#vacProp').forEach(i => i.disabled = !v);
  $('descDias').value = fechasDescanso.length || $('descDias').value;
}

function pintarChips() {
  $('descLista').innerHTML = '';
  fechasDescanso.forEach(f => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = f + ' ✕'; b.title = 'Quitar';
    b.onclick = () => { fechasDescanso = fechasDescanso.filter(x => x !== f); $('descDias').value = fechasDescanso.length; pintarChips(); calcular(); };
    $('descLista').appendChild(b);
  });
}

// ---- Cálculo ----
function calcular() {
  actualizarBloqueos();
  const sbm = val('sbm'), smin = val('smin');
  const conSalario = sbm > 0;
  $('errSbm').hidden = conSalario || !$('sbm').dataset.tocado;
  const ini = $('fIni').value, fin = $('fFin').value;
  const tipo = radio('tipo');
  const filas = [];
  const add = (label, detalle, monto, salarial) => filas.push({label, detalle, monto: r2(monto), salarial});
  $('msgCierre').textContent = '';
  $('hintAgui').textContent = '';

  if (!conSalario || !ini || !fin || fin < ini) {
    resultado = null; pintar(null);
    if (ini && fin && fin < ini) $('msgCierre').textContent = 'La fecha de fin debe ser posterior a la de inicio.';
    return;
  }
  const sbd = sbm / 30, hora = sbd / 8;
  const dIni = fecha(ini), dFin = fecha(fin);
  const dias = Math.max(dias360(dIni, dFin), 0), anios = dias / 360;
  const aniosEnteros = Math.floor(anios);
  const ant = `${aniosEnteros} años y ${Math.floor((dias % 360) / 30)} meses (${dias} días comerciales)`;

  // Indemnización o prestación por renuncia
  if (tipo === 'despido') {
    const base = Math.min(sbm, 4 * smin);
    add('Indemnización por despido', `30 días por año (Art. 58). Base ${money(base)} (tope 4 salarios mínimos). ${ant}`, base * anios);
  } else {
    const dioAviso = radio('aviso') === 'si';
    if (!dioAviso) {
      $('msgCierre').textContent = 'Sin aviso no se calcula la prestación de 15 días por año.';
      add('Prestación por renuncia', 'Omitida: no dio aviso', 0);
    } else if (aniosEnteros < 2) {
      $('msgCierre').textContent = 'Se requieren al menos 2 años continuos de servicio.';
      add('Prestación por renuncia', 'Omitida: menos de 2 años de servicio', 0);
    } else {
      const base = Math.min(sbm, 2 * smin);
      add('Prestación por renuncia voluntaria', `15 días por año. Base ${money(base)} (tope 2 salarios mínimos). ${ant}`, (base / 2) * anios);
    }
  }

  // Vacaciones
  if ($('vacOn').checked) {
    const dv = +radio('vacTipo');
    let rv = sbd * dv * 1.3, nota = `${dv} días × ${money(sbd)} × 1.30`;
    let frac = 1;
    if ($('vacProp').checked) {
      const aniv = new Date(dIni); aniv.setUTCFullYear(aniv.getUTCFullYear() + aniosEnteros);
      frac = Math.min(dias360(aniv, dFin) / 360, 1);
      rv *= frac; nota += ` × ${frac.toFixed(3)} (proporción del año)`;
    }
    const extra = ($('vacAloj').checked ? .25 : 0) + ($('vacCom').checked ? .25 : 0);
    if (extra) { rv *= 1 + extra; nota += ` + ${extra * 100}% por alojamiento/comida`; }
    if ($('vacIni').value && $('vacFin').value && $('vacFin').value >= $('vacIni').value) {
      const n = (fecha($('vacFin').value) - fecha($('vacIni').value)) / 864e5 + 1;
      nota += `. Disfrute: ${n} días naturales`;
    }
    add('Vacaciones', nota, rv, true);
  }

  // Aguinaldo
  const diasAg = aniosEnteros < 3 ? 15 : aniosEnteros <= 10 ? 19 : 21;
  if (radio('agui') === 'pagado') {
    add('Aguinaldo', 'Ya pagado: excluido de la liquidación', 0);
  } else {
    const y = dFin.getUTCFullYear();
    let ag, nota;
    if (fin >= `${y}-10-01`) {
      ag = sbd * diasAg; nota = `Desde el 1 de octubre: ${diasAg} días completos`;
    } else {
      const ultimo = fecha(`${y - 1}-12-12`), desde = dIni > ultimo ? dIni : ultimo;
      const d = Math.max(dias360(desde, dFin), 0);
      ag = sbd * diasAg * Math.min(d / 360, 1);
      nota = `${diasAg} días × ${d}/360 desde ${iso(desde)}`;
    }
    add('Aguinaldo', nota, ag);
  }

  // Recargos
  const dd = Math.max(Math.floor(val('descDias')), 0);
  add('Descanso semanal laborado', `${dd} × SBD × 1.5 (${money(sbd * 1.5)} c/u)`, dd * sbd * 1.5, true);
  const hed = val('hed'), hen = val('hen');
  add('Horas extras diurnas', `${hed} h × ${money(hora)} × 2`, hed * hora * 2, true);
  add('Horas extras nocturnas', `${hen} h × ${money(hora * 1.25)} (hora nocturna) × 2`, hen * hora * 1.25 * 2, true);
  const as = Math.max(Math.floor(val('asuetos')), 0);
  add('Asuetos laborados', `${as} × SBD × 2 (${money(sbd * 2)} c/u)`, as * sbd * 2, true);

  const t1 = r2(filas.reduce((s, f) => s + f.monto, 0));
  const baseSal = filas.filter(f => f.salarial).reduce((s, f) => s + f.monto, 0);
  const isss = r2(Math.min(baseSal, 1000) * 0.03), afp = r2(baseSal * 0.0725);
  resultado = {filas, t1, isss, afp, t2: r2(t1 - isss - afp)};
  pintar(resultado);
}

function pintar(r) {
  $('vacio').hidden = !!r; $('tabla').hidden = $('totales').hidden = !r; $('btnPdf').disabled = !r;
  if (!r) return;
  $('tabla').tBodies[0].innerHTML = r.filas.map(f =>
    `<tr class="${f.monto ? '' : 'zero'}"><td>${f.label}<small>${f.detalle}</small></td><td>${money(f.monto)}</td></tr>`).join('');
  $('t1').textContent = money(r.t1); $('isss').textContent = '− ' + money(r.isss);
  $('afp').textContent = '− ' + money(r.afp); $('t2').textContent = money(r.t2);
}

// ---- Exportar a PDF (vista de impresión → Guardar como PDF) ----
function exportarPdf() {
  if (!resultado) return;
  const an = $('anonimo').checked;
  const esc = s => s.replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]));
  const nombre = an ? 'Anónimo' : esc($('nombre').value.trim() || 'No indicado');
  const dui = an ? 'XXXXX' : esc($('dui').value.trim() || 'No indicado');
  const tipo = radio('tipo') === 'despido' ? 'Despido injustificado' : 'Renuncia voluntaria';
  const f = resultado.filas.map(x => `<tr><td>${x.label}<br><small>${x.detalle}</small></td><td style="text-align:right">${money(x.monto)}</td></tr>`).join('');
  $('comprobante').innerHTML = `
    <h1>Comprobante de liquidación laboral</h1>
    <p>Emitido el ${today}<br>Nombre: <b>${nombre}</b> · DUI: <b>${dui}</b><br>
    Cierre: ${tipo} · Periodo: ${$('fIni').value} a ${$('fFin').value} · Salario mensual: ${money(val('sbm'))}</p>
    <table>${f}</table>
    <p>TOTAL 1 (ingresos brutos): <b>${money(resultado.t1)}</b><br>
    ISSS (3%, tope $1,000): − ${money(resultado.isss)}<br>AFP (7.25%): − ${money(resultado.afp)}<br>
    <b>TOTAL 2 (neto a recibir): ${money(resultado.t2)}</b></p>
    <p><small>Cálculo de referencia. ISSS y AFP se aplican sobre rubros salariales (vacaciones, horas extras, descansos y asuetos). No sustituye asesoría legal.</small></p>`;
  window.print();
}

// ---- Eventos ----
$('form').addEventListener('input', calcular);
$('form').addEventListener('change', calcular);
$('form').addEventListener('submit', e => {
  e.preventDefault(); $('sbm').dataset.tocado = 1; calcular();
  $('panel').scrollIntoView({behavior: 'smooth', block: 'start'});
});
$('sbm').addEventListener('blur', () => { $('sbm').dataset.tocado = 1; calcular(); });
$('descFecha').addEventListener('change', e => {
  const v = e.target.value;
  if (v && !fechasDescanso.includes(v)) { fechasDescanso.push(v); fechasDescanso.sort(); }
  e.target.value = ''; $('descDias').value = fechasDescanso.length; pintarChips(); calcular();
});
$('dui').addEventListener('input', e => {
  const d = e.target.value.replace(/\D/g, '').slice(0, 9);
  e.target.value = d.length > 8 ? d.slice(0, 8) + '-' + d.slice(8) : d;
});
$('btnPdf').addEventListener('click', exportarPdf);
$('fFin').value = today;
calcular();
