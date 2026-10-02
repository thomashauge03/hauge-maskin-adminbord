/* ══════════════════════════════════════════════════════════════════
   LUKKEREN

   Mobilappen lukker tre skrå plater når du trykker på en side. Chrome
   tar over skjermen, og da er det systemet selv som må åpne dem igjen.
   Gjør vi det begge steder, blir overgangen sammenhengende, og den hvite
   stunden mens sida laster forsvinner bak platene.

   ── SPILLER BARE NÅR APPEN ÅPNET SIDA ──────────────────────────
   Åpner du adminbordet i en vanlig nettleser – på PC, som er
   primærplattformen – skal det ikke skje noen ting.

   Signalet er document.referrer. Når appen åpner en side, setter Chrome
   referreren til «android-app://no.haugemaskin.mobil/», og en nettleser
   kan ALDRI produsere det skjemaet: referreren er adressen til
   dokumentet som startet navigasjonen, og et nettdokument kan ikke ha
   en android-app-adresse. (Referrer-Policy i next.config.ts gjelder det
   denne sida sender videre, ikke referreren den selv får.)

   ── MÅ RENDRES INLINE FRA SERVEREN ─────────────────────────────
   Ikke lastes som en modul. Rakk nettleseren å male siden først, er hele
   poenget borte. Derfor dangerouslySetInnerHTML og ikke en import:
   innholdet skal stå i det første svaret.

   SIKKERHETSNETT: platene er display:none som utgangspunkt, så svikter
   skriptet ser ingen noe; pointer-events none; åpner senest etter 2,6
   sekund uansett; skjuler seg selv etterpå; respekterer
   prefers-reduced-motion.

   ── RØRER ALDRI ELEMENTET, BARE <html> ─────────────────────────
   Skriptet kjører før React tar over sida. Endret det #hm-lukkar, stemte
   ikke sida lenger med det serveren sendte, og React bygde hele treet på
   nytt i nettleseren. Derfor styres alt med ett attributt på <html>,
   data-hm-lukkar = lukket | opp | ferdig, og CSS-en gjør resten. <html>
   har suppressHydrationWarning i layouten av samme grunn.

   Kanonisk kopi: hauge-maskin-mobil/twa/hm-snutt.html. Endres der, og
   kopieres hit – samme kode som i qr-admin og utleie-appen.
   ══════════════════════════════════════════════════════════════════ */

const CSS = `
#hm-lukkar { display: none; }
html[data-hm-lukkar] #hm-lukkar {
  display: block;
  position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; overflow: hidden;
}
html[data-hm-lukkar="ferdig"] #hm-lukkar { display: none; }
#hm-lukkar .hm-l-grunn { position: absolute; inset: 0; background: #0a0a0c; }
#hm-lukkar i {
  position: absolute; top: -14%; bottom: -14%; width: 46%;
  background: linear-gradient(100deg, #0b0b0f 0%, #16161c 72%, #1c1c24 100%);
  transform: skewX(-12deg);
}
#hm-lukkar i::after {
  content: ""; position: absolute; right: 0; top: 0; bottom: 0; width: 4px; background: #e2001a;
}
#hm-lukkar i:nth-of-type(1) { left: -8%; }
#hm-lukkar i:nth-of-type(2) { left: 28%; }
#hm-lukkar i:nth-of-type(3) { left: 64%; }
html[data-hm-lukkar="opp"] #hm-lukkar .hm-l-grunn { opacity: 0; }
html[data-hm-lukkar="opp"] #hm-lukkar i { animation: hmLukkOpp 520ms cubic-bezier(.62,.02,.34,1) both; }
html[data-hm-lukkar="opp"] #hm-lukkar i:nth-of-type(1) { animation-delay: 0ms; }
html[data-hm-lukkar="opp"] #hm-lukkar i:nth-of-type(2) { animation-delay: 60ms; }
html[data-hm-lukkar="opp"] #hm-lukkar i:nth-of-type(3) { animation-delay: 120ms; }
@keyframes hmLukkOpp { to { transform: skewX(-12deg) translate3d(210%, 0, 0); } }
@media (prefers-reduced-motion: reduce) {
  #hm-lukkar i { display: none; }
  html[data-hm-lukkar="opp"] #hm-lukkar { opacity: 0; transition: opacity .2s linear; }
}
`

const JS = `
(function () {
  var r = document.referrer || '';
  if (r.lastIndexOf('android-app://no.haugemaskin.mobil', 0) !== 0) return;
  try {
    if (sessionStorage.getItem('hm-lukkar')) return;
    sessionStorage.setItem('hm-lukkar', '1');
  } catch (x) {}
  var html = document.documentElement;
  function sett(tilstand) { html.setAttribute('data-hm-lukkar', tilstand); }
  sett('lukket');
  var start = Date.now(), gjort = false;
  function opne() {
    if (gjort) return;
    gjort = true;
    setTimeout(function () {
      sett('opp');
      setTimeout(function () { sett('ferdig'); }, 760);
    }, Math.max(0, 260 - (Date.now() - start)));
  }
  if (document.readyState === 'complete') opne();
  else window.addEventListener('load', opne);
  setTimeout(opne, 2600);
})();
`

export function Lukkar() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div id="hm-lukkar">
        <div className="hm-l-grunn" />
        <i />
        <i />
        <i />
      </div>
      <script dangerouslySetInnerHTML={{ __html: JS }} />
    </>
  )
}
