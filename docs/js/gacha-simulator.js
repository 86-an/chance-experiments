// ガチャシミュレーター
class GachaSimulator {
    constructor() {
        this.gachaData = null;
        this.chart = null;
        this.loadGachaData();
    }

    // JSONデータを読み込み
    async loadGachaData() {
        try {
            const response = await fetch('../data/gacha-rarity-job.json');
            this.gachaData = await response.json();
            console.log('ガチャデータを読み込みました:', this.gachaData);
        } catch (error) {
            console.error('ガチャデータの読み込みに失敗しました:', error);
        }
    }

    // ガチャを1回引く
    drawSingleGacha() {
        if (!this.gachaData) return null;

        const rand = Math.random();
        const rates = this.gachaData.rarity_rates;
        const jobs = this.gachaData.job_classes;
        
        let cumulative = 0;
        let selectedRarity = null;

        // レア度を決定
        for (const [rarity, rate] of Object.entries(rates)) {
            cumulative += rate;
            if (rand <= cumulative) {
                selectedRarity = rarity;
                break;
            }
        }

        // キャラクターを決定
        const availableJobs = jobs[selectedRarity];
        const randomJobIndex = Math.floor(Math.random() * availableJobs.length);
        const selectedJob = availableJobs[randomJobIndex];

        return {
            rarity: selectedRarity,
            character: selectedJob
        };
    }

    // 10連ガチャを引く
    draw10Gacha() {
        const results = [];
        for (let i = 0; i < 10; i++) {
            results.push(this.drawSingleGacha());
        }
        return results;
    }

    // シミュレーション実行
    runSimulation(totalCards) {
        const startTime = performance.now();
        const trials = totalCards / 10; // 10連の回数
        const allResults = [];
        const rarityCount = { UR: 0, SSR: 0, SR: 0, R: 0, N: 0 };
        const characterCount = {};
        const ssrPlusTenDraws = []; // SSR以上が出た10連の記録

        // 全キャラクターのカウンターを初期化
        Object.values(this.gachaData.job_classes).flat().forEach(char => {
            characterCount[char] = 0;
        });

        // シミュレーション実行
        for (let trial = 0; trial < trials; trial++) {
            const tenDrawResults = this.draw10Gacha();
            let hasSSRPlus = false;

            tenDrawResults.forEach(result => {
                allResults.push(result);
                rarityCount[result.rarity]++;
                characterCount[result.character]++;

                if (result.rarity === 'UR' || result.rarity === 'SSR') {
                    hasSSRPlus = true;
                }
            });

            if (hasSSRPlus) {
                ssrPlusTenDraws.push({
                    trial: trial + 1,
                    results: tenDrawResults
                });
            }
        }

        const endTime = performance.now();
        const executionTime = endTime - startTime;

        return {
            totalTrials: trials,
            totalCards,
            allResults,
            rarityCount,
            characterCount,
            ssrPlusTenDraws,
            executionTime: executionTime.toFixed(2)
        };
    }

    // 統計分析
    analyzeResults(simulationData) {
        const { totalCards, rarityCount, characterCount, ssrPlusTenDraws } = simulationData;

        // レア度別統計
        const rarityStats = {};
        Object.entries(this.gachaData.rarity_rates).forEach(([rarity, expectedRate]) => {
            const actualCount = rarityCount[rarity];
            const actualRate = actualCount / totalCards;
            const difference = actualRate - expectedRate;

            rarityStats[rarity] = {
                expected: expectedRate,
                actual: actualRate,
                count: actualCount,
                difference: difference
            };
        });

        // キャラクター別統計（レア度ごと）
        const characterStats = {};
        Object.entries(this.gachaData.job_classes).forEach(([rarity, characters]) => {
            characterStats[rarity] = {};
            const totalRarityCount = rarityCount[rarity];

            characters.forEach(character => {
                const count = characterCount[character];
                const rate = totalRarityCount > 0 ? count / totalRarityCount : 0;

                characterStats[rarity][character] = {
                    count,
                    rate,
                    percentage: (count / totalCards * 100).toFixed(3)
                };
            });
        });

        // SSR以上の統計
        const ssrPlusStats = {
            totalSSRPlusDraws: ssrPlusTenDraws.length,
            ssrPlusRate: (ssrPlusTenDraws.length / simulationData.totalTrials * 100).toFixed(2),
            urInterval: rarityCount.UR > 0 ? Math.round(totalCards / rarityCount.UR) : 0,
            ssrInterval: rarityCount.SSR > 0 ? Math.round(totalCards / rarityCount.SSR) : 0
        };

        return {
            rarityStats,
            characterStats,
            ssrPlusStats
        };
    }

