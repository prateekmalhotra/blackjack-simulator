import { Chart, LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, Legend, Tooltip, Filler } from 'chart.js';
import { createIcons, Play, Square } from 'lucide';
import type { GameRules, SimulationConfig, SimulationProgress } from './simulation/types';
import './style.css';

// Register Chart.js components
Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, Legend, Tooltip, Filler);

// Initialize Lucide Icons
createIcons({
  icons: {
    Play,
    Square
  }
});

// App State
let simWorker: Worker | null = null;
let chart: Chart | null = null;
let sessionVarianceChart: Chart | null = null;
let selectedSessionHours: number = 4;
let lastSimulationProgress: SimulationProgress | null = null;
let lastSimulationConfig: SimulationConfig | null = null;
let currentSessionMu: number = 0;
let currentSessionSigma: number = 1;

// Default Bet Spread (True Count -> Bet Size multiplier or absolute amount)
let betSpread: Record<number, string | number> = {
  [-3]: 0,
  [-2]: 10,
  [-1]: 10,
  [0]: 10,
  [1]: 25,
  [2]: '2x50',
  [3]: '2x75',
  [4]: '2x100',
  [5]: '2x125',
  [6]: '2x150'
};

// UI Elements
const ruleGameTypeSelect = document.getElementById('rule-game-type') as HTMLSelectElement;
const ruleDecksInput = document.getElementById('rule-decks') as HTMLInputElement;
const ruleSoft17Select = document.getElementById('rule-soft17') as HTMLSelectElement;
const ruleBlackjackPayoutSelect = document.getElementById('rule-blackjack-payout') as HTMLSelectElement;
const rulePenetrationInput = document.getElementById('rule-penetration') as HTMLInputElement;
const ruleDasSelect = document.getElementById('rule-das') as HTMLSelectElement;
const ruleSurrenderSelect = document.getElementById('rule-surrender') as HTMLSelectElement;
const ruleMinBetInput = document.getElementById('rule-minbet') as HTMLInputElement;
const ruleMaxBetInput = document.getElementById('rule-maxbet') as HTMLInputElement;
const ruleRoundingSelect = document.getElementById('rule-rounding') as HTMLSelectElement;

const standardRulesContainer = document.getElementById('standard-rules-container') as HTMLDivElement;
const standardPlayerSettings = document.getElementById('standard-player-settings') as HTMLDivElement;

const playSeatsInput = document.getElementById('play-seats') as HTMLInputElement;
const playTableSeatsSelect = document.getElementById('play-table-seats') as HTMLSelectElement;
const playBankrollInput = document.getElementById('play-bankroll') as HTMLInputElement;
const playStrategySelect = document.getElementById('play-strategy') as HTMLSelectElement;
const playWongoutInput = document.getElementById('play-wongout') as HTMLInputElement;
const playWongoutMinInput = document.getElementById('play-wongout-min') as HTMLInputElement;
const betSpreadContainer = document.getElementById('bet-spread-container') as HTMLDivElement;
const hiloSpreadSection = document.getElementById('hilo-spread-section') as HTMLDivElement;

// Pot of Gold UI Elements
const pogConfigSection = document.getElementById('pog-config-section') as HTMLDivElement;
const pogPaytableSelect = document.getElementById('pog-paytable') as HTMLSelectElement;
const pogStakingModeSelect = document.getElementById('pog-staking-mode') as HTMLSelectElement;
const pogOutsideBtn1Hand = document.getElementById('pog-outside-btn-1hand') as HTMLButtonElement;
const pogOutsideBtn2Hands = document.getElementById('pog-outside-btn-2hands') as HTMLButtonElement;
const pogOutsideMainBetInput = document.getElementById('pog-outside-main-bet') as HTMLInputElement;
const pogOutsideHint = document.getElementById('pog-outside-hint') as HTMLDivElement;

const pogBtn1Hand = document.getElementById('pog-btn-1hand') as HTMLButtonElement;
const pogBtn2Hands = document.getElementById('pog-btn-2hands') as HTMLButtonElement;
const pogHandsHint = document.getElementById('pog-hands-hint') as HTMLDivElement;
const pogSideBetInput = document.getElementById('pog-side-bet') as HTMLInputElement;
const pogCustomMainContainer = document.getElementById('pog-custom-main-container') as HTMLDivElement;
const pogTriggerMainBetInput = document.getElementById('pog-trigger-main-bet') as HTMLInputElement;
const pogSideBetCapSelect = document.getElementById('pog-side-bet-cap') as HTMLSelectElement;
const pogCustomCapContainer = document.getElementById('pog-custom-cap-container') as HTMLDivElement;
const pogCustomCapInput = document.getElementById('pog-custom-cap') as HTMLInputElement;
const pogTriggerRcInput = document.getElementById('pog-trigger-rc') as HTMLInputElement;
const pogFarmFivesCheckbox = document.getElementById('pog-farm-fives') as HTMLInputElement;
const pogWongEnabledCheckbox = document.getElementById('pog-wong-enabled') as HTMLInputElement;
const pogWongControls = document.getElementById('pog-wong-controls') as HTMLDivElement;
const pogWongInInput = document.getElementById('pog-wong-in') as HTMLInputElement;
const pogWongOutInput = document.getElementById('pog-wong-out') as HTMLInputElement;
const pogPreviewContent = document.getElementById('pog-preview-content') as HTMLDivElement;

let pogSpotsOutsideTrigger: 1 | 2 = 1; // default 1 spot from start
let pogSpotsOnTrigger: 1 | 2 = 2; // default 2 spots on trigger

pogWongEnabledCheckbox.addEventListener('change', () => {
  pogWongControls.style.display = pogWongEnabledCheckbox.checked ? 'flex' : 'none';
});

pogStakingModeSelect.addEventListener('change', () => {
  pogCustomMainContainer.style.display = pogStakingModeSelect.value === 'custom' ? 'block' : 'none';
  updatePogPreview();
});

pogSideBetCapSelect.addEventListener('change', () => {
  pogCustomCapContainer.style.display = pogSideBetCapSelect.value === 'custom' ? 'flex' : 'none';
  updatePogPreview();
});

pogOutsideBtn1Hand?.addEventListener('click', () => {
  pogSpotsOutsideTrigger = 1;
  pogOutsideBtn1Hand.style.borderColor = 'var(--color-primary)';
  pogOutsideBtn1Hand.style.color = 'var(--color-primary)';
  pogOutsideBtn1Hand.style.fontWeight = '700';
  pogOutsideBtn2Hands.style.borderColor = 'var(--border-color)';
  pogOutsideBtn2Hands.style.color = 'var(--text-secondary)';
  pogOutsideBtn2Hands.style.fontWeight = '500';
  updatePogPreview();
});

pogOutsideBtn2Hands?.addEventListener('click', () => {
  pogSpotsOutsideTrigger = 2;
  pogOutsideBtn2Hands.style.borderColor = 'var(--color-primary)';
  pogOutsideBtn2Hands.style.color = 'var(--color-primary)';
  pogOutsideBtn2Hands.style.fontWeight = '700';
  pogOutsideBtn1Hand.style.borderColor = 'var(--border-color)';
  pogOutsideBtn1Hand.style.color = 'var(--text-secondary)';
  pogOutsideBtn1Hand.style.fontWeight = '500';
  updatePogPreview();
});

