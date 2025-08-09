
export const ui = {};

function getEl(id) {
  const el = document.getElementById(id);
  if (!el) console.error(`Elemento con id "${id}" no encontrado`);
  return el;
}

export function setupMenu({ startBattle, resetToMenu, setPaused, resetCamera, setTimeScale, setSeed }) {
  ui.start = getEl('startBattleBtn');
  ui.quick = getEl('quickSkirmishBtn');
  ui.pause = getEl('pauseBtn');
  ui.resume = getEl('resumeBtn');
  ui.restart = getEl('restartBtn');
  ui.resetCam = getEl('resetCamBtn');
  ui.runtimeSpeed = getEl('runtimeSpeed');
  ui.seed = getEl('seedInput');
  ui.speedSlider = getEl('speedSlider');
  ui.armySelection = getEl('armySelection');
  ui.controls = getEl('controls');
  ui.stats = getEl('stats');
  ui.teamAStatus = getEl('teamAStatus');
  ui.teamBStatus = getEl('teamBStatus');
  ui.battleStatus = getEl('battleStatus');

  ui.start?.addEventListener('click', () => startBattle(readComposition()));
  ui.quick?.addEventListener('click', () => {
    const aWar = document.getElementById('teamAWarriors');
    const aArc = document.getElementById('teamAArchers');
    const aMag = document.getElementById('teamAMages');
    const bWar = document.getElementById('teamBWarriors');
    const bArc = document.getElementById('teamBArchers');
    const bMag = document.getElementById('teamBMages');
    if (aWar) aWar.value = 5; else console.error('Elemento "teamAWarriors" no encontrado');
    if (aArc) aArc.value = 3; else console.error('Elemento "teamAArchers" no encontrado');
    if (aMag) aMag.value = 2; else console.error('Elemento "teamAMages" no encontrado');
    if (bWar) bWar.value = 5; else console.error('Elemento "teamBWarriors" no encontrado');
    if (bArc) bArc.value = 3; else console.error('Elemento "teamBArchers" no encontrado');
    if (bMag) bMag.value = 2; else console.error('Elemento "teamBMages" no encontrado');
    startBattle(readComposition());
  });
  ui.pause?.addEventListener('click', () => { setPaused(true); ui.pause.classList.add('hidden'); ui.resume.classList.remove('hidden'); });
  ui.resume?.addEventListener('click', () => { setPaused(false); ui.resume.classList.add('hidden'); ui.pause.classList.remove('hidden'); });
  ui.restart?.addEventListener('click', resetToMenu);
  ui.resetCam?.addEventListener('click', resetCamera);
  ui.runtimeSpeed?.addEventListener('input', e => setTimeScale(parseFloat(e.target.value)));
  ui.speedSlider?.addEventListener('input', e => setTimeScale(parseFloat(e.target.value)));
  ui.seed?.addEventListener('change', e => setSeed(parseInt(e.target.value || '42', 10)));
}

export function showMenu() {
  ui.armySelection.classList.remove('hidden');
  ui.controls.classList.add('hidden');
  ui.stats.classList.add('hidden');
  ui.pause?.classList.remove('hidden');
  ui.resume?.classList.add('hidden');
}

export function readComposition() {
  function parseField(id, desc) {
    const value = document.getElementById(id).value;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      alert(`Valor inválido para ${desc}. Se usará 0.`);
    }
    return parsed || 0;
  }
  return {
    A: {
      guerrero: parseField('teamAWarriors', 'guerreros del Equipo A'),
      arquero: parseField('teamAArchers', 'arqueros del Equipo A'),
      mago: parseField('teamAMages', 'magos del Equipo A')
    },
    B: {
      guerrero: parseField('teamBWarriors', 'guerreros del Equipo B'),
      arquero: parseField('teamBArchers', 'arqueros del Equipo B'),
      mago: parseField('teamBMages', 'magos del Equipo B')
    }
  };
}

export function validateComp(comp) {
  const totalA = comp.A.guerrero + comp.A.arquero + comp.A.mago;
  const totalB = comp.B.guerrero + comp.B.arquero + comp.B.mago;
  return totalA >= 1 && totalB >= 1;
}