    // 結果をHTMLに表示
    displayResults(simulationData, analysisData) {
        // 基本統計の表示
        document.getElementById('totalTrials').textContent = simulationData.totalTrials.toLocaleString() + '回';
        document.getElementById('totalCards').textContent = simulationData.totalCards.toLocaleString() + '体';
        document.getElementById('executionTime').textContent = simulationData.executionTime + 'ms';

        // レア度テーブルの更新
        this.updateRarityTable(analysisData.rarityStats);

        // グラフの更新
        this.updateChart(simulationData.rarityCount);

        // キャラクター分析の表示
        this.displayCharacterAnalysis(analysisData.characterStats);

        // 詳細統計の表示
        this.displayDetailedStats(analysisData);

        // SSR統計の表示
        this.displaySSRStats(analysisData.ssrPlusStats, simulationData);

        // 結果エリアを表示
        document.getElementById('results').style.display = 'block';
    }

    // レア度テーブルの更新
    updateRarityTable(rarityStats) {
        const tbody = document.getElementById('rarityTableBody');
        tbody.innerHTML = '';

        Object.entries(rarityStats).forEach(([rarity, stats]) => {
            const row = document.createElement('tr');
            const differencePercent = (stats.difference * 100).toFixed(3);
            const differenceColor = stats.difference >= 0 ? 'green' : 'red';

            row.innerHTML = `
                <td class="rarity-${rarity.toLowerCase()}">${rarity}</td>
                <td>${(stats.expected * 100).toFixed(2)}%</td>
                <td>${(stats.actual * 100).toFixed(3)}%</td>
                <td>${stats.count.toLocaleString()}</td>
                <td style="color: ${differenceColor};">${differencePercent >= 0 ? '+' : ''}${differencePercent}%</td>
            `;
            tbody.appendChild(row);
        });
    }