pogOutsideMainBetInput?.addEventListener('input', () => {
  const val = pogOutsideMainBetInput.value.trim().toLowerCase();
  const match = val.match(/^(\d+)[xX\u00d7*](\d+)$/);
  if (match) {
    pogSpotsOutsideTrigger = Math.min(2, Math.max(1, parseInt(match[1], 10))) as 1 | 2;
    if (pogSpotsOutsideTrigger === 2) {
      pogOutsideBtn2Hands.style.borderColor = 'var(--color-primary)';
      pogOutsideBtn2Hands.style.color = 'var(--color-primary)';
      pogOutsideBtn2Hands.style.fontWeight = '700';
      pogOutsideBtn1Hand.style.borderColor = 'var(--border-color)';
      pogOutsideBtn1Hand.style.color = 'var(--text-secondary)';
      pogOutsideBtn1Hand.style.fontWeight = '500';
    } else {
      pogOutsideBtn1Hand.style.borderColor = 'var(--color-primary)';
      pogOutsideBtn1Hand.style.color = 'var(--color-primary)';
      pogOutsideBtn1Hand.style.fontWeight = '700';
      pogOutsideBtn2Hands.style.borderColor = 'var(--border-color)';
      pogOutsideBtn2Hands.style.color = 'var(--text-secondary)';
      pogOutsideBtn2Hands.style.fontWeight = '500';
    }
  }
  updatePogPreview();
});

pogBtn1Hand?.addEventListener('click', () => {
  pogSpotsOnTrigger = 1;
  pogBtn1Hand.style.borderColor = 'var(--color-primary)';
  pogBtn1Hand.style.color = 'var(--color-primary)';
  pogBtn1Hand.style.fontWeight = '700';
  pogBtn2Hands.style.borderColor = 'var(--border-color)';
  pogBtn2Hands.style.color = 'var(--text-secondary)';
  pogBtn2Hands.style.fontWeight = '500';
  updatePogPreview();
});

pogBtn2Hands?.addEventListener('click', () => {
  pogSpotsOnTrigger = 2;
  pogBtn2Hands.style.borderColor = 'var(--color-primary)';
  pogBtn2Hands.style.color = 'var(--color-primary)';
  pogBtn2Hands.style.fontWeight = '700';
  pogBtn1Hand.style.borderColor = 'var(--border-color)';
  pogBtn1Hand.style.color = 'var(--text-secondary)';
  pogBtn1Hand.style.fontWeight = '500';
  updatePogPreview();
});

ruleMinBetInput.addEventListener('input', updatePogPreview);
pogSideBetInput.addEventListener('input', updatePogPreview);
pogTriggerMainBetInput.addEventListener('input', () => {
  const val = pogTriggerMainBetInput.value.trim().toLowerCase();
  const match = val.match(/^(\d+)[xX\u00d7*](\d+)$/);
  if (match) {
    pogSpotsOnTrigger = Math.min(2, Math.max(1, parseInt(match[1], 10))) as 1 | 2;
    if (pogSpotsOnTrigger === 2) {
      pogBtn2Hands.style.borderColor = 'var(--color-primary)';
      pogBtn2Hands.style.color = 'var(--color-primary)';
      pogBtn2Hands.style.fontWeight = '700';
      pogBtn1Hand.style.borderColor = 'var(--border-color)';
      pogBtn1Hand.style.color = 'var(--text-secondary)';
      pogBtn1Hand.style.fontWeight = '500';
    } else {
      pogBtn1Hand.style.borderColor = 'var(--color-primary)';
      pogBtn1Hand.style.color = 'var(--color-primary)';
      pogBtn1Hand.style.fontWeight = '700';
      pogBtn2Hands.style.borderColor = 'var(--border-color)';
      pogBtn2Hands.style.color = 'var(--text-secondary)';
      pogBtn2Hands.style.fontWeight = '500';
    }
  }
  if (pogStakingModeSelect && pogStakingModeSelect.value !== 'custom') {
    pogStakingModeSelect.value = 'custom';
    if (pogCustomMainContainer) pogCustomMainContainer.style.display = 'block';
  }
  updatePogPreview();
});
pogCustomCapInput.addEventListener('input', updatePogPreview);
pogTriggerRcInput.addEventListener('input', updatePogPreview);

function updatePogPreview() {
  if (!pogPreviewContent) return;
  const minBet = parseInt(ruleMinBetInput.value, 10) || 10;
  const rawSideBet = parseInt(pogSideBetInput.value, 10) || 40;
  const stakingMode = pogStakingModeSelect ? pogStakingModeSelect.value : 'custom';
  const capMode = pogSideBetCapSelect ? pogSideBetCapSelect.value : 'none';
  const customCap = parseInt(pogCustomCapInput?.value || '25', 10) || 25;
  const triggerRC = parseInt(pogTriggerRcInput?.value || '12', 10);
  const displayRC = isNaN(triggerRC) ? 12 : triggerRC;
  
  // Outside Trigger settings
  const rawOutsideStr = pogOutsideMainBetInput ? pogOutsideMainBetInput.value.trim().toLowerCase() : '';
  const matchOutside = rawOutsideStr.match(/^(\d+)[xX\u00d7*](\d+)$/);
  let outsideSpots = pogSpotsOutsideTrigger;
  let outsideMainPerSpot = minBet;
  if (matchOutside) {
    outsideSpots = Math.min(2, Math.max(1, parseInt(matchOutside[1], 10))) as 1 | 2;
    outsideMainPerSpot = parseInt(matchOutside[2], 10) || minBet;
  } else {
    const parsedNum = parseInt(rawOutsideStr.replace(/[^0-9]/g, ''), 10);
    outsideMainPerSpot = isNaN(parsedNum) ? minBet : Math.max(1, parsedNum);
  }
  const outsideTotal = outsideSpots * outsideMainPerSpot;

  // Inside Trigger settings
  let spots = pogSpotsOnTrigger;
  const rawTriggerMainStr = pogTriggerMainBetInput ? pogTriggerMainBetInput.value.trim().toLowerCase() : '';
  let triggerMainPerSpot = 5;
  const matchTrigger = rawTriggerMainStr.match(/^(\d+)[xX\u00d7*](\d+)$/);
  if (matchTrigger) {
    spots = Math.min(2, Math.max(1, parseInt(matchTrigger[1], 10))) as 1 | 2;
    triggerMainPerSpot = parseInt(matchTrigger[2], 10) || 5;
  } else {
    const cleanDigits = rawTriggerMainStr.replace(/[^0-9]/g, '');
    const parsedNum = parseInt(cleanDigits, 10);
    triggerMainPerSpot = (isNaN(parsedNum) || parsedNum <= 0) ? 5 : parsedNum;
  }

  if (stakingMode === 'tied') {
    triggerMainPerSpot = Math.max(triggerMainPerSpot, rawSideBet);
  } else if (stakingMode === 'unconstrained') {
    triggerMainPerSpot = minBet;
  }

  let effectiveCap = 1000;
  if (capMode === '25') effectiveCap = 25;
  else if (capMode === '50') effectiveCap = 50;
  else if (capMode === '100') effectiveCap = 100;
  else if (capMode === 'custom') effectiveCap = customCap;

  let triggerSidePerSpot = Math.min(rawSideBet, effectiveCap);
  if (stakingMode === 'tied') {
    triggerSidePerSpot = Math.min(triggerSidePerSpot, triggerMainPerSpot);
  }

  const triggerTotalRound = spots * (triggerMainPerSpot + triggerSidePerSpot);

  if (pogOutsideHint) {
    pogOutsideHint.innerHTML = `Playing <strong>${outsideSpots} ${outsideSpots === 1 ? 'spot' : 'spots'}</strong> outside trigger ($${outsideMainPerSpot}/spot).`;
  }

  if (pogHandsHint) {
    pogHandsHint.innerHTML = `Playing <strong>${spots} ${spots === 1 ? 'spot' : 'spots'}</strong> on trigger with $${triggerMainPerSpot} Main + $${triggerSidePerSpot} Side.`;
  }

  pogPreviewContent.innerHTML = `
    <div style="margin-bottom: 0.35rem;">
      <span style="color: var(--text-muted); font-weight: 600;">🟡 Outside Trigger (RC &gt; ${displayRC}):</span><br>
      &nbsp;&nbsp;${outsideSpots} ${outsideSpots === 1 ? 'spot' : 'spots'} × $${outsideMainPerSpot} Main + $0 Side = <strong>$${outsideTotal} / round</strong>
    </div>
    <div>
      <span style="color: var(--color-success); font-weight: 700;">🟢 Inside Trigger (RC ≤ ${displayRC}):</span><br>
      &nbsp;&nbsp;${spots} ${spots === 1 ? 'spot' : 'spots'} × ($${triggerMainPerSpot} Main + $${triggerSidePerSpot} Side) = <strong>$${triggerTotalRound} / round</strong>
      ${triggerSidePerSpot < rawSideBet ? `<span style="display:block; font-size: 0.72rem; color: var(--color-danger); margin-top: 0.15rem;">*Side bet clamped to $${triggerSidePerSpot} by house cap</span>` : ''}
    </div>
  `;
}

