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
let betSpread: Record<number, number> = {
  [-3]: 10,
  [-2]: 10,
  [-1]: 10,
  [0]: 10,
  [1]: 20,
  [2]: 50,
  [3]: 100,
  [4]: 150,
  [5]: 250,
  [6]: 350
};

// UI Elements
const ruleDecksInput = document.getElementById('rule-decks') as HTMLInputElement;
const ruleSoft17Select = document.getElementById('rule-soft17') as HTMLSelectElement;
const ruleBlackjackPayoutSelect = document.getElementById('rule-blackjack-payout') as HTMLSelectElement;
const rulePenetrationInput = document.getElementById('rule-penetration') as HTMLInputElement;
const ruleDasSelect = document.getElementById('rule-das') as HTMLSelectElement;
const ruleSurrenderSelect = document.getElementById('rule-surrender') as HTMLSelectElement;
const ruleMinBetInput = document.getElementById('rule-minbet') as HTMLInputElement;
const ruleMaxBetInput = document.getElementById('rule-maxbet') as HTMLInputElement;
const ruleRoundingSelect = document.getElementById('rule-rounding') as HTMLSelectElement;

const playSeatsInput = document.getElementById('play-seats') as HTMLInputElement;
const playBankrollInput = document.getElementById('play-bankroll') as HTMLInputElement;
const betSpreadContainer = document.getElementById('bet-spread-container') as HTMLDivElement;

const simHandsSelect = document.getElementById('sim-hands') as HTMLSelectElement;
const simStartBtn = document.getElementById('sim-start-btn') as HTMLButtonElement;
const simStopBtn = document.getElementById('sim-stop-btn') as HTMLButtonElement;

const statHands = document.getElementById('stat-hands') as HTMLSpanElement;
const statRtp = document.getElementById('stat-rtp') as HTMLSpanElement;
const statProfit = document.getElementById('stat-profit') as HTMLSpanElement;
const statRuins = document.getElementById('stat-ruins') as HTMLSpanElement;
const statHourlyProfit = document.getElementById('stat-hourly-profit') as HTMLSpanElement;
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
    betInput.type = 'number';
    betInput.className = 'bet-spread-input';
    betInput.value = betSpread[count].toString();
    betInput.min = '1';
    betInput.addEventListener('change', () => {
      const val = parseInt(betInput.value, 10);
      if (!isNaN(val) && val > 0) {
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
      if (betSpread[numKey] < minVal) {
        betSpread[numKey] = minVal;
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
            font: { family: 'Outfit', weight: 'bold' }
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

function updateChart(progress: SimulationProgress) {
  if (!chart) return;

  // Anthropic style qualitative color palette
  const colors = ['#191919', '#991b1b', '#15803d', '#b45309', '#2563eb'];
  
  chart.data.labels = progress.sampleIndices.map(h => `${h.toLocaleString()} hands`);

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

  chart.update('none');
}

// --------------------------------------------------------------------------
// SIMULATION CONTROLLER
// --------------------------------------------------------------------------
simStartBtn.addEventListener('click', startFastSimulation);
simStopBtn.addEventListener('click', stopFastSimulation);

function startFastSimulation() {
  initChart();
  
  const rules: GameRules = {
    numDecks: parseInt(ruleDecksInput.value, 10),
    hitSoft17: ruleSoft17Select.value === 'hit',
    payoutBlackjack: parseFloat(ruleBlackjackPayoutSelect.value),
    doubleAfterSplit: ruleDasSelect.value === 'true',
    maxSplits: 3,
    surrenderAllowed: ruleSurrenderSelect.value === 'true',
    penetration: parseInt(rulePenetrationInput.value, 10) / 100,
    minBet: parseInt(ruleMinBetInput.value, 10),
    maxBet: parseInt(ruleMaxBetInput.value, 10)
  };

  const config: SimulationConfig = {
    rules,
    numPlayers: parseInt(playSeatsInput.value, 10),
    startingBankroll: parseInt(playBankrollInput.value, 10),
    betSpread,
    totalHandsToSimulate: parseInt(simHandsSelect.value, 10),
    updateInterval: Math.max(10, Math.floor(parseInt(simHandsSelect.value, 10) / 100)),
    roundTrueCount: ruleRoundingSelect.value as 'whole' | 'half' | 'floor'
  };

  simStartBtn.style.display = 'none';
  simStopBtn.style.display = 'inline-flex';
  setInputsDisabled(true);

  statHands.textContent = '0';
  statRtp.textContent = '0.00%';
  statProfit.textContent = '$0';
  statRuins.textContent = '0';
  statHourlyProfit.textContent = '$0/hr';
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
  playBankrollInput.disabled = disabled;
  simHandsSelect.disabled = disabled;

  const inputs = betSpreadContainer.querySelectorAll('input');
  inputs.forEach(input => input.disabled = disabled);
}

function renderProgress(progress: SimulationProgress, config: SimulationConfig) {
  statHands.textContent = progress.handsPlayed.toLocaleString();
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

  const nPlayers = config.numPlayers;
  let handsPerHour = 60;
  if (nPlayers === 1) handsPerHour = 209;
  else if (nPlayers === 2) handsPerHour = 139;
  else if (nPlayers === 3) handsPerHour = 104;
  else if (nPlayers === 4) handsPerHour = 83;
  else if (nPlayers === 5) handsPerHour = 70;

  const hours = progress.handsPlayed / handsPerHour;
  const tableHourlyProfit = hours > 0 ? totalProfitValue / hours : 0;
  
  statHourlyProfit.textContent = (tableHourlyProfit >= 0 ? '+' : '') + `$${Math.round(tableHourlyProfit).toLocaleString()}/hr`;
  statHourlyProfit.parentElement!.parentElement!.className = `stat-card ${tableHourlyProfit >= 0 ? 'success' : 'danger'}`;

  seatsTableBody.innerHTML = '';
  for (let i = 0; i < config.numPlayers; i++) {
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

  updateChart(progress);

  if (progress.completed) {
    stopFastSimulation();
  }
}

// --------------------------------------------------------------------------
// APP INITS
// --------------------------------------------------------------------------
renderBetSpreadEditor();
initChart();
