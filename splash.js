// Schermata di benvenuto: su fondo bianco il logo si disegna in circa un secondo, poi sparisce.
// Il logo è quello originale (PNG), diviso in tre livelli senza ridisegnarlo:
//   1. l'arca con la A, che compare con un giro di lancetta;
//   2. la scritta «L'arca di Annalisa», che compare lungo il suo arco da sinistra a destra;
//   3. impronte e «ODV», in dissolvenza.
// Un tocco la salta. Con «Riduci movimento» attivo mostra il logo fermo.
(function () {
  const el = document.getElementById('splash'); if (!el) return;
  const [arca, nome, zampe] = ['arca', 'nome', 'zampe'].map(k => el.querySelector('.s-' + k));
  const CENTRO = 'at 52.5% 54%';   // centro dell'arco della scritta, in proporzione al logo
  let finito = false;
  const fine = () => {
    if (finito) return; finito = true;
    el.classList.add('via'); setTimeout(() => el.remove(), 350);
  };
  el.addEventListener('click', fine);
  const scadenza = setTimeout(fine, 2500);   // se le immagini non arrivano, non blocca l'app
  const mask = (img, da, gradi) => {
    const g = gradi === null ? 'none' : `conic-gradient(from ${da}deg ${CENTRO}, #000 ${gradi}deg, transparent ${gradi + 12}deg)`;
    img.style.webkitMaskImage = g; img.style.maskImage = g;
  };
  const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const fermo = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  Promise.all([arca, nome, zampe].map(i => i.decode ? i.decode().catch(() => { }) : null)).then(() => {
    if (finito) return;
    clearTimeout(scadenza);
    if (fermo) { zampe.style.opacity = 1; el.classList.add('pronto'); setTimeout(fine, 800); return; }
    mask(arca, 0, -12); mask(nome, -100, -12);
    el.classList.add('pronto');
    const t0 = performance.now();
    const passo = now => {
      if (finito) return;
      const t = now - t0;
      mask(arca, 0, -12 + 374 * ease((t - 40) / 620));        // 0,04 – 0,66 s
      mask(nome, -100, -12 + 200 * ease((t - 520) / 520));    // 0,52 – 1,04 s
      const z = ease((t - 780) / 300);                          // 0,78 – 1,08 s
      zampe.style.opacity = z; zampe.style.transform = `scale(${0.94 + 0.06 * z})`;
      if (t < 1100) requestAnimationFrame(passo);
      else { mask(arca, 0, null); mask(nome, 0, null); setTimeout(fine, 280); }
    };
    requestAnimationFrame(passo);
  });
})();