// Toggle game type UI
ruleGameTypeSelect.addEventListener('change', () => {
  const isPotOfGold = ruleGameTypeSelect.value === 'free_bet';
  if (isPotOfGold) {
    pogConfigSection.style.display = 'block';
    hiloSpreadSection.style.display = 'none';
    if (standardRulesContainer) standardRulesContainer.style.display = 'none';
    if (standardPlayerSettings) standardPlayerSettings.style.display = 'none';
    
    // Pot of Gold defaults
    playBankrollInput.value = '10000';
    ruleDecksInput.value = '6';
    rulePenetrationInput.value = '83';
    ruleMinBetInput.value = '10';
    pogPaytableSelect.value = 'pt2';
    pogStakingModeSelect.value = 'custom';
    if (pogCustomMainContainer) pogCustomMainContainer.style.display = 'block';
    pogSpotsOutsideTrigger = 2;
    if (pogOutsideMainBetInput) pogOutsideMainBetInput.value = '20';
    pogSpotsOnTrigger = 2;
    if (pogTriggerMainBetInput) pogTriggerMainBetInput.value = '5';
    pogSideBetInput.value = '40';
    pogTriggerRcInput.value = '12';
    pogFarmFivesCheckbox.checked = true;
    pogWongEnabledCheckbox.checked = false;
    pogWongControls.style.display = 'none';
    pogWongInInput.value = '12';
    pogWongOutInput.value = '20';
    playStrategySelect.value = 'basic';
    playWongoutInput.checked = false;
    ruleSoft17Select.value = 'hit';
    ruleDasSelect.value = 'true';
    ruleSurrenderSelect.value = 'false';

    if (pogOutsideBtn1Hand && pogOutsideBtn2Hands) {
      pogOutsideBtn2Hands.style.borderColor = 'var(--color-primary)';
      pogOutsideBtn2Hands.style.color = 'var(--color-primary)';
      pogOutsideBtn2Hands.style.fontWeight = '700';
      pogOutsideBtn1Hand.style.borderColor = 'var(--border-color)';
      pogOutsideBtn1Hand.style.color = 'var(--text-secondary)';
      pogOutsideBtn1Hand.style.fontWeight = '500';
    }

    pogBtn2Hands.style.borderColor = 'var(--color-primary)';
    pogBtn2Hands.style.color = 'var(--color-primary)';
    pogBtn2Hands.style.fontWeight = '700';
    pogBtn1Hand.style.borderColor = 'var(--border-color)';
    pogBtn1Hand.style.color = 'var(--text-secondary)';
    pogBtn1Hand.style.fontWeight = '500';

    updatePogPreview();
  } else {
    pogConfigSection.style.display = 'none';
    hiloSpreadSection.style.display = 'block';
    if (standardRulesContainer) standardRulesContainer.style.display = 'block';
    if (standardPlayerSettings) standardPlayerSettings.style.display = 'block';
    playBankrollInput.value = '25000';
    rulePenetrationInput.value = '83';
    ruleMinBetInput.value = '10';
    playStrategySelect.value = 'i18';
    playWongoutInput.checked = true;
  }

  if (lastSimulationProgress && lastSimulationConfig) {
    updateSessionVarianceChart(lastSimulationProgress, lastSimulationConfig);
  } else {
    renderDefaultSessionVariance();
  }
});

const simHandsSelect = document.getElementById('sim-hands') as HTMLSelectElement;
const simStartBtn = document.getElementById('sim-start-btn') as HTMLButtonElement;
const simStopBtn = document.getElementById('sim-stop-btn') as HTMLButtonElement;

const statHands = document.getElementById('stat-hands') as HTMLSpanElement;
const statRtp = document.getElementById('stat-rtp') as HTMLSpanElement;
const statProfit = document.getElementById('stat-profit') as HTMLSpanElement;
const statRuins = document.getElementById('stat-ruins') as HTMLSpanElement;
const statHourlyProfit = document.getElementById('stat-hourly-profit') as HTMLSpanElement;
const statN0 = document.getElementById('stat-n0') as HTMLSpanElement;
const statRor = document.getElementById('stat-ror') as HTMLSpanElement;
const seatsTableBody = document.getElementById('seats-table-body') as HTMLTableSectionElement;

// Session Variance & Risk Distribution DOM Elements
const sessionStatEv = document.getElementById('session-stat-ev') as HTMLSpanElement;
const sessionStatEvSub = document.getElementById('session-stat-ev-sub') as HTMLSpanElement;
const sessionStatWinProb = document.getElementById('session-stat-win-prob') as HTMLSpanElement;
const sessionStatLossProb = document.getElementById('session-stat-loss-prob') as HTMLSpanElement;
const sessionStatSigma = document.getElementById('session-stat-sigma') as HTMLSpanElement;
const sessionStat1sd = document.getElementById('session-stat-1sd') as HTMLSpanElement;
const sessionStat2sd = document.getElementById('session-stat-2sd') as HTMLSpanElement;
const sessionStatStoploss = document.getElementById('session-stat-stoploss') as HTMLSpanElement;
const callout1sd = document.getElementById('callout-1sd') as HTMLElement;
const calloutStoploss = document.getElementById('callout-stoploss') as HTMLElement;
const sessionBadgeStatus = document.getElementById('session-badge-status') as HTMLSpanElement;

// --------------------------------------------------------------------------
// BET SPREAD EDITOR
// --------------------------------------------------------------------------
function renderBetSpreadEditor() {
  betSpreadContainer.innerHTML = '';
  const counts = Object.keys(betSpread).map(Number).sort((a, b) => a - b);
  
  counts.forEach(count => {
    const row = document.createElement('div');
    row.className = 'bet-spread-row';

    const countLabel = document.createElement('span');
    countLabel.className = 'bet-spread-label';
    countLabel.textContent = count <= 0 ? `TC = ${count}` : `TC = +${count}`;
    if (count === -3) countLabel.textContent = `TC ≤ -3`;
    if (count === 6) countLabel.textContent = `TC ≥ +6`;

    const betInput = document.createElement('input');
    betInput.type = 'text';
    betInput.className = 'bet-spread-input';
    betInput.value = betSpread[count].toString();
    betInput.addEventListener('change', () => {
      const val = betInput.value.trim();
      if (val.length > 0) {
        betSpread[count] = val;
      }
    });

    row.appendChild(countLabel);
    row.appendChild(betInput);
    betSpreadContainer.appendChild(row);
  });
}