    // グラフの更新
    updateChart(rarityCount) {
        const ctx = document.getElementById('rarityChart').getContext('2d');

        if (this.chart) {
            this.chart.destroy();
        }

        const data = {
            labels: Object.keys(rarityCount),
            datasets: [{
                label: '排出数',
                data: Object.values(rarityCount),
                backgroundColor: [
                    '#ff6b6b', // UR
                    '#ffa726', // SSR
                    '#42a5f5', // SR
                    '#66bb6a', // R
                    '#78909c'  // N
                ],
                borderColor: [
                    '#e74c3c',
                    '#f39c12',
                    '#3498db',
                    '#27ae60',
                    '#95a5a6'
                ],
                borderWidth: 2
            }]
        };

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'レア度別排出数',
                    font: {
                        size: 16
                    }
                },
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    }
                }
            }
        };

        this.chart = new Chart(ctx, {
            type: 'bar',
            data: data,
            options: options
        });
    }

    // キャラクター分析の表示
    displayCharacterAnalysis(characterStats) {
        const container = document.getElementById('characterAnalysis');
        container.innerHTML = '';

        Object.entries(characterStats).forEach(([rarity, characters]) => {
            const section = document.createElement('div');
            section.innerHTML = `<h3 class="rarity-${rarity.toLowerCase()}">${rarity}レア キャラクター分析</h3>`;

            const table = document.createElement('table');
            table.innerHTML = `
                <thead>
                    <tr>
                        <th>キャラクター</th>
                        <th>排出数</th>
                        <th>全体に占める割合</th>
                        <th>同レア内割合</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;

            const tbody = table.querySelector('tbody');
            
            // 排出数でソート
            const sortedCharacters = Object.entries(characters).sort((a, b) => b[1].count - a[1].count);

            sortedCharacters.forEach(([character, stats]) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${character}</td>
                    <td>${stats.count.toLocaleString()}</td>
                    <td>${stats.percentage}%</td>
                    <td>${(stats.rate * 100).toFixed(2)}%</td>
                `;
                tbody.appendChild(row);
            });

            section.appendChild(table);
            container.appendChild(section);
        });
    }

    // 詳細統計の表示
    displayDetailedStats(analysisData) {
        const container = document.getElementById('detailedStats');
        container.innerHTML = '';

        // 各レア度の偏差計算
        Object.entries(analysisData.characterStats).forEach(([rarity, characters]) => {
            const rates = Object.values(characters).map(char => char.rate);
            const avgRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
            const variance = rates.reduce((sum, rate) => sum + Math.pow(rate - avgRate, 2), 0) / rates.length;
            const stdDev = Math.sqrt(variance);

            const statCard = document.createElement('div');
            statCard.className = 'stat-card';
            statCard.innerHTML = `
                <h3>${rarity}レア 統計</h3>
                <div>平均出現率: ${(avgRate * 100).toFixed(2)}%</div>
                <div>標準偏差: ±${(stdDev * 100).toFixed(2)}%</div>
            `;
            container.appendChild(statCard);
        });
    }

    // SSR統計の表示
    displaySSRStats(ssrPlusStats, simulationData) {
        const container = document.getElementById('ssrStats');
        container.innerHTML = '';

        const stats = [
            {
                title: 'SSR以上が出た10連',
                value: `${ssrPlusStats.totalSSRPlusDraws}回 (${ssrPlusStats.ssrPlusRate}%)`
            },
            {
                title: 'UR排出間隔',
                value: ssrPlusStats.urInterval > 0 ? `${ssrPlusStats.urInterval}回に1回` : '排出なし'
            },
            {
                title: 'SSR排出間隔',
                value: ssrPlusStats.ssrInterval > 0 ? `${ssrPlusStats.ssrInterval}回に1回` : '排出なし'
            },
            {
                title: 'UR+SSR総数',
                value: `${(simulationData.rarityCount.UR + simulationData.rarityCount.SSR).toLocaleString()}体`
            }
        ];

        stats.forEach(stat => {
            const statCard = document.createElement('div');
            statCard.className = 'stat-card';
            statCard.innerHTML = `
                <h3>${stat.title}</h3>
                <div class="stat-value">${stat.value}</div>
            `;
            container.appendChild(statCard);
        });
    }
}

// グローバル変数
let simulator = null;

// 初期化
document.addEventListener('DOMContentLoaded', function() {
    simulator = new GachaSimulator();
});

// シミュレーション実行関数
async function runSimulation(totalCards) {
    if (!simulator || !simulator.gachaData) {
        alert('ガチャデータの読み込みが完了していません。しばらく待ってから再試行してください。');
        return;
    }

    // ローディング表示
    document.getElementById('loadingMessage').style.display = 'block';
    document.getElementById('results').style.display = 'none';

    // UIの更新を待つため、短い遅延を入れる
    setTimeout(() => {
        try {
            console.log(`シミュレーション開始: ${totalCards}体 (${totalCards/10}回の10連)`);
            
            // シミュレーション実行
            const simulationData = simulator.runSimulation(totalCards);
            
            // 統計分析
            const analysisData = simulator.analyzeResults(simulationData);
            
            // 結果表示
            simulator.displayResults(simulationData, analysisData);
            
            console.log('シミュレーション完了');
            
        } catch (error) {
            console.error('シミュレーション中にエラーが発生しました:', error);
            alert('シミュレーション中にエラーが発生しました。コンソールを確認してください。');
        } finally {
            // ローディング非表示
            document.getElementById('loadingMessage').style.display = 'none';
        }
    }, 100);
}