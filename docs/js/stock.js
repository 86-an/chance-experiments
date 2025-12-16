// 株式投資シミュレーター
(function() {
    'use strict';

    let assetChart = null;

    // プリセット設定
    const presets = {
        sp500: {
            return: 7,
            volatility: 18,
            dividend: 1.5,
            fee: 0.1,
            mode: 'montecarlo',
            account: 'nisa'
        },
        domestic: {
            return: 4.5,
            volatility: 12,
            dividend: 2.5,
            fee: 0.2,
            mode: 'fixed',
            account: 'nisa'
        },
        custom: {
            return: 7,
            volatility: 18,
            dividend: 1.5,
            fee: 0.1,
            mode: 'montecarlo',
            account: 'nisa'
        }
    };

    // プリセット適用
    window.applyPreset = function(presetName) {
        const preset = presets[presetName];
        if (!preset) return;

        document.getElementById('inpReturn').value = preset.return;
        document.getElementById('inpVolatility').value = preset.volatility;
        document.getElementById('inpDividend').value = preset.dividend;
        document.getElementById('inpFee').value = preset.fee;
        document.getElementById('selMode').value = preset.mode;
        document.getElementById('selAccount').value = preset.account;
    };

    // 初期資金のみチェックボックスの制御
    document.addEventListener('DOMContentLoaded', () => {
        const chkInitialOnly = document.getElementById('chkInitialOnly');
        const monthlyContainer = document.getElementById('monthlyContainer');
        const inpMonthly = document.getElementById('inpMonthly');

        chkInitialOnly.addEventListener('change', () => {
            if (chkInitialOnly.checked) {
                inpMonthly.value = 0;
                inpMonthly.disabled = true;
                monthlyContainer.style.opacity = '0.5';
            } else {
                inpMonthly.disabled = false;
                monthlyContainer.style.opacity = '1';
            }
        });
    });

    // パラメータ取得
    function getParameters() {
        const initialOnly = document.getElementById('chkInitialOnly').checked;
        
        return {
            initial: parseFloat(document.getElementById('inpInitial').value),
            years: parseInt(document.getElementById('inpYears').value),
            monthly: initialOnly ? 0 : parseFloat(document.getElementById('inpMonthly').value),
            returnRate: parseFloat(document.getElementById('inpReturn').value) / 100,
            volatility: parseFloat(document.getElementById('inpVolatility').value) / 100,
            dividend: parseFloat(document.getElementById('inpDividend').value) / 100,
            fee: parseFloat(document.getElementById('inpFee').value) / 100,
            inflation: parseFloat(document.getElementById('inpInflation').value) / 100,
            savingsRate: parseFloat(document.getElementById('inpSavingsRate').value) / 100,
            mode: document.getElementById('selMode').value,
            account: document.getElementById('selAccount').value,
            taxRate: document.getElementById('selAccount').value === 'nisa' ? 0 : 0.20315,
            strategies: {
                reinvest: document.getElementById('chkReinvest').checked,
                hold: document.getElementById('chkHold').checked,
                savings: document.getElementById('chkSavings').checked
            }
        };
    }

    // 正規分布乱数生成（Box-Muller法）
    function generateNormalRandom(mean, stdDev) {
        const u1 = Math.random();
        const u2 = Math.random();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + z0 * stdDev;
    }

    // 再投資戦略シミュレーション
    function simulateReinvest(params) {
        const timeline = [params.initial];
        let principal = params.initial;
        const dividends = [];
        let totalDividend = 0;
        let totalFee = 0;
        let totalTax = 0;
        let maxDrawdown = 0;
        let peak = params.initial;

        for (let year = 1; year <= params.years; year++) {
            // 年次リターン計算
            let yearReturn = params.mode === 'fixed' 
                ? params.returnRate 
                : generateNormalRandom(params.returnRate, params.volatility);

            // 配当計算
            const yearDividend = principal * params.dividend;
            const dividendTax = yearDividend * params.taxRate;
            const netDividend = yearDividend - dividendTax;
            
            totalDividend += netDividend;
            totalTax += dividendTax;

            // 配当を再投資
            principal += netDividend;

            // 積立追加
            const yearlyAddition = params.monthly * 12;
            principal += yearlyAddition;

            // リターン適用
            principal *= (1 + yearReturn);

            // 手数料控除
            const yearFee = principal * params.fee;
            principal -= yearFee;
            totalFee += yearFee;

            // ドローダウン計算
            if (principal > peak) {
                peak = principal;
            } else {
                const drawdown = (peak - principal) / peak;
                maxDrawdown = Math.max(maxDrawdown, drawdown);
            }

            timeline.push(principal);
        }

        return {
            timeline,
            finalAsset: principal,
            totalDividend,
            totalFee,
            totalTax,
            maxDrawdown
        };
    }

    // ホールド戦略シミュレーション
    function simulateHold(params) {
        const timeline = [params.initial];
        let principal = params.initial;
        let cash = 0;
        let totalDividend = 0;
        let totalFee = 0;
        let totalTax = 0;
        let maxDrawdown = 0;
        let peak = params.initial;

        for (let year = 1; year <= params.years; year++) {
            let yearReturn = params.mode === 'fixed' 
                ? params.returnRate 
                : generateNormalRandom(params.returnRate, params.volatility);

            // 配当は現金で保持
            const yearDividend = principal * params.dividend;
            const dividendTax = yearDividend * params.taxRate;
            const netDividend = yearDividend - dividendTax;
            
            cash += netDividend;
            totalDividend += netDividend;
            totalTax += dividendTax;

            // 積立追加
            const yearlyAddition = params.monthly * 12;
            principal += yearlyAddition;

            // リターン適用（配当は再投資しない）
            principal *= (1 + yearReturn);

            // 手数料控除
            const yearFee = principal * params.fee;
            principal -= yearFee;
            totalFee += yearFee;

            // 総資産 = 株式 + 現金
            const totalAsset = principal + cash;

            // ドローダウン計算
            if (totalAsset > peak) {
                peak = totalAsset;
            } else {
                const drawdown = (peak - totalAsset) / peak;
                maxDrawdown = Math.max(maxDrawdown, drawdown);
            }

            timeline.push(totalAsset);
        }

        return {
            timeline,
            finalAsset: principal + cash,
            totalDividend,
            totalFee,
            totalTax,
            maxDrawdown
        };
    }

    // 貯金戦略シミュレーション
    function simulateSavings(params) {
        const timeline = [params.initial];
        let principal = params.initial;
        let totalInterest = 0;

        for (let year = 1; year <= params.years; year++) {
            // 積立追加
            const yearlyAddition = params.monthly * 12;
            principal += yearlyAddition;

            // 金利適用
            const interest = principal * params.savingsRate;
            principal += interest;
            totalInterest += interest;

            timeline.push(principal);
        }

        return {
            timeline,
            finalAsset: principal,
            totalDividend: totalInterest,
            totalFee: 0,
            totalTax: 0,
            maxDrawdown: 0
        };
    }

    // CAGR計算
    function calculateCAGR(initial, final, years) {
        return Math.pow(final / initial, 1 / years) - 1;
    }

    // シミュレーション実行
    window.runStockSimulation = function() {
        const params = getParameters();
        const errorEl = document.getElementById('error');

        // 戦略選択チェック
        if (!params.strategies.reinvest && !params.strategies.hold && !params.strategies.savings) {
            errorEl.textContent = '少なくとも1つの戦略を選択してください。';
            errorEl.style.display = 'block';
            return;
        }

        errorEl.style.display = 'none';

        // シミュレーション実行
        const results = {};
        
        if (params.strategies.reinvest) {
            results.reinvest = simulateReinvest(params);
        }
        if (params.strategies.hold) {
            results.hold = simulateHold(params);
        }
        if (params.strategies.savings) {
            results.savings = simulateSavings(params);
        }

        // 結果表示
        displayResults(results, params);
    };

    // 結果表示
    function displayResults(results, params) {
        // グラフ描画
        drawChart(results, params.years);

        // 比較表作成
        createComparisonTable(results, params);

        // 詳細統計表示
        displayDetailedStats(results, params);

        // 結果エリア表示
        document.getElementById('results').style.display = 'block';
    }

    // グラフ描画
    function drawChart(results, years) {
        const ctx = document.getElementById('assetChart').getContext('2d');
        
        if (assetChart) {
            assetChart.destroy();
        }

        const labels = Array.from({length: years + 1}, (_, i) => `${i}年`);
        const datasets = [];

        if (results.reinvest) {
            datasets.push({
                label: '再投資（複利）',
                data: results.reinvest.timeline,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4
            });
        }

        if (results.hold) {
            datasets.push({
                label: 'ホールド（配当現金）',
                data: results.hold.timeline,
                borderColor: '#ffa726',
                backgroundColor: 'rgba(255, 167, 38, 0.1)',
                tension: 0.4
            });
        }

        if (results.savings) {
            datasets.push({
                label: '貯金',
                data: results.savings.timeline,
                borderColor: '#66bb6a',
                backgroundColor: 'rgba(102, 187, 106, 0.1)',
                tension: 0.4
            });
        }

        assetChart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': ¥' + context.parsed.y.toLocaleString();
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '¥' + (value / 10000).toFixed(0) + '万';
                            }
                        }
                    }
                }
            }
        });
    }

    // 比較表作成
    function createComparisonTable(results, params) {
        const tbody = document.getElementById('comparisonBody');
        tbody.innerHTML = '';

        const metrics = [
            { label: '最終資産額', key: 'finalAsset', format: 'currency' },
            { label: 'CAGR（年平均成長率）', key: 'cagr', format: 'percent' },
            { label: '最大ドローダウン', key: 'maxDrawdown', format: 'percent' },
            { label: '累積配当/利息', key: 'totalDividend', format: 'currency' },
            { label: '税・手数料総額', key: 'totalCost', format: 'currency' },
            { label: 'インフレ調整後資産', key: 'realAsset', format: 'currency' }
        ];

        metrics.forEach(metric => {
            const row = document.createElement('tr');
            row.innerHTML = `<td><strong>${metric.label}</strong></td>`;

            ['reinvest', 'hold', 'savings'].forEach(strategy => {
                const td = document.createElement('td');
                td.className = 'strategy-col';

                if (results[strategy]) {
                    const result = results[strategy];
                    let value;

                    switch(metric.key) {
                        case 'cagr':
                            value = calculateCAGR(params.initial, result.finalAsset, params.years);
                            td.textContent = (value * 100).toFixed(2) + '%';
                            break;
                        case 'totalCost':
                            value = result.totalFee + result.totalTax;
                            td.textContent = '¥' + value.toLocaleString(undefined, {maximumFractionDigits: 0});
                            break;
                        case 'realAsset':
                            value = result.finalAsset / Math.pow(1 + params.inflation, params.years);
                            td.textContent = '¥' + value.toLocaleString(undefined, {maximumFractionDigits: 0});
                            break;
                        default:
                            value = result[metric.key];
                            if (metric.format === 'currency') {
                                td.textContent = '¥' + value.toLocaleString(undefined, {maximumFractionDigits: 0});
                            } else if (metric.format === 'percent') {
                                td.textContent = (value * 100).toFixed(2) + '%';
                            } else {
                                td.textContent = value.toLocaleString();
                            }
                    }
                } else {
                    td.textContent = '-';
                }

                row.appendChild(td);
            });

            tbody.appendChild(row);
        });
    }

    // 詳細統計表示
    function displayDetailedStats(results, params) {
        const container = document.getElementById('detailedStats');
        container.innerHTML = '';

        Object.entries(results).forEach(([strategy, result]) => {
            const strategyNames = {
                reinvest: '再投資（複利）',
                hold: 'ホールド',
                savings: '貯金'
            };

            const card = document.createElement('div');
            card.className = 'stat-card';
            card.innerHTML = `
                <h4>${strategyNames[strategy]}</h4>
                <div class="value">¥${(result.finalAsset / 10000).toFixed(0)}万円</div>
                <div style="margin-top: 1rem; font-size: 0.9rem;">
                    <div>投資元本: ¥${((params.initial + params.monthly * 12 * params.years) / 10000).toFixed(0)}万円</div>
                    <div>運用益: ¥${((result.finalAsset - params.initial - params.monthly * 12 * params.years) / 10000).toFixed(0)}万円</div>
                </div>
            `;
            container.appendChild(card);
        });
    }

})();