// Watch table limit changes to auto-adjust bet spread limits
ruleMinBetInput.addEventListener('change', () => {
  const minVal = parseInt(ruleMinBetInput.value, 10);
  if (!isNaN(minVal)) {
    Object.keys(betSpread).forEach(k => {
      const numKey = Number(k);
      const spreadVal = betSpread[numKey];
      if (typeof spreadVal === 'number') {
        if (spreadVal < minVal) {
          betSpread[numKey] = minVal;
        }
      } else {
        const match = spreadVal.trim().toLowerCase().match(/^(\d+)x\$?(\d+)$/);
        if (match) {
          const numHands = match[1];
          const betSize = parseInt(match[2], 10);
          if (betSize < minVal) {
            betSpread[numKey] = `${numHands}x${minVal}`;
          }
        } else {
          const valNum = parseInt(spreadVal, 10);
          if (!isNaN(valNum) && valNum < minVal) {
            betSpread[numKey] = minVal;
          }
        }
      }
    });
    renderBetSpreadEditor();
  }
});

// --------------------------------------------------------------------------
// CHART MANAGEMENT
// --------------------------------------------------------------------------
function initChart() {
  const ctx = (document.getElementById('bankroll-chart') as HTMLCanvasElement).getContext('2d');
  if (!ctx) return;

  if (chart) {
    chart.destroy();
  }

  // Anthropic chart theme colors (charcoal/earth tones)
  const gridColor = '#e5e0d8';
  const labelColor = '#7d7973';

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: []
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          labels: {
            color: labelColor,
            font: { family: 'Outfit', weight: 'bold' },
            filter: (item, chartData) => {
              if (chartData.datasets.length > 5) {
                return item.text === 'Average Trajectory';
              }
              return true;
            }
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: labelColor, font: { family: 'JetBrains Mono' } }
        },
        y: {
          grid: { color: gridColor },
          ticks: { color: labelColor, font: { family: 'JetBrains Mono' } }
        }
      }
    }
  });
}

function updateChart(progress: SimulationProgress, config: SimulationConfig) {
  if (!chart) return;

  const isMulti = config.numPlayers > 5;
  chart.data.labels = progress.sampleIndices.map(h => `${h.toLocaleString()} hands`);

  chart.options.interaction = {
    mode: isMulti ? 'dataset' : 'index',
    intersect: false
  };

  if (!isMulti) {
    const colors = ['#191919', '#991b1b', '#15803d', '#b45309', '#2563eb'];
    chart.data.datasets = progress.bankrollHistorySamples.map((history, idx) => {
      return {
        label: `Player ${idx + 1}`,
        data: history,
        borderColor: colors[idx % colors.length],
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: history.length > 500 ? 0 : 2,
        tension: 0.1
      };
    });
  } else {
    // Build faint individual player lines
    const datasets: any[] = progress.bankrollHistorySamples.map((history, idx) => {
      return {
        label: `Player ${idx + 1}`,
        data: history,
        borderColor: 'rgba(25, 25, 25, 0.04)',
        backgroundColor: 'transparent',
        borderWidth: 1,
        pointRadius: 0,
        pointHitRadius: 0,
        tension: 0.1,
        hoverBorderColor: '#ef4444',
        hoverBorderWidth: 2
      };
    });

    // Calculate Average line
    const numSamples = progress.sampleIndices.length;
    const averageHistory: number[] = [];
    for (let s = 0; s < numSamples; s++) {
      let sum = 0;
      for (let p = 0; p < progress.bankrollHistorySamples.length; p++) {
        sum += progress.bankrollHistorySamples[p][s];
      }
      averageHistory.push(sum / progress.bankrollHistorySamples.length);
    }

    // Add average line as the last dataset (so it sits on top)
    datasets.push({
      label: 'Average Trajectory',
      data: averageHistory,
      borderColor: '#3b82f6', // beautiful brand blue
      backgroundColor: 'transparent',
      borderWidth: 3.5,
      pointRadius: 0,
      pointHitRadius: 5,
      tension: 0.1,
      hoverBorderColor: '#2563eb',
      hoverBorderWidth: 4
    });

    chart.data.datasets = datasets;
  }

  chart.update('none');
}

// --------------------------------------------------------------------------
// NORMAL DISTRIBUTION & BELL CURVE MATH UTILITIES
// --------------------------------------------------------------------------
function erf(x: number): number {
  // Abramowitz and Stegun formula 7.1.26
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

function normalCdf(x: number, mean: number, std: number): number {
  if (std <= 0) return x >= mean ? 1 : 0;
  return 0.5 * (1 + erf((x - mean) / (std * Math.SQRT2)));
}

function normalPdf(x: number, mean: number, std: number): number {
  if (std <= 0) return 0;
  const z = (x - mean) / std;
  return (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
}

function getTableHandsPerHour(seats: number): number {
  if (seats === 1) return 246;
  if (seats === 2) return 139;
  if (seats === 3) return 104;
  if (seats === 4) return 83;
  if (seats === 5) return 70;
  return 60;
}

// --------------------------------------------------------------------------
// SESSION VARIANCE CHART (BELL CURVE & LOSS STOMACHABILITY)
// --------------------------------------------------------------------------
function initSessionVarianceChart() {
  const canvas = document.getElementById('session-variance-chart') as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (sessionVarianceChart) {
    sessionVarianceChart.destroy();
  }

  const gridColor = '#e5e0d8';
  const labelColor = '#7d7973';

  sessionVarianceChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: []
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: labelColor,
            font: { family: 'Inter', size: 11, weight: 'bold' },
            boxWidth: 12,
            boxHeight: 12,
            filter: (item) => {
              return !['Bell Curve Density', '-1σ Tough Cutoff', '-2σ Brutal Cutoff'].includes(item.text);
            }
          }
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              if (!items.length || items[0].parsed.x == null) return '';
              const xVal = Math.round(items[0].parsed.x);
              return `Session Net: ${xVal >= 0 ? '+$' : '-$'}${Math.abs(xVal).toLocaleString()}`;
            },
            label: (item) => {
              const xVal = item.parsed.x;
              if (xVal == null) return '';
              if (item.dataset.label && (item.dataset.label.includes('Break Even') || item.dataset.label.includes('Session EV'))) {
                return item.dataset.label;
              }
              const cdf = normalCdf(xVal, currentSessionMu, currentSessionSigma);
              const pct = (cdf * 100).toFixed(1);
              const betterPct = ((1 - cdf) * 100).toFixed(1);
              let zone = '🔹 Normal Variance Zone (±1σ)';
              if (xVal < currentSessionMu - 2 * currentSessionSigma) {
                zone = '⚠️ Extreme Downswing Zone (< -2σ, 2.3% tail risk)';
              } else if (xVal < currentSessionMu - currentSessionSigma) {
                zone = '🔸 Tough Drawdown Zone (-1σ to -2σ, 16% risk)';
              } else if (xVal > currentSessionMu + 2 * currentSessionSigma) {
                zone = '🔥 Monster Session Zone (> +2σ, top 2.3%)';
              } else if (xVal > currentSessionMu + currentSessionSigma) {
                zone = '🟢 Strong Winning Session (+1σ to +2σ)';
              }
              return [
                `Percentile: ${pct}% (${betterPct}% of sessions perform better)`,
                zone
              ];
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          grid: { color: gridColor },
          ticks: {
            color: labelColor,
            font: { family: 'JetBrains Mono', size: 11 },
            callback: (val: any) => {
              const n = Math.round(Number(val));
              if (n === 0) return '$0';
              return (n > 0 ? '+$' : '-$') + Math.abs(n).toLocaleString();
            }
          }
        },
        y: {
          type: 'linear',
          display: false,
          grid: { display: false }
        }
      }
    }
  });
}

