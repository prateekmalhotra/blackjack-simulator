import { Chart, LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, Legend, Tooltip } from 'chart.js';
import { createIcons, Play, Square } from 'lucide';
import type { GameRules, SimulationConfig, SimulationProgress } from './simulation/types';
import './style.css';

// Register Chart.js components
Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, Legend, Tooltip);

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

let pogSpotsOnTrigger: 1 | 2 = 2; // default 2 spots

pogWongEnabledCheckbox.addEventListener('change', () => {
  pogWongControls.style.display = pogWongEnabledCheckbox.checked ? 'flex' : 'none';
});

pogStakingModeSelect.addEventListener('change', () => {
  pogCustomMainContainer.style.display = pogStakingModeSelect.value === 'custom' ? 'flex' : 'none';
  updatePogPreview();
});

pogSideBetCapSelect.addEventListener('change', () => {
  pogCustomCapContainer.style.display = pogSideBetCapSelect.value === 'custom' ? 'flex' : 'none';
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
pogTriggerMainBetInput.addEventListener('input', updatePogPreview);
pogCustomCapInput.addEventListener('input', updatePogPreview);
pogTriggerRcInput.addEventListener('input', updatePogPreview);

function updatePogPreview() {
  if (!pogPreviewContent) return;
  const minBet = parseInt(ruleMinBetInput.value, 10) || 10;
  const rawSideBet = parseInt(pogSideBetInput.value, 10) || 25;
  const stakingMode = pogStakingModeSelect ? pogStakingModeSelect.value : 'tied';
  const capMode = pogSideBetCapSelect ? pogSideBetCapSelect.value : 'none';
  const customCap = parseInt(pogCustomCapInput?.value || '25', 10) || 25;
  const triggerRC = parseInt(pogTriggerRcInput?.value || '12', 10);
  const displayRC = isNaN(triggerRC) ? 12 : triggerRC;
  
  const spots = pogSpotsOnTrigger;
  const minMainForSpots = spots === 2 ? (minBet * 2) : minBet;

  let triggerMainPerSpot = minMainForSpots;
  if (stakingMode === 'tied') {
    triggerMainPerSpot = Math.max(minMainForSpots, rawSideBet);
  } else if (stakingMode === 'custom') {
    const customVal = parseInt(pogTriggerMainBetInput.value, 10);
    triggerMainPerSpot = isNaN(customVal) ? minBet : Math.max(1, customVal);
  } else if (stakingMode === 'unconstrained') {
    triggerMainPerSpot = minMainForSpots;
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

  const outsideTotal = minBet;
  const triggerTotalRound = spots * (triggerMainPerSpot + triggerSidePerSpot);

  if (pogHandsHint) {
    if (stakingMode === 'custom') {
      pogHandsHint.innerHTML = spots === 2
        ? `Playing 2 spots with <strong>Custom Main ($${triggerMainPerSpot}/spot)</strong>.`
        : `Playing 1 spot with <strong>Custom Main ($${triggerMainPerSpot}/spot)</strong>.`;
    } else {
      pogHandsHint.innerHTML = spots === 2
        ? `Playing 2 spots requires <strong>2× Table Min ($${minBet * 2}/spot)</strong>.`
        : `Playing 1 spot requires <strong>1× Table Min ($${minBet}/spot)</strong>.`;
    }
  }

  pogPreviewContent.innerHTML = `
    <div style="margin-bottom: 0.35rem;">
      <span style="color: var(--text-muted); font-weight: 600;">🟡 Outside Trigger (RC &gt; ${displayRC}):</span><br>
      &nbsp;&nbsp;1 spot × $${minBet} Main + $0 Side = <strong>$${outsideTotal} / round</strong>
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
    pogStakingModeSelect.value = 'tied';
    pogSpotsOnTrigger = 2;
    pogSideBetInput.value = '25';
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
// SIMULATION CONTROLLER
// --------------------------------------------------------------------------
simStartBtn.addEventListener('click', startFastSimulation);
simStopBtn.addEventListener('click', stopFastSimulation);

function startFastSimulation() {
  initChart();
  
  const isPotOfGold = ruleGameTypeSelect.value === 'free_bet';
  const minBet = parseInt(ruleMinBetInput.value, 10) || 10;
  const spots = isPotOfGold ? pogSpotsOnTrigger : 1;
  const minMainForSpots = spots === 2 ? (minBet * 2) : minBet;
  const rawSideBet = parseInt(pogSideBetInput?.value || '25', 10) || 25;

  let triggerMainPerSpot = minMainForSpots;
  if (pogStakingModeSelect.value === 'tied') {
    triggerMainPerSpot = Math.max(minMainForSpots, rawSideBet);
  } else if (pogStakingModeSelect.value === 'custom') {
    const customVal = parseInt(pogTriggerMainBetInput?.value || '', 10);
    triggerMainPerSpot = isNaN(customVal) ? minBet : Math.max(1, customVal);
  } else if (pogStakingModeSelect.value === 'unconstrained') {
    triggerMainPerSpot = minMainForSpots;
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
      handsOnTrigger: spots,
      sideBetAmount: rawSideBet,
      sideBetCapType: (pogStakingModeSelect.value === 'tied' ? 'tied' : pogSideBetCapSelect.value) as any,
      sideBetCapValue: pogSideBetCapSelect.value === 'custom' ? parseInt(pogCustomCapInput?.value || '25', 10) || 25 : undefined,
      mainBetNotation: minBet,
      triggerMainBetNotation: `${spots}x${triggerMainPerSpot}`,
      raiseMainOnTrigger: pogStakingModeSelect.value === 'tied' || pogStakingModeSelect.value === 'custom',
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
  const nSeats = config.seatsPerTable;
  let handsPerHour = 60;
  if (nSeats === 1) handsPerHour = 246;
  else if (nSeats === 2) handsPerHour = 139;
  else if (nSeats === 3) handsPerHour = 104;
  else if (nSeats === 4) handsPerHour = 83;
  else if (nSeats === 5) handsPerHour = 70;

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

  if (progress.completed) {
    stopFastSimulation();
  }
}

// --------------------------------------------------------------------------
// APP INITS
// --------------------------------------------------------------------------
renderBetSpreadEditor();
initChart();
updatePogPreview();