function updateSessionVarianceChart(progress: SimulationProgress, config: SimulationConfig) {
  if (!sessionVarianceChart) {
    initSessionVarianceChart();
    if (!sessionVarianceChart) return;
  }

  const handsPerHour = getTableHandsPerHour(config.seatsPerTable);
  const sessionHands = handsPerHour * selectedSessionHours;

  if (progress.totalRoundsPlayedCount === 0 || progress.handsPlayed === 0) {
    renderDefaultSessionVariance();
    return;
  }

  const evRound = progress.sumPayouts / progress.totalRoundsPlayedCount;
  const meanOfSquares = progress.sumSquaredPayouts / progress.totalRoundsPlayedCount;
  const varRound = Math.max(0.01, meanOfSquares - (evRound * evRound));
  const stdRound = Math.sqrt(varRound);

  const mu = evRound * sessionHands;
  const sigma = Math.max(1, stdRound * Math.sqrt(sessionHands));

  currentSessionMu = mu;
  currentSessionSigma = sigma;

  const winProb = 1 - normalCdf(0, mu, sigma);
  const lossProb = normalCdf(0, mu, sigma);
  const tough1Sd = mu - sigma;
  const brutal2Sd = mu - 2 * sigma;
  const stopLoss = Math.max(0, 2 * sigma - mu);

  if (sessionStatEv) {
    sessionStatEv.textContent = (mu >= 0 ? '+' : '') + `$${Math.round(mu).toLocaleString()}`;
    sessionStatEv.className = `session-stat-value ${mu >= 0 ? 'text-success' : 'text-danger'}`;
  }
  if (sessionStatEvSub) {
    sessionStatEvSub.textContent = `Over ${selectedSessionHours} hrs (${Math.round(sessionHands).toLocaleString()} hands)`;
  }
  if (sessionStatWinProb) {
    sessionStatWinProb.textContent = `${(winProb * 100).toFixed(1)}%`;
    sessionStatWinProb.className = `session-stat-value ${winProb >= 0.5 ? 'text-success' : 'text-danger'}`;
  }
  if (sessionStatLossProb) {
    sessionStatLossProb.textContent = `P(Loss): ${(lossProb * 100).toFixed(1)}%`;
  }
  if (sessionStatSigma) {
    sessionStatSigma.textContent = `±$${Math.round(sigma).toLocaleString()}`;
  }
  if (sessionStat1sd) {
    sessionStat1sd.textContent = (tough1Sd >= 0 ? '+' : '') + `$${Math.round(tough1Sd).toLocaleString()}`;
  }
  if (sessionStat2sd) {
    sessionStat2sd.textContent = (brutal2Sd >= 0 ? '+' : '') + `$${Math.round(brutal2Sd).toLocaleString()}`;
  }
  if (sessionStatStoploss) {
    sessionStatStoploss.textContent = `$${Math.round(stopLoss).toLocaleString()}`;
  }
  if (callout1sd) {
    callout1sd.textContent = `${tough1Sd < 0 ? '-' : ''}$${Math.abs(Math.round(tough1Sd)).toLocaleString()}`;
  }
  if (calloutStoploss) {
    calloutStoploss.textContent = `$${Math.round(stopLoss).toLocaleString()}`;
  }
  if (sessionBadgeStatus) {
    sessionBadgeStatus.textContent = `${selectedSessionHours}-Hour Bell Curve (Simulated)`;
  }

  // Generate Bell Curve data points
  const xMin = mu - 3.5 * sigma;
  const xMax = mu + 3.5 * sigma;
  const numPoints = 120;
  const dx = (xMax - xMin) / numPoints;

  const pMinus2 = mu - 2 * sigma;
  const pMinus1 = mu - sigma;
  const pPlus1 = mu + sigma;
  const pPlus2 = mu + 2 * sigma;

  const yMinus2 = normalPdf(pMinus2, mu, sigma);
  const yMinus1 = normalPdf(pMinus1, mu, sigma);
  const yPlus1 = normalPdf(pPlus1, mu, sigma);
  const yPlus2 = normalPdf(pPlus2, mu, sigma);
  const peakY = normalPdf(mu, mu, sigma);

  const ptsExtreme: { x: number; y: number }[] = [];
  const ptsTough: { x: number; y: number }[] = [];
  const ptsNormal: { x: number; y: number }[] = [];
  const ptsStrong: { x: number; y: number }[] = [];
  const ptsMonster: { x: number; y: number }[] = [];
  const ptsOutline: { x: number; y: number }[] = [];

  ptsTough.push({ x: pMinus2, y: yMinus2 });
  ptsNormal.push({ x: pMinus1, y: yMinus1 });
  ptsStrong.push({ x: pPlus1, y: yPlus1 });
  ptsMonster.push({ x: pPlus2, y: yPlus2 });

  for (let i = 0; i <= numPoints; i++) {
    const x = xMin + i * dx;
    const y = normalPdf(x, mu, sigma);
    ptsOutline.push({ x, y });

    if (x <= pMinus2) ptsExtreme.push({ x, y });
    else if (x <= pMinus1) ptsTough.push({ x, y });
    else if (x <= pPlus1) ptsNormal.push({ x, y });
    else if (x <= pPlus2) ptsStrong.push({ x, y });
    else ptsMonster.push({ x, y });
  }

  ptsExtreme.push({ x: pMinus2, y: yMinus2 });
  ptsTough.push({ x: pMinus1, y: yMinus1 });
  ptsNormal.push({ x: pPlus1, y: yPlus1 });
  ptsStrong.push({ x: pPlus2, y: yPlus2 });

  sessionVarianceChart.data.datasets = [
    {
      label: 'Deep Drawdown (< -2σ, 2.3%)',
      data: ptsExtreme,
      borderColor: 'transparent',
      backgroundColor: 'rgba(239, 68, 68, 0.22)',
      fill: 'origin',
      pointRadius: 0,
      tension: 0.2
    },
    {
      label: 'Tough Session (-2σ to -1σ, 13.6%)',
      data: ptsTough,
      borderColor: 'transparent',
      backgroundColor: 'rgba(245, 158, 11, 0.20)',
      fill: 'origin',
      pointRadius: 0,
      tension: 0.2
    },
    {
      label: 'Core Variance (±1σ, 68.3%)',
      data: ptsNormal,
      borderColor: 'transparent',
      backgroundColor: 'rgba(59, 130, 246, 0.14)',
      fill: 'origin',
      pointRadius: 0,
      tension: 0.2
    },
    {
      label: 'Good Session (+1σ to +2σ, 13.6%)',
      data: ptsStrong,
      borderColor: 'transparent',
      backgroundColor: 'rgba(34, 197, 94, 0.20)',
      fill: 'origin',
      pointRadius: 0,
      tension: 0.2
    },
    {
      label: 'Monster Session (> +2σ, 2.3%)',
      data: ptsMonster,
      borderColor: 'transparent',
      backgroundColor: 'rgba(16, 185, 129, 0.30)',
      fill: 'origin',
      pointRadius: 0,
      tension: 0.2
    },
    {
      label: 'Bell Curve Density',
      data: ptsOutline,
      borderColor: '#191816',
      borderWidth: 2,
      fill: false,
      pointRadius: 0,
      tension: 0.2
    },
    {
      label: 'Break Even ($0)',
      data: [{ x: 0, y: 0 }, { x: 0, y: peakY * 1.05 }],
      borderColor: '#6b7280',
      borderWidth: 1.5,
      borderDash: [4, 4],
      fill: false,
      pointRadius: 0
    },
    {
      label: 'Session EV',
      data: [{ x: mu, y: 0 }, { x: mu, y: peakY * 1.05 }],
      borderColor: '#191816',
      borderWidth: 2,
      fill: false,
      pointRadius: 0
    },
    {
      label: '-1σ Tough Cutoff',
      data: [{ x: pMinus1, y: 0 }, { x: pMinus1, y: yMinus1 }],
      borderColor: '#d97706',
      borderWidth: 1.5,
      borderDash: [3, 3],
      fill: false,
      pointRadius: 0
    },
    {
      label: '-2σ Brutal Cutoff',
      data: [{ x: pMinus2, y: 0 }, { x: pMinus2, y: yMinus2 }],
      borderColor: '#dc2626',
      borderWidth: 1.5,
      borderDash: [3, 3],
      fill: false,
      pointRadius: 0
    }
  ];

  sessionVarianceChart.update('none');
}

function renderDefaultSessionVariance() {
  if (!sessionVarianceChart) {
    initSessionVarianceChart();
    if (!sessionVarianceChart) return;
  }

  const seats = parseInt(playTableSeatsSelect?.value || '2', 10);
  const handsPerHour = getTableHandsPerHour(seats);
  const sessionHands = handsPerHour * selectedSessionHours;
  const isPotOfGold = ruleGameTypeSelect?.value === 'free_bet';

  const evRound = isPotOfGold ? 0.75 : 0.35;
  const varRound = isPotOfGold ? 1444 : 400;
  const stdRound = Math.sqrt(varRound);

  const mu = evRound * sessionHands;
  const sigma = stdRound * Math.sqrt(sessionHands);

  currentSessionMu = mu;
  currentSessionSigma = sigma;

  const winProb = 1 - normalCdf(0, mu, sigma);
  const lossProb = normalCdf(0, mu, sigma);
  const tough1Sd = mu - sigma;
  const brutal2Sd = mu - 2 * sigma;
  const stopLoss = Math.max(0, 2 * sigma - mu);

  if (sessionStatEv) {
    sessionStatEv.textContent = `+$${Math.round(mu).toLocaleString()}`;
    sessionStatEv.className = 'session-stat-value text-success';
  }
  if (sessionStatEvSub) {
    sessionStatEvSub.textContent = `Over ${selectedSessionHours} hrs (${Math.round(sessionHands).toLocaleString()} hands)`;
  }
  if (sessionStatWinProb) {
    sessionStatWinProb.textContent = `${(winProb * 100).toFixed(1)}%`;
    sessionStatWinProb.className = 'session-stat-value text-success';
  }
  if (sessionStatLossProb) {
    sessionStatLossProb.textContent = `P(Loss): ${(lossProb * 100).toFixed(1)}%`;
  }
  if (sessionStatSigma) {
    sessionStatSigma.textContent = `±$${Math.round(sigma).toLocaleString()}`;
  }
  if (sessionStat1sd) {
    sessionStat1sd.textContent = (tough1Sd >= 0 ? '+' : '') + `$${Math.round(tough1Sd).toLocaleString()}`;
  }
  if (sessionStat2sd) {
    sessionStat2sd.textContent = (brutal2Sd >= 0 ? '+' : '') + `$${Math.round(brutal2Sd).toLocaleString()}`;
  }
  if (sessionStatStoploss) {
    sessionStatStoploss.textContent = `$${Math.round(stopLoss).toLocaleString()}`;
  }
  if (callout1sd) {
    callout1sd.textContent = `${tough1Sd < 0 ? '-' : ''}$${Math.abs(Math.round(tough1Sd)).toLocaleString()}`;
  }
  if (calloutStoploss) {
    calloutStoploss.textContent = `$${Math.round(stopLoss).toLocaleString()}`;
  }
  if (sessionBadgeStatus) {
    sessionBadgeStatus.textContent = `${selectedSessionHours}-Hour Model (Baseline)`;
  }

  // Plot baseline bell curve
  const xMin = mu - 3.5 * sigma;
  const xMax = mu + 3.5 * sigma;
  const numPoints = 120;
  const dx = (xMax - xMin) / numPoints;

  const pMinus2 = mu - 2 * sigma;
  const pMinus1 = mu - sigma;
  const pPlus1 = mu + sigma;
  const pPlus2 = mu + 2 * sigma;

  const yMinus2 = normalPdf(pMinus2, mu, sigma);
  const yMinus1 = normalPdf(pMinus1, mu, sigma);
  const yPlus1 = normalPdf(pPlus1, mu, sigma);
  const yPlus2 = normalPdf(pPlus2, mu, sigma);
  const peakY = normalPdf(mu, mu, sigma);

  const ptsExtreme: { x: number; y: number }[] = [];
  const ptsTough: { x: number; y: number }[] = [];
  const ptsNormal: { x: number; y: number }[] = [];
  const ptsStrong: { x: number; y: number }[] = [];
  const ptsMonster: { x: number; y: number }[] = [];
  const ptsOutline: { x: number; y: number }[] = [];

  ptsTough.push({ x: pMinus2, y: yMinus2 });
  ptsNormal.push({ x: pMinus1, y: yMinus1 });
  ptsStrong.push({ x: pPlus1, y: yPlus1 });
  ptsMonster.push({ x: pPlus2, y: yPlus2 });

  for (let i = 0; i <= numPoints; i++) {
    const x = xMin + i * dx;
    const y = normalPdf(x, mu, sigma);
    ptsOutline.push({ x, y });

    if (x <= pMinus2) ptsExtreme.push({ x, y });
    else if (x <= pMinus1) ptsTough.push({ x, y });
    else if (x <= pPlus1) ptsNormal.push({ x, y });
    else if (x <= pPlus2) ptsStrong.push({ x, y });
    else ptsMonster.push({ x, y });
  }

  ptsExtreme.push({ x: pMinus2, y: yMinus2 });
  ptsTough.push({ x: pMinus1, y: yMinus1 });
  ptsNormal.push({ x: pPlus1, y: yPlus1 });
  ptsStrong.push({ x: pPlus2, y: yPlus2 });

  sessionVarianceChart.data.datasets = [
    {
      label: 'Deep Drawdown (< -2σ, 2.3%)',
      data: ptsExtreme,
      borderColor: 'transparent',
      backgroundColor: 'rgba(239, 68, 68, 0.22)',
      fill: 'origin',
      pointRadius: 0,
      tension: 0.2
    },
    {
      label: 'Tough Session (-2σ to -1σ, 13.6%)',
      data: ptsTough,
      borderColor: 'transparent',
      backgroundColor: 'rgba(245, 158, 11, 0.20)',
      fill: 'origin',
      pointRadius: 0,
      tension: 0.2
    },
    {
      label: 'Core Variance (±1σ, 68.3%)',
      data: ptsNormal,
      borderColor: 'transparent',
      backgroundColor: 'rgba(59, 130, 246, 0.14)',
      fill: 'origin',
      pointRadius: 0,
      tension: 0.2
    },
    {
      label: 'Good Session (+1σ to +2σ, 13.6%)',
      data: ptsStrong,
      borderColor: 'transparent',
      backgroundColor: 'rgba(34, 197, 94, 0.20)',
      fill: 'origin',
      pointRadius: 0,
      tension: 0.2
    },
    {
      label: 'Monster Session (> +2σ, 2.3%)',
      data: ptsMonster,
      borderColor: 'transparent',
      backgroundColor: 'rgba(16, 185, 129, 0.30)',
      fill: 'origin',
      pointRadius: 0,
      tension: 0.2
    },
    {
      label: 'Bell Curve Density',
      data: ptsOutline,
      borderColor: '#191816',
      borderWidth: 2,
      fill: false,
      pointRadius: 0,
      tension: 0.2
    },
    {
      label: 'Break Even ($0)',
      data: [{ x: 0, y: 0 }, { x: 0, y: peakY * 1.05 }],
      borderColor: '#6b7280',
      borderWidth: 1.5,
      borderDash: [4, 4],
      fill: false,
      pointRadius: 0
    },
    {
      label: 'Session EV',
      data: [{ x: mu, y: 0 }, { x: mu, y: peakY * 1.05 }],
      borderColor: '#191816',
      borderWidth: 2,
      fill: false,
      pointRadius: 0
    },
    {
      label: '-1σ Tough Cutoff',
      data: [{ x: pMinus1, y: 0 }, { x: pMinus1, y: yMinus1 }],
      borderColor: '#d97706',
      borderWidth: 1.5,
      borderDash: [3, 3],
      fill: false,
      pointRadius: 0
    },
    {
      label: '-2σ Brutal Cutoff',
      data: [{ x: pMinus2, y: 0 }, { x: pMinus2, y: yMinus2 }],
      borderColor: '#dc2626',
      borderWidth: 1.5,
      borderDash: [3, 3],
      fill: false,
      pointRadius: 0
    }
  ];

  sessionVarianceChart.update('none');
}

// Session Duration Toggle Handlers
const durationButtons = document.querySelectorAll<HTMLButtonElement>('.btn-duration');
durationButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    durationButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedSessionHours = parseInt(btn.dataset.hours || '4', 10);
    if (lastSimulationProgress && lastSimulationConfig) {
      updateSessionVarianceChart(lastSimulationProgress, lastSimulationConfig);
    } else {
      renderDefaultSessionVariance();
    }
  });
});

// React to table seats changes
playTableSeatsSelect?.addEventListener('change', () => {
  if (lastSimulationProgress && lastSimulationConfig) {
    updateSessionVarianceChart(lastSimulationProgress, {
      ...lastSimulationConfig,
      seatsPerTable: parseInt(playTableSeatsSelect.value, 10) || 1
    });
  } else {
    renderDefaultSessionVariance();
  }
});

// --------------------------------------------------------------------------
// SIMULATION CONTROLLER
// --------------------------------------------------------------------------
simStartBtn.addEventListener('click', startFastSimulation);
simStopBtn.addEventListener('click', stopFastSimulation);

function startFastSimulation() {
  initChart();
  initSessionVarianceChart();
  
  const isPotOfGold = ruleGameTypeSelect.value === 'free_bet';
  const minBet = parseInt(ruleMinBetInput.value, 10) || 10;
  const spots = isPotOfGold ? pogSpotsOnTrigger : 1;
  const rawSideBet = parseInt(pogSideBetInput?.value || '40', 10) || 40;

  const rawTriggerMainStr = pogTriggerMainBetInput ? pogTriggerMainBetInput.value.trim().toLowerCase() : '';
  let triggerMainPerSpot = 5;
  const matchTrigger = rawTriggerMainStr.match(/^(\d+)[xX\u00d7*](\d+)$/);
  if (matchTrigger) {
    triggerMainPerSpot = parseInt(matchTrigger[2], 10) || 5;
  } else {
    const cleanDigits = rawTriggerMainStr.replace(/[^0-9]/g, '');
    const parsedNum = parseInt(cleanDigits, 10);
    triggerMainPerSpot = (isNaN(parsedNum) || parsedNum <= 0) ? 5 : parsedNum;
  }

  const stakingMode = pogStakingModeSelect ? pogStakingModeSelect.value : 'custom';
  if (stakingMode === 'tied') {
    triggerMainPerSpot = Math.max(triggerMainPerSpot, rawSideBet);
  } else if (stakingMode === 'unconstrained') {
    triggerMainPerSpot = minBet;
  }

  // Outside Trigger parse
  const rawOutsideStr = pogOutsideMainBetInput ? pogOutsideMainBetInput.value.trim().toLowerCase() : '';
  const matchOutside = rawOutsideStr.match(/^(\d+)[xX\u00d7*](\d+)$/);
  let outsideSpots = pogSpotsOutsideTrigger;
  let outsideMainPerSpot = minBet;
  if (matchOutside) {
    outsideSpots = Math.min(2, Math.max(1, parseInt(matchOutside[1], 10))) as 1 | 2;
    outsideMainPerSpot = parseInt(matchOutside[2], 10) || minBet;
  } else {
    const parsedNum = parseInt(rawOutsideStr.replace(/[^0-9]/g, ''), 10);
    outsideMainPerSpot = isNaN(parsedNum) ? minBet : Math.max(1, parsedNum);
  }

  const rules: GameRules = {
    gameType: isPotOfGold ? 'free_bet' : 'standard',
    numDecks: parseInt(ruleDecksInput.value, 10),
    hitSoft17: isPotOfGold ? true : (ruleSoft17Select.value === 'hit'),
    payoutBlackjack: parseFloat(ruleBlackjackPayoutSelect.value),
    doubleAfterSplit: ruleDasSelect.value === 'true',
    maxSplits: 3,
    surrenderAllowed: isPotOfGold ? false : (ruleSurrenderSelect.value === 'true'),
    penetration: parseInt(rulePenetrationInput.value, 10) / 100,
    minBet: minBet,
    maxBet: parseInt(ruleMaxBetInput.value, 10) || 1000,
    potOfGold: isPotOfGold ? {
      enabled: true,
      paytable: pogPaytableSelect.value as 'pt2' | 'pt1',
      handsOutsideTrigger: outsideSpots,
      handsOnTrigger: spots,
      outsideMainBet: outsideMainPerSpot,
      sideBetAmount: rawSideBet,
      sideBetCapType: (pogStakingModeSelect.value === 'tied' ? 'tied' : pogSideBetCapSelect.value) as any,
      sideBetCapValue: pogSideBetCapSelect.value === 'custom' ? parseInt(pogCustomCapInput?.value || '25', 10) || 25 : undefined,
      mainBetNotation: `${outsideSpots}x${outsideMainPerSpot}`,
      triggerMainBetNotation: `${spots}x${triggerMainPerSpot}`,
      raiseMainOnTrigger: true,
      triggerRC: parseInt(pogTriggerRcInput.value, 10) || 12,
      farmFives: pogFarmFivesCheckbox.checked,
      wonging: {
        enabled: pogWongEnabledCheckbox.checked,
        inRC: parseInt(pogWongInInput.value, 10) || 12,
        outRC: parseInt(pogWongOutInput.value, 10) || 20
      }
    } : undefined
  };

  const config: SimulationConfig = {
    rules,
    numPlayers: parseInt(playSeatsInput.value, 10),
    seatsPerTable: parseInt(playTableSeatsSelect.value, 10),
    startingBankroll: parseInt(playBankrollInput.value, 10),
    betSpread,
    totalHandsToSimulate: parseInt(simHandsSelect.value, 10),
    updateInterval: Math.max(10, Math.floor(parseInt(simHandsSelect.value, 10) / 100)),
    roundTrueCount: ruleRoundingSelect.value as 'whole' | 'half' | 'floor' | 'ceil',
    wongOutMin: (!isPotOfGold && playWongoutInput.checked) ? parseInt(playWongoutMinInput.value, 10) : null,
    strategy: playStrategySelect.value as 'basic' | 'i18'
  };

  simStartBtn.style.display = 'none';
  simStopBtn.style.display = 'inline-flex';
  setInputsDisabled(true);

  statHands.innerHTML = '0 <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted); display: block; margin-top: 0.15rem;">(0 hrs)</span>';
  statRtp.textContent = '0.00%';
  statProfit.textContent = '$0';
  statRuins.textContent = '0';
  statHourlyProfit.textContent = '$0/hr';
  statN0.textContent = 'N/A';
  statRor.textContent = 'N/A';
  seatsTableBody.innerHTML = '';

  simWorker = new Worker(new URL('./simulation/worker.ts', import.meta.url), { type: 'module' });
  
  simWorker.onmessage = (event: MessageEvent) => {
    const progress = event.data as SimulationProgress;
    renderProgress(progress, config);
  };

  simWorker.postMessage(config);
}

function stopFastSimulation() {
  if (simWorker) {
    simWorker.terminate();
    simWorker = null;
  }
  simStartBtn.style.display = 'inline-flex';
  simStopBtn.style.display = 'none';
  setInputsDisabled(false);
}

function setInputsDisabled(disabled: boolean) {
  ruleGameTypeSelect.disabled = disabled;
  ruleDecksInput.disabled = disabled;
  ruleSoft17Select.disabled = disabled;
  ruleBlackjackPayoutSelect.disabled = disabled;
  rulePenetrationInput.disabled = disabled;
  ruleDasSelect.disabled = disabled;
  ruleSurrenderSelect.disabled = disabled;
  ruleMinBetInput.disabled = disabled;
  ruleMaxBetInput.disabled = disabled;
  ruleRoundingSelect.disabled = disabled;
  playSeatsInput.disabled = disabled;
  playTableSeatsSelect.disabled = disabled;
  playBankrollInput.disabled = disabled;
  playStrategySelect.disabled = disabled;
  playWongoutInput.disabled = disabled;
  playWongoutMinInput.disabled = disabled;
  if (pogPaytableSelect) pogPaytableSelect.disabled = disabled;
  if (pogStakingModeSelect) pogStakingModeSelect.disabled = disabled;
  if (pogOutsideBtn1Hand) pogOutsideBtn1Hand.disabled = disabled;
  if (pogOutsideBtn2Hands) pogOutsideBtn2Hands.disabled = disabled;
  if (pogOutsideMainBetInput) pogOutsideMainBetInput.disabled = disabled;
  if (pogBtn1Hand) pogBtn1Hand.disabled = disabled;
  if (pogBtn2Hands) pogBtn2Hands.disabled = disabled;
  if (pogSideBetInput) pogSideBetInput.disabled = disabled;
  if (pogTriggerMainBetInput) pogTriggerMainBetInput.disabled = disabled;
  if (pogSideBetCapSelect) pogSideBetCapSelect.disabled = disabled;
  if (pogCustomCapInput) pogCustomCapInput.disabled = disabled;
  if (pogTriggerRcInput) pogTriggerRcInput.disabled = disabled;
  if (pogFarmFivesCheckbox) pogFarmFivesCheckbox.disabled = disabled;
  if (pogWongEnabledCheckbox) pogWongEnabledCheckbox.disabled = disabled;
  if (pogWongInInput) pogWongInInput.disabled = disabled;
  if (pogWongOutInput) pogWongOutInput.disabled = disabled;
  simHandsSelect.disabled = disabled;

  const inputs = betSpreadContainer.querySelectorAll('input');
  inputs.forEach(input => input.disabled = disabled);
}

function renderProgress(progress: SimulationProgress, config: SimulationConfig) {
  const handsPerHour = getTableHandsPerHour(config.seatsPerTable);
  const hours = progress.handsPlayed / handsPerHour;

  statHands.innerHTML = `${progress.handsPlayed.toLocaleString()} <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted); display: block; margin-top: 0.15rem;">(${Math.round(hours).toLocaleString()} hrs)</span>`;
  statRuins.textContent = progress.totalRuinCount.toString();

  let totalCurrentBankroll = progress.seatBankrolls.reduce((sum, b) => sum + b, 0);
  let totalStartingBankroll = config.startingBankroll * config.numPlayers;
  const totalReplacements = progress.seatReplacementCounts.reduce((sum, c) => sum + c, 0);
  totalStartingBankroll += totalReplacements * config.startingBankroll;

  const totalProfitValue = totalCurrentBankroll - totalStartingBankroll;
  
  statProfit.textContent = (totalProfitValue >= 0 ? '+' : '') + `$${totalProfitValue.toLocaleString()}`;
  statProfit.parentElement!.parentElement!.className = `stat-card ${totalProfitValue >= 0 ? 'success' : 'danger'}`;

  const rtp = totalStartingBankroll > 0 ? (totalCurrentBankroll / totalStartingBankroll) * 100 : 100;
  statRtp.textContent = `${rtp.toFixed(2)}%`;
  statRtp.parentElement!.parentElement!.className = `stat-card ${rtp >= 100 ? 'success' : 'danger'}`;

  const tableHourlyProfit = hours > 0 ? totalProfitValue / hours : 0;
  const avgPlayerHourlyProfit = tableHourlyProfit / config.numPlayers;
  
  statHourlyProfit.textContent = (avgPlayerHourlyProfit >= 0 ? '+' : '') + `$${Math.round(avgPlayerHourlyProfit).toLocaleString()}/hr`;
  statHourlyProfit.parentElement!.parentElement!.className = `stat-card ${avgPlayerHourlyProfit >= 0 ? 'success' : 'danger'}`;

  // Calculate N0 (N-Zero) and Risk of Ruin (RoR)
  let n0HoursText = 'N/A';
  let rorText = 'N/A';
  if (progress.totalRoundsPlayedCount > 0 && progress.sumPayouts > 0) {
    const ev = progress.sumPayouts / progress.totalRoundsPlayedCount;
    const meanOfSquares = progress.sumSquaredPayouts / progress.totalRoundsPlayedCount;
    const variance = meanOfSquares - (ev * ev);
    if (variance > 0 && ev > 0) {
      const n0Hands = variance / (ev * ev);
      const n0Hours = n0Hands / handsPerHour;
      n0HoursText = `${Math.round(n0Hours).toLocaleString()} hrs`;

      // Analytical Risk of Ruin formula: RoR = exp(-2 * B * EV / Variance)
      const B = config.startingBankroll;
      const rorVal = Math.exp(-2 * B * (ev / variance));
      rorText = `${(rorVal * 100).toFixed(2)}%`;
    }
  }
  statN0.textContent = n0HoursText;
  statRor.textContent = rorText;

  const rorValNum = parseFloat(rorText);
  if (!isNaN(rorValNum)) {
    statRor.parentElement!.parentElement!.className = `stat-card ${rorValNum < 5.0 ? 'success' : 'danger'}`;
  } else {
    statRor.parentElement!.parentElement!.className = 'stat-card';
  }

    seatsTableBody.innerHTML = '';
    const limit = Math.min(10, config.numPlayers);
    for (let i = 0; i < limit; i++) {
      const tr = document.createElement('tr');
      
      const curBankroll = progress.seatBankrolls[i];
      const replacements = progress.seatReplacementCounts[i];
      
      const seatProfit = curBankroll - config.startingBankroll - (replacements * config.startingBankroll);
      const seatHourlyProfit = hours > 0 ? seatProfit / hours : 0;
  
      tr.innerHTML = `
        <td style="font-weight:600;">Player ${i + 1}</td>
        <td class="mono">$${curBankroll.toLocaleString()}</td>
        <td class="mono">${progress.handsPlayed.toLocaleString()}</td>
        <td class="mono">${(rtp >= 100 ? 'WINNING' : 'PLAYING')}</td>
        <td class="mono">${replacements}</td>
        <td class="mono ${seatHourlyProfit >= 0 ? 'trend-up' : 'trend-down'}">${seatHourlyProfit >= 0 ? '+' : ''}$${Math.round(seatHourlyProfit).toLocaleString()}/hr</td>
        <td class="mono ${seatProfit >= 0 ? 'trend-up' : 'trend-down'}">${seatProfit >= 0 ? '+' : ''}$${seatProfit.toLocaleString()}</td>
      `;
      seatsTableBody.appendChild(tr);
    }
  
    if (config.numPlayers > 10) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td colspan="7" style="text-align: center; color: var(--text-muted); font-style: italic; background-color: var(--bg-panel); font-size: 0.8rem; padding: 0.75rem;">
          ... and ${config.numPlayers - 10} more parallel players simulated.
        </td>
      `;
      seatsTableBody.appendChild(tr);
    }

  updateChart(progress, config);
  lastSimulationProgress = progress;
  lastSimulationConfig = config;
  updateSessionVarianceChart(progress, config);

  if (progress.completed) {
    stopFastSimulation();
  }
}

// --------------------------------------------------------------------------
// APP INITS
// --------------------------------------------------------------------------
renderBetSpreadEditor();
initChart();
initSessionVarianceChart();
renderDefaultSessionVariance();
updatePogPreview();
